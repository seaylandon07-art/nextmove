/**
 * NextMove — Cloudflare Worker.
 * Serves the static app, plus a small API:
 *   POST /api/signup, /api/login, /api/logout   accounts (username + password)
 *   GET  /api/me                                current account
 *   GET/PUT /api/state                          the player's saved progress (one JSON blob)
 *   GET  /api/lobby                             WebSocket matchmaking: seek a game, get paired with a room code
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
const STAT_KEYS = new Set(['visit', 'game_bot', 'game_online', 'game_local', 'review', 'puzzle', 'drill', 'course', 'import', 'share', 'install', 'signup', 'plus_view', 'plus_buy']);
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
  if (path === '/api/err' && method === 'POST') {   // client error reports, so we hear about breakage without waiting for players to tell us
    const b = await request.json().catch(() => ({})); const clip = (v, n) => String(v || '').slice(0, n);
    await env.DB.prepare('INSERT INTO errors (t, msg, src, ua, path) VALUES (?, ?, ?, ?, ?)').bind(Date.now(), clip(b.msg, 500), clip(b.src, 300), clip(request.headers.get('user-agent'), 200), clip(b.path, 100)).run();
    return json({ ok: true });
  }
  if (path.startsWith('/api/u/') && method === 'GET') return profile(decodeURIComponent(path.slice(7)), env);
  if (path === '/api/daily' && method === 'GET') return dailyBoard(url, env);
  if (path === '/api/billing/config' && method === 'GET') return json({ enabled: billingOn(env), price: '$2.99', yearly: env.STRIPE_PRICE_YEAR ? '$24.99' : null, trialDays: +(env.TRIAL_DAYS || 0) });
  if (path === '/api/stripe/webhook' && method === 'POST') return stripeWebhook(request, env);
  if (path === '/api/signup' && method === 'POST') return signup(request, env);
  if (path === '/api/recover' && method === 'POST') return recover(request, env);
  if (path === '/api/ev' && method === 'POST') return event(request, env);
  if (path === '/api/login' && method === 'POST') return login(request, env);

  if (path === '/api/lobby') {
    if (request.headers.get('upgrade') !== 'websocket') return error('Expected a WebSocket.', 426);
    return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(request);
  }

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
    const row = await env.DB.prepare('SELECT email, recovery_hash, plan, plan_until, founder, comp FROM users WHERE id = ?').bind(user.id).first();
    const plus = isAdmin(env, user.username) || !!row?.comp || (row?.plan === 'plus' && (row.plan_until || 0) > Date.now());
    return json({ user: { id: user.id, username: user.username, email: row?.email || null, hasRecovery: !!row?.recovery_hash, plan: plus ? 'plus' : 'free', planUntil: row?.plan_until || null, founder: !!row?.founder, comp: !!row?.comp, admin: isAdmin(env, user.username) } });
  }
  if (path.startsWith('/api/admin/')) return admin(path, method, request, env, user);
  if (path === '/api/friends') return friends(method, request, env, user);
  if (path === '/api/report' && method === 'POST') {
    const b = await request.json().catch(() => ({})); const clip = (v, n) => String(v || '').slice(0, n);
    if (!b.username) return error('Who are you reporting?');
    await env.DB.prepare('INSERT INTO reports (t, by_user, target, reason, note, gid) VALUES (?, ?, ?, ?, ?, ?)').bind(Date.now(), user.username, clip(b.username, 40), clip(b.reason, 40), clip(b.note, 500), clip(b.gid, 60)).run();
    return json({ ok: true });
  }
  if (path === '/api/daily' && method === 'POST') {
    const b = await request.json().catch(() => ({})); const d = new Date().toISOString().slice(0, 10);
    if (b.day !== d || !(b.ms > 1500 && b.ms < 3600e3)) return error('That result doesn’t look right.');
    await env.DB.prepare('INSERT INTO daily_results (day, user_id, username, ms, first) VALUES (?, ?, ?, ?, ?) ON CONFLICT(day, user_id) DO NOTHING').bind(d, user.id, user.username, Math.round(b.ms), b.first ? 1 : 0).run();
    return json({ ok: true });
  }
  if (path === '/api/billing/checkout' && method === 'POST') return checkout(request, env, user, await request.json().catch(() => ({})));
  if (path === '/api/billing/portal' && method === 'POST') return portal(request, env, user);
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
    const plus = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE plan = 'plus' AND plan_until > ?").bind(Date.now()).first();
    const comp = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE comp = 1').first();
    const errs = await env.DB.prepare('SELECT t, msg, src, path FROM errors ORDER BY id DESC LIMIT 25').all();
    return json({ rows: rows.results, users: users.n, plus: plus.n, comp: comp.n, errors: errs.results });
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
    if (/^\/u\/[A-Za-z0-9_-]{2,24}\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/profile', url), request));   // public profiles
    return env.ASSETS.fetch(request);
  },
  // Daily cleanup of expired sessions and old rate-limit rows.
  async scheduled(_event, env) {
    const now = Date.now();
    await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now).run();
    await env.DB.prepare('DELETE FROM attempts WHERE reset < ?').bind(now).run();
    await env.DB.prepare('DELETE FROM errors WHERE id NOT IN (SELECT id FROM errors ORDER BY id DESC LIMIT 1000)').run();
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

/**
 * Matchmaking. Players send {t:'seek', tc, r, name}; waiting seeks live in each socket's attachment
 * (so hibernation keeps them). A pair is made when the time controls match and the rating gap fits a
 * window that widens the longer either player waits. Both get the same fresh room code and a colour,
 * then play in a GameRoom exactly like a friend game.
 */
