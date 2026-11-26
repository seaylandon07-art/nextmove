/**
 * NextMove — Cloudflare Worker.
 * Serves the static app, plus a small API:
 *   POST /api/signup, /api/login, /api/logout   accounts (username + password)
 *   GET  /api/me                                current account
 *   GET/PUT /api/state                          the player's saved progress (one JSON blob)
 *   GET  /api/room/:code                        WebSocket room for an online game (Durable Object)
 */
import { DurableObject } from 'cloudflare:workers';

const SESSION_DAYS = 90;
const MAX_STATE_BYTES = 900_000;
const PBKDF2_ITERATIONS = 100_000;
const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const error = (message, status = 400) => json({ error: message }, status);

const enc = new TextEncoder();
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = bytes => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async text => toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return toHex(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Simple fixed-window limiter backed by D1 (per IP and per username).
async function allowAttempt(env, key, limit, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT n, reset FROM attempts WHERE key = ?').bind(key).first();
  if (!row || row.reset < now) {
    await env.DB.prepare('INSERT OR REPLACE INTO attempts (key, n, reset) VALUES (?, 1, ?)').bind(key, now + windowMs).run();
    return true;
  }
  if (row.n >= limit) return false;
  await env.DB.prepare('UPDATE attempts SET n = n + 1 WHERE key = ?').bind(key).run();
  return true;
}

async function createSession(env, userId) {
  const token = randomHex(32);
  const expires = Date.now() + SESSION_DAYS * 864e5;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), userId, expires).run();
  return token;
}

async function currentUser(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.username, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  ).bind(await sha256(token)).first();
  if (!row || row.expires < Date.now()) return null;
  return { id: row.id, username: row.username, tokenHash: await sha256(token) };
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function signup(request, env) {
  const body = await readBody(request);
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  if (!USERNAME_RE.test(username)) return error('Usernames are 3–20 letters, numbers, - or _.');
  if (password.length < 8) return error('Use at least 8 characters for your password.');
  if (password.length > 200) return error('That password is too long.');
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await allowAttempt(env, `signup:${ip}`, 10, 3600e3))) return error('Too many sign-ups from here. Try again later.', 429);
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  if (exists) return error('That username is taken.', 409);
  const id = crypto.randomUUID();
  const salt = randomHex(16);
  await env.DB.prepare('INSERT INTO users (id, username, pass_hash, salt, created) VALUES (?, ?, ?, ?, ?)')
    .bind(id, username, await hashPassword(password, salt), salt, Date.now()).run();
  return json({ token: await createSession(env, id), user: { id, username } }, 201);
}

async function login(request, env) {
  const body = await readBody(request);
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await allowAttempt(env, `login-ip:${ip}`, 30, 900e3)) || !(await allowAttempt(env, `login-user:${username.toLowerCase()}`, 10, 900e3)))
    return error('Too many attempts. Wait 15 minutes and try again.', 429);
  const user = await env.DB.prepare('SELECT id, username, pass_hash, salt FROM users WHERE username = ?').bind(username).first();
  if (!user || !timingSafeEqual(await hashPassword(password, user.salt), user.pass_hash)) return error('Wrong username or password.', 401);
  return json({ token: await createSession(env, user.id), user: { id: user.id, username: user.username } });
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/signup' && method === 'POST') return signup(request, env);
  if (path === '/api/login' && method === 'POST') return login(request, env);

  if (path.startsWith('/api/room/')) {
    const code = path.slice('/api/room/'.length);
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) return error('Bad room code.');
    if (request.headers.get('upgrade') !== 'websocket') return error('Expected a WebSocket.', 426);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(request);
  }

  const user = await currentUser(request, env);
  if (!user) return error('Not signed in.', 401);

  if (path === '/api/me' && method === 'GET') return json({ user: { id: user.id, username: user.username } });
  if (path === '/api/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.tokenHash).run();
    return json({ ok: true });
  }
  if (path === '/api/state' && method === 'GET') {
    const row = await env.DB.prepare('SELECT json, t FROM state WHERE user_id = ?').bind(user.id).first();
    return json(row ? { json: row.json, t: row.t } : { json: null, t: 0 });
  }
  if (path === '/api/state' && method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_STATE_BYTES) return error('Saved data is too large.', 413);
    let body;
    try { body = JSON.parse(text); } catch { return error('Bad JSON.'); }
    if (typeof body.json !== 'string') return error('Missing json.');
    const t = Number(body.t) || Date.now();
    await env.DB.prepare('INSERT INTO state (user_id, json, t) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, t = excluded.t WHERE excluded.t >= state.t')
      .bind(user.id, body.json, t).run();
    return json({ ok: true });
  }
  return error('Not found.', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, url); }
      catch (e) { console.error(e); return error('Server error.', 500); }
    }
    return env.ASSETS.fetch(request);
  },
  // Daily cleanup of expired sessions and old rate-limit rows.
  async scheduled(_event, env) {
    const now = Date.now();
    await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now).run();
    await env.DB.prepare('DELETE FROM attempts WHERE reset < ?').bind(now).run();
  }
};

/**
 * One Durable Object per game code. Everyone connected gets the full list of
 * peers' presence whenever it changes, and "emit" messages are relayed to the others.
 * Uses WebSocket hibernation, so idle games cost nothing.
 */
export class GameRoom extends DurableObject {
  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID(), presence: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  peers(exclude) {
    return this.ctx.getWebSockets().filter(ws => ws !== exclude).map(ws => ws.deserializeAttachment()).filter(a => a && a.presence);
  }

  broadcastPeers(exclude) {
    const peers = this.peers(exclude);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const me = ws.deserializeAttachment();
      try { ws.send(JSON.stringify({ t: 'peers', peers: peers.map(p => ({ id: p.id, you: p.id === me?.id, presence: p.presence })) })); } catch { }
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 64_000) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment() || { id: crypto.randomUUID() };
    if (msg.t === 'presence' && msg.p && typeof msg.p === 'object') {
      ws.serializeAttachment({ ...me, presence: msg.p });
      this.broadcastPeers();
    } else if (msg.t === 'emit' && typeof msg.topic === 'string') {
      const out = JSON.stringify({ t: 'emit', topic: msg.topic, data: msg.data });
      for (const other of this.ctx.getWebSockets()) if (other !== ws) { try { other.send(out); } catch { } }
    } else if (msg.t === 'ping') {
      ws.send('{"t":"pong"}');
    }
  }

  async webSocketClose(ws) { try { ws.close(); } catch { } this.broadcastPeers(ws); }
  async webSocketError(ws) { this.broadcastPeers(ws); }
}
