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


/* ---------- recovery codes: the way back in if you forget your password ---------- */
const RC_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I
function newRecoveryCode() { const b = crypto.getRandomValues(new Uint8Array(16)); let s = ''; for (let i = 0; i < 16; i++) { s += RC_ALPHA[b[i] % 32]; if (i % 4 === 3 && i < 15) s += '-'; } return s; }
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function setRecovery(env, userId) {
  const code = newRecoveryCode(); const salt = randomHex(16);
  await env.DB.prepare('UPDATE users SET recovery_hash = ?, recovery_salt = ? WHERE id = ?').bind(await hashPassword(normCode(code), salt), salt, userId).run();
  return code;
}
async function recover(request, env) {
  const body = await readBody(request);
  const username = String(body?.username || '').trim(); const code = normCode(body?.code); const password = String(body?.password || '');
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await allowAttempt(env, `recover-ip:${ip}`, 10, 3600e3)) || !(await allowAttempt(env, `recover-user:${username.toLowerCase()}`, 5, 3600e3))) return error('Too many attempts. Try again in an hour.', 429);
  if (password.length < 8) return error('Use at least 8 characters for your new password.');
  if (password.length > 200) return error('That password is too long.');
  const u = await env.DB.prepare('SELECT id, username, recovery_hash, recovery_salt FROM users WHERE username = ?').bind(username).first();
  if (!u || !u.recovery_hash || !timingSafeEqual(await hashPassword(code, u.recovery_salt), u.recovery_hash)) return error('That username and recovery code don’t match.', 401);
  const salt = randomHex(16);
  await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(await hashPassword(password, salt), salt, u.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
  const fresh = await setRecovery(env, u.id);   // each code works once
  return json({ token: await createSession(env, u.id), user: { id: u.id, username: u.username }, recoveryCode: fresh });
}

/* ---------- daily stats: plain counters, no cookies, no IPs stored ---------- */
const STAT_KEYS = new Set(['visit', 'game_bot', 'game_online', 'game_local', 'review', 'puzzle', 'drill', 'course', 'import', 'share', 'install', 'signup']);
async function bump(env, k, by = 1) { const day = new Date().toISOString().slice(0, 10); await env.DB.prepare('INSERT INTO daily_stats (day, k, n) VALUES (?, ?, ?) ON CONFLICT(day, k) DO UPDATE SET n = n + excluded.n').bind(day, k, by).run(); }
async function event(request, env) {
  const body = await readBody(request); const k = String(body?.k || '');
  if (!STAT_KEYS.has(k) || k === 'signup') return error('Unknown event.');
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await allowAttempt(env, `ev:${k}:${ip}`, k === 'visit' ? 5 : 300, 86400e3))) return json({ ok: true });
  await bump(env, k); return json({ ok: true });
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
  const recoveryCode = await setRecovery(env, id); await bump(env, 'signup').catch(() => { });
  return json({ token: await createSession(env, id), user: { id, username }, recoveryCode }, 201);
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