const LOBBY_TCS = ['1+0', '3+2', '5+3', '10+0'];
const ROOM_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export class Lobby extends DurableObject {
  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seek: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'ping') { ws.send('{"t":"pong"}'); return; }
    if (m.t === 'cancel') { ws.serializeAttachment({ seek: null }); return; }
    if (m.t !== 'seek' || !LOBBY_TCS.includes(m.tc)) return;
    const prev = (ws.deserializeAttachment() || {}).seek;
    const r = Math.max(100, Math.min(3200, Math.round(+m.r) || 1000));
    const me = { tc: m.tc, r, name: String(m.name || 'Player').replace(/[\u0000-\u001f]/g, '').slice(0, 24) || 'Player', since: prev && prev.tc === m.tc ? prev.since : Date.now() };
    const now = Date.now(); let best = null, bestGap = Infinity;
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const a = other.deserializeAttachment(); if (!a || !a.seek || a.seek.tc !== me.tc) continue;
      const waited = Math.max(now - a.seek.since, now - me.since) / 1000;
      const gap = Math.abs(a.seek.r - me.r), window = 150 + waited * 25;   // ±150 at once, anyone after about a minute
      if (gap <= window && gap < bestGap) { best = other; bestGap = gap; }
    }
    if (!best) { ws.serializeAttachment({ seek: me }); ws.send('{"t":"waiting"}'); return; }
    const opp = best.deserializeAttachment().seek;
    best.serializeAttachment({ seek: null }); ws.serializeAttachment({ seek: null });
    const bytes = crypto.getRandomValues(new Uint8Array(8)); let code = 'm';
    for (const b of bytes) code += ROOM_CH[b % ROOM_CH.length];
    const hostWhite = crypto.getRandomValues(new Uint8Array(1))[0] < 128;
    try { best.send(JSON.stringify({ t: 'match', code, role: 'host', color: hostWhite ? 'w' : 'b', tc: me.tc, opp: { name: me.name, r: me.r } })); } catch { }
    try { ws.send(JSON.stringify({ t: 'match', code, role: 'guest', color: hostWhite ? 'b' : 'w', tc: me.tc, opp: { name: opp.name, r: opp.r } })); } catch { }
  }

  async webSocketClose(ws) { try { ws.close(); } catch { } }
  async webSocketError() { }
}

/* ---------- NextMove Plus billing (Stripe) ----------
 * Off until STRIPE_SECRET and STRIPE_PRICE are set (Cloudflare → Worker → Settings → Variables, as secrets).
 * STRIPE_WEBHOOK_SECRET verifies webhook calls. TRIAL_DAYS (optional) adds a free trial. */
const isAdmin = (env, name) => (env.ADMINS || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean).includes(String(name).toLowerCase());
const billingOn = env => !!(env.STRIPE_SECRET && env.STRIPE_PRICE);
async function stripe(env, path, params) {
  const body = new URLSearchParams(); for (const [k, v] of Object.entries(params || {})) if (v != null) body.append(k, String(v));
  const r = await fetch('https://api.stripe.com/v1/' + path, { method: params ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + env.STRIPE_SECRET, 'content-type': 'application/x-www-form-urlencoded' }, body: params ? body : undefined });
  const d = await r.json(); if (!r.ok) throw new Error((d.error && d.error.message) || 'Stripe error'); return d;
}
async function checkout(request, env, user, body = {}) {
  if (!billingOn(env)) return error('NextMove Plus isn’t available yet.', 503);
  const origin = new URL(request.url).origin;
  const row = await env.DB.prepare('SELECT email, stripe_customer FROM users WHERE id = ?').bind(user.id).first();
  const price = body.period === 'year' && env.STRIPE_PRICE_YEAR ? env.STRIPE_PRICE_YEAR : env.STRIPE_PRICE;
  const p = { mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': 1, client_reference_id: user.id,
    'metadata[user_id]': user.id, 'subscription_data[metadata][user_id]': user.id, allow_promotion_codes: 'true',
    success_url: origin + '/?plus=welcome#home', cancel_url: origin + '/#home' };
  if (row?.stripe_customer) p.customer = row.stripe_customer; else if (row?.email) p.customer_email = row.email;
  if (+env.TRIAL_DAYS > 0) p['subscription_data[trial_period_days]'] = +env.TRIAL_DAYS;
  try { const s = await stripe(env, 'checkout/sessions', p); return json({ url: s.url }); } catch (e) { return error(e.message, 502); }
}
async function portal(request, env, user) {
  if (!billingOn(env)) return error('Billing isn’t set up yet.', 503);
  const row = await env.DB.prepare('SELECT stripe_customer FROM users WHERE id = ?').bind(user.id).first();
  if (!row?.stripe_customer) return error('No subscription found for this account.', 404);
  try { const s = await stripe(env, 'billing_portal/sessions', { customer: row.stripe_customer, return_url: new URL(request.url).origin + '/#progress' }); return json({ url: s.url }); } catch (e) { return error(e.message, 502); }
}
async function verifyStripe(request, env, raw) {
  const sig = request.headers.get('stripe-signature') || ''; const parts = Object.fromEntries(sig.split(',').map(x => x.split('=')));
  if (!env.STRIPE_WEBHOOK_SECRET || !parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - +parts.t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(parts.t + '.' + raw)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  return sig.split(',').some(x => x === 'v1=' + hex);
}
async function stripeWebhook(request, env) {
  const raw = await request.text();
  if (!(await verifyStripe(request, env, raw))) return error('Bad signature.', 400);
  const ev = JSON.parse(raw); const o = ev.data && ev.data.object || {};
  const setPlan = async (where, val, until) => env.DB.prepare(`UPDATE users SET plan = ?, plan_until = ? WHERE ${where} = ?`).bind(until > Date.now() ? 'plus' : 'free', until, val).run();
  if (ev.type === 'checkout.session.completed' && o.client_reference_id) {
    await env.DB.prepare('UPDATE users SET stripe_customer = ? WHERE id = ?').bind(o.customer, o.client_reference_id).run();
    // the first 500 subscribers are Founders, for good
    const f = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE founder = 1').first();
    if ((f?.n || 0) < 500) await env.DB.prepare('UPDATE users SET founder = 1 WHERE id = ? AND founder IS NULL').bind(o.client_reference_id).run();
    if (o.subscription) { const sub = await stripe(env, 'subscriptions/' + o.subscription); await setPlan('id', o.client_reference_id, sub.current_period_end * 1000 + 3 * 864e5); }
    await bump(env, 'plus_buy');
  } else if (ev.type && ev.type.startsWith('customer.subscription.')) {
    const live = ['active', 'trialing', 'past_due'].includes(o.status) && ev.type !== 'customer.subscription.deleted';
    const until = live ? (o.current_period_end || (o.items && o.items.data && o.items.data[0] && o.items.data[0].current_period_end) || 0) * 1000 + 3 * 864e5 : Date.now() - 1;
    const uid = o.metadata && o.metadata.user_id;
    if (uid) { await env.DB.prepare('UPDATE users SET stripe_customer = COALESCE(stripe_customer, ?) WHERE id = ?').bind(o.customer, uid).run(); await setPlan('id', uid, until); }
    else await setPlan('stripe_customer', o.customer, until);
  }
  return json({ ok: true });
}

/* ---------- admin (usernames in ADMINS): see every account, grant or remove free Plus, reset, delete ---------- */
async function admin(path, method, request, env, user) {
  if (!isAdmin(env, user.username)) return error('Not allowed.', 403);
  if (path === '/api/admin/users' && method === 'GET') {
    const r = await env.DB.prepare(`SELECT u.id, u.username, u.created, u.email, u.plan, u.plan_until, u.comp, u.founder, u.stripe_customer,
      (SELECT MAX(expires) FROM sessions s WHERE s.user_id = u.id) AS last_session, (SELECT t FROM state st WHERE st.user_id = u.id) AS last_save
      FROM users u ORDER BY u.created DESC LIMIT 500`).all();
    return json({ users: r.results.map(u => ({ ...u, admin: isAdmin(env, u.username), plus: isAdmin(env, u.username) || !!u.comp || (u.plan === 'plus' && (u.plan_until || 0) > Date.now()) })) });
  }
  if (path === '/api/admin/reports' && method === 'GET') { const r = await env.DB.prepare('SELECT id, t, by_user, target, reason, note, gid, done FROM reports ORDER BY id DESC LIMIT 100').all(); return json({ reports: r.results }); }
  if (path === '/api/admin/report' && method === 'POST') { const b = await request.json().catch(() => ({})); await env.DB.prepare('UPDATE reports SET done = 1 WHERE id = ?').bind(+b.id).run(); return json({ ok: true }); }
  if (path === '/api/admin/user' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const t = await env.DB.prepare('SELECT id, username FROM users WHERE username = ?').bind(String(b.username || '')).first();
    if (!t) return error('No account with that username.', 404);
    if (b.action === 'comp') await env.DB.prepare('UPDATE users SET comp = 1 WHERE id = ?').bind(t.id).run();
    else if (b.action === 'uncomp') await env.DB.prepare('UPDATE users SET comp = NULL WHERE id = ?').bind(t.id).run();
    else if (b.action === 'signout') await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.id).run();
    else if (b.action === 'recovery') return json({ ok: true, recoveryCode: await setRecovery(env, t.id) });
    else if (b.action === 'delete') {
      if (isAdmin(env, t.username)) return error('Admin accounts can’t be deleted here.', 400);
      if (b.confirm !== t.username) return error('Type the username to confirm.', 400);
      await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.id), env.DB.prepare('DELETE FROM state WHERE user_id = ?').bind(t.id), env.DB.prepare('DELETE FROM users WHERE id = ?').bind(t.id)]);
    } else return error('Unknown action.', 400);
    return json({ ok: true });
  }
  return error('Not found.', 404);
}