/* ---------- game import (public chess.com / Lichess data) ---------- */
const UA = { 'User-Agent': 'NextMove/1.0 (+https://nextmove.gg; chess training site)' };
function pgnTag(pgn, tag) { const m = pgn.match(new RegExp('\\[' + tag + ' "([^"]*)"\\]')); return m ? m[1] : ''; }
async function importGames(url, env, ctx) {
  const site = url.searchParams.get('site'); const user = (url.searchParams.get('user') || '').trim();
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(user)) return error('Enter a valid username.');
  if (!['chesscom', 'lichess'].includes(site)) return error('Pick Chess.com or Lichess.');
  const cache = caches.default; const key = new Request(`https://cache.nextmove.gg/import/${site}/${user.toLowerCase()}`);
  const hit = await cache.match(key); if (hit) return hit;
  let games = [];
  if (site === 'chesscom') {
    const ar = await fetch(`https://api.chess.com/pub/player/${user.toLowerCase()}/games/archives`, { headers: UA });
    if (ar.status === 404) return error('No Chess.com player with that username.', 404);
    if (!ar.ok) return error('Chess.com did not answer. Try again in a minute.', 502);
    const months = ((await ar.json()).archives || []).slice(-2).reverse();
    for (const m of months) {
      const r = await fetch(m, { headers: UA }); if (!r.ok) continue;
      const list = ((await r.json()).games || []).filter(g => g.pgn && (g.rules || 'chess') === 'chess').reverse();
      for (const g of list) {
        const me = g.white.username.toLowerCase() === user.toLowerCase() ? 'w' : 'b';
        games.push({ id: 'cc-' + (g.uuid || g.url), site, url: g.url, pgn: g.pgn, white: g.white.username, black: g.black.username, whiteElo: g.white.rating, blackElo: g.black.rating, result: pgnTag(g.pgn, 'Result') || '*', date: (pgnTag(g.pgn, 'Date') || '').replace(/\./g, '-'), time: g.time_class || '', end: g.end_time || 0, me });
        if (games.length >= 40) break;
      }
      if (games.length >= 40) break;
    }
  } else {
    const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=40&pgnInJson=true&clocks=false&evals=false&opening=true`, { headers: { ...UA, Accept: 'application/x-ndjson' } });
    if (r.status === 404) return error('No Lichess player with that username.', 404);
    if (!r.ok) return error('Lichess did not answer. Try again in a minute.', 502);
    const lines = (await r.text()).split('\n').filter(Boolean);
    for (const l of lines) {
      let g; try { g = JSON.parse(l); } catch (e) { continue; }
      if (g.variant && g.variant !== 'standard' && g.variant !== 'fromPosition') continue;
      const w = g.players.white, b = g.players.black; const wn = (w.user && w.user.name) || 'Anonymous', bn = (b.user && b.user.name) || 'Anonymous';
      const me = wn.toLowerCase() === user.toLowerCase() ? 'w' : 'b';
      games.push({ id: 'li-' + g.id, site, url: 'https://lichess.org/' + g.id, pgn: g.pgn, white: wn, black: bn, whiteElo: w.rating, blackElo: b.rating, result: pgnTag(g.pgn || '', 'Result') || '*', date: new Date(g.createdAt).toISOString().slice(0, 10), time: g.speed || '', end: g.lastMoveAt || g.createdAt, me });
    }
  }
  const res = json({ user, site, games });
  res.headers.set('Cache-Control', 'public, max-age=300');
  ctx && ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function handleApi(request, env, url, ctx) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/import' && method === 'GET') return importGames(url, env, ctx);
  if (path === '/api/signup' && method === 'POST') return signup(request, env);
  if (path === '/api/recover' && method === 'POST') return recover(request, env);
  if (path === '/api/ev' && method === 'POST') return event(request, env);
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

  if (path === '/api/me' && method === 'GET') {
    const row = await env.DB.prepare('SELECT email, recovery_hash FROM users WHERE id = ?').bind(user.id).first();
    return json({ user: { id: user.id, username: user.username, email: row?.email || null, hasRecovery: !!row?.recovery_hash, admin: (env.ADMINS || '').toLowerCase().split(',').map(x => x.trim()).includes(user.username.toLowerCase()) } });
  }
  if (path === '/api/recovery' && method === 'POST') return json({ recoveryCode: await setRecovery(env, user.id) });
  if (path === '/api/email' && method === 'PUT') {
    const body = await readBody(request); const email = String(body?.email || '').trim();
    if (email && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200)) return error('That email doesn’t look right.');
    await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email || null, user.id).run();
    return json({ ok: true, email: email || null });
  }
  if (path === '/api/stats' && method === 'GET') {
    const admins = (env.ADMINS || '').toLowerCase().split(',').map(x => x.trim());
    if (!admins.includes(user.username.toLowerCase())) return error('Not allowed.', 403);
    const since = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
    const rows = await env.DB.prepare('SELECT day, k, n FROM daily_stats WHERE day >= ? ORDER BY day').bind(since).all();
    const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    return json({ rows: rows.results, users: users.n });
  }
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Always use HTTPS on the real site (same as Cloudflare's "Always Use HTTPS" toggle)
    if (url.protocol === 'http:' && (url.hostname.endsWith('nextmove.gg') || url.hostname.endsWith('.workers.dev'))) {
      return new Response(null, { status: 301, headers: { Location: `https://${url.host}${url.pathname}${url.search}`, 'X-Redirect': 'https' } });
    }
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, url, ctx); }
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