/* ---------- public profiles ---------- */
async function profile(name, env) {
  const u = await env.DB.prepare('SELECT u.id, u.username, u.created, u.plan, u.plan_until, u.comp, u.founder, s.json FROM users u LEFT JOIN state s ON s.user_id = u.id WHERE u.username = ?').bind(name).first();
  if (!u) return error('No player with that name.', 404);
  let st = {}; try { st = JSON.parse(u.json || '{}'); } catch { }
  if (st.private) return json({ username: u.username, private: true });
  const fin = (st.games || []).filter(g => g.result && g.result !== '*');
  const won = fin.filter(g => g.me && ((g.result === '1-0' && g.me === 'w') || (g.result === '0-1' && g.me === 'b'))).length;
  const draws = fin.filter(g => g.result === '1/2-1/2').length;
  return json({ username: u.username, created: u.created, plus: isAdmin(env, u.username) || !!u.comp || (u.plan === 'plus' && (u.plan_until || 0) > Date.now()), founder: !!u.founder,
    xp: (st.xp && st.xp.t) || 0, banner: st.banner || 'midnight', awards: Object.keys(st.awards || {}), elo: st.elo ? st.elo.r : null, puzzle: st.puz ? Math.round(st.puz.r) : null,
    games: fin.length, won, draws, lost: fin.length - won - draws, best: st.best || {},
    recent: fin.slice(-8).reverse().map(g => ({ date: g.date, white: g.white, black: g.black, result: g.result, me: g.me, src: g.src })) }, 200, { 'cache-control': 'public, max-age=60' });
}
/* ---------- friends: request, accept, remove; list with last activity ---------- */
async function friends(method, request, env, user) {
  if (method === 'GET') {
    const r = await env.DB.prepare(`SELECT f.user_id, f.friend_id, f.status, u.username, (SELECT t FROM state s WHERE s.user_id = u.id) AS last
      FROM friends f JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END WHERE f.user_id = ? OR f.friend_id = ?`).bind(user.id, user.id, user.id).all();
    return json({ friends: r.results.map(x => ({ username: x.username, last: x.last, status: x.status === 'ok' ? 'friends' : x.user_id === user.id ? 'sent' : 'incoming' })) });
  }
  const b = await request.json().catch(() => ({}));
  const t = await env.DB.prepare('SELECT id, username FROM users WHERE username = ?').bind(String(b.username || '')).first();
  if (!t) return error('No player with that name.', 404);
  if (t.id === user.id) return error('That’s you.');
  const ex = await env.DB.prepare('SELECT user_id, friend_id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').bind(user.id, t.id, t.id, user.id).first();
  if (method === 'POST') {
    if (ex && ex.status === 'ok') return json({ ok: true, status: 'friends' });
    if (ex && ex.user_id === t.id) { await env.DB.prepare("UPDATE friends SET status = 'ok' WHERE user_id = ? AND friend_id = ?").bind(t.id, user.id).run(); return json({ ok: true, status: 'friends' }); }
    if (!ex) { const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM friends WHERE user_id = ? OR friend_id = ?').bind(user.id, user.id).first(); if (n.n >= 300) return error('Friend list is full.'); await env.DB.prepare("INSERT INTO friends (user_id, friend_id, status, created) VALUES (?, ?, 'pending', ?)").bind(user.id, t.id, Date.now()).run(); }
    return json({ ok: true, status: 'sent' });
  }
  if (method === 'DELETE') { await env.DB.prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').bind(user.id, t.id, t.id, user.id).run(); return json({ ok: true }); }
  return error('Not found.', 404);
}
/* ---------- daily puzzle leaderboard ---------- */
async function dailyBoard(url, env) {
  const d = url.searchParams.get('day') || new Date().toISOString().slice(0, 10);
  const r = await env.DB.prepare('SELECT username, ms, first FROM daily_results WHERE day = ? ORDER BY first DESC, ms ASC LIMIT 20').bind(d).all();
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM daily_results WHERE day = ?').bind(d).first();
  return json({ day: d, top: r.results, solvers: n.n }, 200, { 'cache-control': 'public, max-age=30' });
}
