/* NextMove core: storage, engine, board, analysis helpers */
window.K = (() => {
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- storage (local + cross-device sync) ---------------- */
const KEY = 'kingside-v1';
const DEF = () => ({ v: 1, t: 0, name: '', depth: 14, games: [], reviews: [], drills: [], conv: [], puz: { r: 1000, hist: [], done: {} }, eg: {}, op: {} });
let S = DEF();
try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(DEF(), JSON.parse(raw)); } catch (e) { }
let doc = null, saveT = null, syncState = 'local';
const listeners = [];
function save() {
  S.t = Date.now();
  S.games = S.games.slice(-40); S.reviews = S.reviews.slice(-80); S.drills = S.drills.slice(-400); S.conv = S.conv.slice(-40);
  S.puz.hist = S.puz.hist.slice(-300);
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { }
  if (doc) { clearTimeout(saveT); saveT = setTimeout(() => doc.set({ json: JSON.stringify(S) }).catch(() => { }), 1500); }
}
function unwrap(r) { if (!r) return null; if (typeof r.data === 'function') return r.data(); if (r.data && typeof r.data === 'object') return r.data; return r; }
async function initSync() {
  try {
    if (!window.claude?.use) return;
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    doc = db.collection('data/users/' + id).doc('state');
    const remote = unwrap(await doc.get());
    if (remote && remote.json) {
      const R = Object.assign(DEF(), JSON.parse(remote.json));
      const empty = x => !x.games.length && !x.reviews.length && !x.drills.length && !x.puz.hist.length && !Object.keys(x.days || {}).length && !Object.keys(x.op || {}).length && !Object.keys(x.eg || {}).length;
      if ((R.t || 0) > (S.t || 0) || (empty(S) && !empty(R))) { S = R; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } listeners.forEach(f => f()); }
      else save();
    } else save();
    syncState = 'synced';
    listeners.forEach(f => f());
  } catch (e) { syncState = 'local'; }
}

/* ---------------- engine (Stockfish 17.1 lite, Web Worker) ---------------- */
class Engine {
  constructor() {
    this.q = Promise.resolve(); this.cur = null; this.ok = false; this.err = null;
    this.readyP = new Promise((res, rej) => { this._res = res; this._rej = rej; });
    this.boot('sf.js', () => this.boot('sf-asm.js', () => { this.err = 'Engine failed to load'; this._rej(new Error('engine')); }));
    this.readyP.catch(() => { });
  }
  boot(file, fallback) {
    let done = false;
    const fail = () => { if (done || this.ok) return; done = true; try { this.w.terminate(); } catch (e) { } fallback(); };
    try {
      this.w = new Worker(file);
      this.w.onmessage = e => this.line(String(e.data));
      this.w.onerror = fail;
      this.w.postMessage('uci'); this.w.postMessage('setoption name Hash value 32'); this.w.postMessage('isready');
      setTimeout(fail, file === 'sf.js' ? 9000 : 30000);
    } catch (e) { fail(); }
  }
  line(l) {
    if (l === 'readyok' && !this.ok) { this.ok = true; this._res(); return; }
    const j = this.cur; if (!j) return;
    if (l.startsWith('info') && l.includes(' pv ')) {
      const d = +(/ depth (\d+)/.exec(l) || [0, 0])[1];
      const mp = +((/ multipv (\d+)/.exec(l) || [0, 1])[1]);
      const cp = / score cp (-?\d+)/.exec(l), mt = / score mate (-?\d+)/.exec(l);
      if (/ (upper|lower)bound/.test(l)) return;
      const pv = l.split(' pv ')[1].trim().split(' ');
      const s = j.turn === 'w' ? 1 : -1;
      j.lines[mp - 1] = { move: pv[0], pv, depth: d, cp: cp ? s * +cp[1] : null, mate: mt ? s * +mt[1] : null };
      j.onInfo && j.onInfo(j);
    } else if (l.startsWith('bestmove')) {
      this.cur = null; j.best = l.split(' ')[1]; j.resolve(j);
    }
  }
  run(fen, o = {}) { const p = this.q.then(() => this._run(fen, o)); this.q = p.catch(() => { }); return p; }
  async _run(fen, o) {
    await this.readyP;
    if (o.token && o.token.cancel) return { fen, lines: [], best: null, cancelled: true };
    return new Promise(resolve => {
      const j = { fen, lines: [], resolve, onInfo: o.onInfo, turn: fen.split(' ')[1], tag: o.tag };
      this.cur = j;
      const w = this.w, P = c => w.postMessage(c);
      P('setoption name MultiPV value ' + (o.multipv || 1));
      P('setoption name Skill Level value ' + (o.skill ?? 20));
      P('setoption name UCI_LimitStrength value ' + (o.elo ? 'true' : 'false'));
      if (o.elo) P('setoption name UCI_Elo value ' + o.elo);
      P('position fen ' + fen);
      P(o.movetime ? 'go movetime ' + o.movetime : 'go depth ' + (o.depth || 12));
    });
  }
  stop(tag) { if (this.cur && (!tag || this.cur.tag === tag)) this.w.postMessage('stop'); }
}
const eng = new Engine();
const cache = new Map();
async function analyse(fen, depth = 13, multipv = 1, o = {}) {
  const k = fen.split(' ').slice(0, 4).join(' ') + '|' + multipv;
  const c = cache.get(k);
  if (c && c.depth >= depth) return c;
  const ch = new Chess(fen);
  if (ch.game_over()) {
    const turn = ch.turn();
    const r = { fen, depth: 99, lines: [{ move: null, pv: [], cp: ch.in_checkmate() ? (turn === 'w' ? -10000 : 10000) : 0, mate: null, over: true }] };
    return r;
  }
  const j = await eng.run(fen, { depth, multipv, ...o });
  if (!j.lines.length && j.best && j.best !== '(none)') j.lines = [{ move: j.best, pv: [j.best], cp: 0, mate: null }];
  const r = { fen, depth, lines: j.lines.filter(Boolean) };
  const reached = r.lines[0] && r.lines[0].depth ? r.lines[0].depth : depth;
  if (!j.cancelled && r.lines.length && reached >= depth - 1) { cache.set(k, r); if (cache.size > 3000) cache.delete(cache.keys().next().value); }
  return r;
}

/* ---------------- scores ---------------- */
// white-POV numeric value from a line
const cpv = l => !l ? 0 : l.mate != null ? (l.mate > 0 ? 10000 - l.mate * 10 : l.mate < 0 ? -10000 - l.mate * 10 : 0) : (l.cp ?? 0);
const winW = l => { const v = cpv(l); if (Math.abs(v) >= 9000) return v > 0 ? 100 : 0; return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * v)) - 1); };
const winFor = (l, color) => color === 'w' ? winW(l) : 100 - winW(l);
function fmtEval(l) {
  if (!l) return '0.0';
  if (l.over) return l.cp > 0 ? '1-0' : l.cp < 0 ? '0-1' : '½-½';
  if (l.mate != null) return (l.mate > 0 ? '' : '-') + 'M' + Math.abs(l.mate);
  const v = (l.cp ?? 0) / 100; return (v > 0 ? '+' : '') + v.toFixed(1);
}
const moveAcc = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669 + 1));
function gameAcc(list) {
  if (!list.length) return null;
  const a = list.reduce((s, x) => s + x, 0) / list.length;
  const h = list.length / list.reduce((s, x) => s + 1 / Math.max(x, 5), 0);
  return Math.round((a + h) / 2 * 10) / 10;
}

/* ---------------- chess helpers ---------------- */
function mv(ch, u) { return ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); }
const uciOf = m => m.from + m.to + (m.promotion || '');
function sanOf(fen, u) { if (!u) return ''; const c = new Chess(fen); const m = mv(c, u); return m ? m.san : u; }
function pvSan(fen, pv, n = 8) {
  const c = new Chess(fen); const out = [];
  for (const u of pv.slice(0, n)) {
    const turn = c.turn(), no = +c.fen().split(' ')[5];
    const m = mv(c, u); if (!m) break;
    out.push((turn === 'w' ? no + '. ' : (out.length ? '' : no + '… ')) + m.san);
  }
  return out.join(' ');
}
function matDiff(ch, color) { let s = 0; for (const r of ch.board()) for (const p of r) if (p) s += (p.color === color ? 1 : -1) * VAL[p.type]; return s; }
function nonPawn(ch) { let s = 0; for (const r of ch.board()) for (const p of r) if (p && p.type !== 'p' && p.type !== 'k') s += VAL[p.type]; return s; }
const key4 = fen => fen.split(' ').slice(0, 4).join(' ');
// pieces attacked by the piece on `sq` (as if it could move again)
function attacksFrom(ch, sq) {
  const f = ch.fen().split(' '); const p = ch.get(sq); if (!p) return [];
  f[1] = p.color; f[3] = '-';
  try { const c = new Chess(); if (!c.load(f.join(' '))) return []; return c.moves({ square: sq, verbose: true }).filter(m => m.captured).map(m => ({ sq: m.to, type: m.captured })); }
  catch (e) { return []; }
}
function isDefended(ch, sq, byColor) {
  // is square sq (holding a piece of the other side after capture) recapturable by byColor?
  const f = ch.fen().split(' '); f[1] = byColor; f[3] = '-';
  const c = new Chess(); if (!c.load(f.join(' '))) return false;
  return c.moves({ verbose: true }).some(m => m.to === sq);
}
// is the piece standing on sq protected by its own side?
function isProtected(ch, sq) {
  const p = ch.get(sq); if (!p) return false;
  const c = new Chess(ch.fen()); c.remove(sq);
  c.put({ type: 'p', color: p.color === 'w' ? 'b' : 'w' }, sq);
  const f = c.fen().split(' '); f[1] = p.color; f[3] = '-';
  const d = new Chess(); if (!d.load(f.join(' '))) return false;
  return d.moves({ verbose: true }).some(m => m.to === sq);
}
// a move that leaves material en prise without immediate compensation
function isSacrifice(fen, u) {
  const c = new Chess(fen); const me = c.turn(); const m = mv(c, u); if (!m) return false;
  const moved = VAL[m.promotion || m.piece]; const got = m.captured ? VAL[m.captured] : 0;
  if (moved < 3 || got >= moved) return false;
  const caps = c.moves({ verbose: true }).filter(x => x.to === m.to && x.captured);
  for (const x of caps) {
    const c2 = new Chess(c.fen()); c2.move(x);
    const recap = c2.moves({ verbose: true }).some(y => y.to === m.to);
    if (!recap || VAL[x.piece] < moved - got) return true;
  }
  // also: leaving another piece hanging (e.g. queen) — skip, keep it strict
  return false;
}

/* ---------------- opening book ---------------- */
const BOOK = new Map(); // key4 -> {name, moves:Set}
function addLine(name, moves, push = true) {
  const c = new Chess(); let k = key4(c.fen());
  for (const u of moves) {
    if (!BOOK.has(k)) BOOK.set(k, { name: null, moves: new Set() });
    BOOK.get(k).moves.add(u);
    mv(c, u); k = key4(c.fen());
    if (!BOOK.has(k)) BOOK.set(k, { name: null, moves: new Set() });
  }
  BOOK.get(k).name = BOOK.get(k).name || name;
  if (push) K.BOOKLINES.push({ name, moves });
}
function fillNames(lines) {
  for (const { name, moves } of lines) { const c = new Chess(); for (const u of moves) { mv(c, u); const e = BOOK.get(key4(c.fen())); if (e && !e.name) e.name = name; } }
}
async function loadBook() {
  try {
    const lines = await (await fetch('book.json')).json();
    for (const [name, line] of lines) addLine(name, line.split(' '));
    fillNames(K.BOOKLINES);
  } catch (e) { }
}
function openingName(fens) { let n = null; for (const f of fens) { const e = BOOK.get(key4(f)); if (e && e.name) n = e.name; else if (!e) break; } return n; }

/* ---------------- classification ---------------- */
const CLS = {
  brilliant: { c: '#1baca6', i: '!!', t: 'Brilliant' }, great: { c: '#5b8bb0', i: '!', t: 'Great' },
  best: { c: '#81b64c', i: '★', t: 'Best' }, excellent: { c: '#96bc4b', i: '✓', t: 'Excellent' },
  good: { c: '#78946a', i: '✓', t: 'Good' }, book: { c: '#a88865', i: 'B', t: 'Book' },
  forced: { c: '#8f9693', i: '□', t: 'Forced' },
  inaccuracy: { c: '#e2b02f', i: '?!', t: 'Inaccuracy' }, mistake: { c: '#ef8a37', i: '?', t: 'Mistake' },
  miss: { c: '#e8636b', i: '×', t: 'Miss' }, blunder: { c: '#e0402e', i: '??', t: 'Blunder' }
};
const BAD = ['inaccuracy', 'mistake', 'miss', 'blunder'];
function classify({ fen, u, pre, post, color, inBook, prevCls, prevWinBefore }) {
  const best = pre.lines[0], second = pre.lines[1];
  const wb = winFor(best, color), wa = winFor(post.lines[0], color);
  const loss = Math.max(0, wb - wa);
  const legal = new Chess(fen).moves().length;
  if (inBook) return { cls: 'book', loss };
  if (legal === 1) return { cls: 'forced', loss: 0 };
  let cls;
  const top = best && best.move === u;
  if (top || loss <= 0.6) {
    cls = 'best';
    const ws = second ? winFor(second, color) : null;
    if (top && ws != null && wb - ws >= 14 && wb < 97) cls = 'great';
    if ((top || loss <= 1.5) && wa >= 45 && wb < 93 && isSacrifice(fen, u)) cls = 'brilliant';
  } else if (loss <= 2.5) cls = 'excellent';
  else if (loss <= 6) cls = 'good';
  else if (loss <= 12) cls = 'inaccuracy';
  else if (loss <= 22) cls = 'mistake';
  else cls = 'blunder';
  if (BAD.includes(cls) && (prevCls === 'mistake' || prevCls === 'blunder') && prevWinBefore != null && wa >= prevWinBefore - 3 && loss >= 8) cls = 'miss';
  return { cls, loss };
}

/* ---------------- explanations (engine facts → plain English) ---------------- */
const side = c => c === 'w' ? 'White' : 'Black';
function playLine(fen, pv, n) { const c = new Chess(fen); const ms = []; for (const u of pv.slice(0, n)) { const m = mv(c, u); if (!m) break; ms.push(m); } return { c, ms }; }
function describeTactic(fen, u) {
  // what does move u do? returns phrase or null
  const c = new Chess(fen); const me = c.turn(); const m = mv(c, u); if (!m) return null;
  if (c.in_checkmate()) return `${m.san} is checkmate.`;
  const hits = attacksFrom(c, m.to).filter(h => h.type === 'k' || VAL[h.type] > VAL[m.piece] || !isProtected(c, h.sq));
  const valuable = hits.filter(h => h.type === 'k' || VAL[h.type] >= 3);
  if (valuable.length >= 2) return `${m.san} forks the ${valuable.slice(0, 2).map(h => NAME[h.type]).join(' and the ')}.`;
  if (m.captured) {
    const opp = me === 'w' ? 'b' : 'w';
    const recap = new Chess(c.fen()).moves({ verbose: true }).some(x => x.to === m.to);
    if (!recap) return `The ${NAME[m.captured]} on ${m.to} was unprotected — ${m.san} just takes it.`;
    if (VAL[m.captured] > VAL[m.piece]) return `${m.san} wins the ${NAME[m.captured]} for a ${NAME[m.piece]}.`;
  }
  if (m.promotion) return `${m.san} promotes the pawn.`;
  return null;
}
function explain({ fen, u, cls, pre, post, color, openName }) {
  const best = pre.lines[0], after = post.lines[0];
  const san = sanOf(fen, u), bestSan = best && best.move ? sanOf(fen, best.move) : '';
  const out = [];
  const opp = color === 'w' ? 'b' : 'w';
  const c0 = new Chess(fen); const mat0 = matDiff(c0, color);
  if (cls === 'book') return { head: `${san} is book`, text: [`Known opening theory${openName ? ` (${openName})` : ''}.`] };
  if (cls === 'forced') return { head: `${san} was forced`, text: ['It was the only legal move.'] };
  if (cls === 'brilliant') { const t = describeTactic(fen, u); return { head: `${san} is brilliant`, text: [`A real sacrifice: you give up material and the engine says it works.`, t || '', `Line: ${pvSan(fen, [u, ...(after.pv || [])], 7)}`].filter(Boolean) }; }
  if (['best', 'great', 'excellent', 'good'].includes(cls)) {
    const t = describeTactic(fen, u);
    const head = cls === 'great' ? `${san} is the only good move` : cls === 'best' ? `${san} is best` : `${san} is ${cls === 'excellent' ? 'excellent' : 'fine'}`;
    const text = [];
    if (cls === 'great') text.push('Every other move was clearly worse here.');
    if (t) text.push(t);
    if (cls !== 'best' && cls !== 'great' && bestSan && best.move !== u) text.push(`The engine slightly prefers ${bestSan}.`);
    return { head, text };
  }
  // bad moves
  const head = `${san} is ${cls === 'miss' ? 'a miss' : cls === 'inaccuracy' ? 'an inaccuracy' : 'a ' + cls}`;
  // 1. allowed mate
  if (after && after.mate != null && (color === 'w' ? after.mate < 0 : after.mate > 0)) {
    out.push(`This allows mate in ${Math.abs(after.mate)}: ${pvSan(post.fen, after.pv, Math.abs(after.mate) * 2 - 1)}.`);
  }
  // 2. missed mate
  if (best && best.mate != null && (color === 'w' ? best.mate > 0 : best.mate < 0) && !(after && after.mate != null && (color === 'w' ? after.mate > 0 : after.mate < 0))) {
    out.push(`You had mate in ${Math.abs(best.mate)}: ${pvSan(fen, best.pv, Math.abs(best.mate) * 2 - 1)}.`);
  }
  // 3. material lost to the refutation
  if (!out.length && after && after.pv && after.pv.length) {
    const c1 = new Chess(fen); mv(c1, u);
    const { c: cEnd, ms } = playLine(c1.fen(), after.pv, 6);
    const lossMat = (mat0 + (matDiff(c1, color) - mat0)) - matDiff(cEnd, color);
    const totalLoss = mat0 - matDiff(cEnd, color);
    const reply = ms[0];
    if (totalLoss >= 2 && reply) {
      const t = describeTactic(c1.fen(), after.pv[0]);
      const movedTo = u.slice(2, 4);
      if (reply.captured && reply.to === movedTo && !isDefended(new Chess(c1.fen()), movedTo, color)) out.push(`Your ${NAME[reply.captured]} on ${movedTo} is left hanging — ${reply.san} simply takes it.`);
      else if (t && /forks/.test(t)) out.push(`It allows ${t.replace(/\.$/, '')} — you lose material.`);
      else if (reply.captured && VAL[reply.captured] >= totalLoss - 1) out.push(`${side(opp)} answers ${reply.san}, winning your ${NAME[reply.captured]}.`);
      else if (reply.captured) out.push(`${side(opp)} takes with ${reply.san}, and you end up losing about ${totalLoss} points of material.`);
      else out.push(`After ${reply.san} you lose ${totalLoss >= 3 ? 'a piece' : 'material'} (about ${totalLoss} point${totalLoss > 1 ? 's' : ''}).`);
      out.push(`Their best line: ${pvSan(c1.fen(), after.pv, 6)}.`);
    }
  }
  // 4. missed material win
  if (best && best.move && best.move !== u && out.length < 2) {
    const { c: cB } = playLine(fen, best.pv, 6);
    const gain = matDiff(cB, color) - mat0;
    const t = describeTactic(fen, best.move);
    if (gain >= 2 || t) out.push(t ? `Better was ${bestSan}: ${t}` : `${bestSan} wins material: ${pvSan(fen, best.pv, 6)}.`);
  }
  if (!out.length) {
    out.push(`It hands ${side(opp)} more: the evaluation goes from ${fmtEval(best)} to ${fmtEval(after)} (White's view).`);
    if (bestSan) out.push(`${bestSan} was stronger. Best line: ${pvSan(fen, best.pv, 6)}.`);
  } else if (bestSan && !out.some(s => s.includes(bestSan))) out.push(`Best was ${bestSan}.`);
  return { head, text: out };
}

/* ---------------- judge a training move (accepts any equally good move) ---------------- */
async function judge(fen, u, o = {}) {
  const depth = o.depth || 13;
  const color = fen.split(' ')[1];
  const pre = await analyse(fen, depth, 3);
  const best = pre.lines[0];
  const c = new Chess(fen); const m = mv(c, u);
  const post = await analyse(c.fen(), depth - 1, 1);
  const wb = winFor(best, color), wa = winFor(post.lines[0], color);
  const loss = Math.max(0, wb - wa);
  const bestMate = best && best.mate != null && (color === 'w' ? best.mate > 0 : best.mate < 0) ? Math.abs(best.mate) : 0;
  const aft = post.lines[0];
  let ok;
  if (c.in_checkmate()) ok = true;
  else if (bestMate) ok = aft && aft.mate != null && (color === 'w' ? aft.mate > 0 : aft.mate < 0) && Math.abs(aft.mate) <= bestMate + 1;
  else ok = loss <= (o.tol ?? 4) || (wa >= (o.winning ?? 94) && loss <= 8);
  return { ok, loss, wb, wa, pre, post, best, san: m ? m.san : u, isBest: best && best.move === u };
}

/* ---------------- board ---------------- */
const PIECE = {};
function setPieces(map) { Object.assign(PIECE, map); }
class Board {
  constructor(host, o = {}) {
    this.o = o; this.host = host; this.orient = 'w'; this.fen = START; this.sel = null; this.dests = [];
    this.last = null; this.arrows = []; this.badge = null; this.marks = {};
    host.classList.add('board');
    host.innerHTML = '<div class="sqs"></div><svg class="arw" viewBox="0 0 8 8" aria-hidden="true"></svg><div class="promo" hidden></div>';
    this.sqs = host.querySelector('.sqs'); this.svg = host.querySelector('.arw'); this.promo = host.querySelector('.promo');
    host.addEventListener('pointerdown', e => this.down(e));
    host.addEventListener('pointermove', e => this.moveG(e));
    host.addEventListener('pointerup', e => this.up(e));
    host.addEventListener('pointercancel', () => this.cancelDrag());
    host.addEventListener('contextmenu', e => e.preventDefault());
    this.render();
  }
  xySq(x, y) { return this.orient === 'w' ? 'abcdefgh'[x] + (8 - y) : 'abcdefgh'[7 - x] + (y + 1); }
  sqXY(sq) { const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1; return this.orient === 'w' ? [f, 7 - r] : [7 - f, r]; }
  set(fen, o = {}) {
    const changed = fen !== this.fen;
    this.fen = fen; this.last = o.last ?? null; this.arrows = o.arrows || []; this.badge = o.badge || null; this.marks = o.marks || {};
    if (changed) { this.uArrows = []; this.uMarks = {}; }
    this.sel = null; this.dests = []; this.promo.hidden = true; this.render();
    if (o.anim && this.last && !this.noAnim) this.animate(this.last);
    this.noAnim = false;
  }
  animate(u) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = u.slice(0, 2), to = u.slice(2, 4);
    const el = this.sqs.querySelector(`[data-sq="${to}"] .pc`); if (!el) return;
    const [x1, y1] = this.sqXY(from), [x2, y2] = this.sqXY(to);
    el.style.transition = 'none'; el.style.transform = `translate(${(x1 - x2) * 100}%,${(y1 - y2) * 100}%)`; el.style.zIndex = 5;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform .16s ease-out'; el.style.transform = ''; }));
    // castling: slide the rook too
    const p = this.pieces()[to];
    if (p && p[1] === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
      const r = to[1], kside = to[0] === 'g';
      this.animate((kside ? 'h' : 'a') + r + (kside ? 'f' : 'd') + r);
    }
  }
  setArrows(a) { this.arrows = a || []; this.drawArrows(); }
  flip(c) { this.orient = c || (this.orient === 'w' ? 'b' : 'w'); this.render(); }
  pieces() {
    const m = {}; const rows = this.fen.split(' ')[0].split('/');
    rows.forEach((row, i) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { m['abcdefgh'[f] + (8 - i)] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase(); f++; } } });
    return m;
  }
  render() {
    const P = this.pieces(); let h = '';
    const turn = this.fen.split(' ')[1];
    let checkSq = null;
    try { const c = new Chess(this.fen); if (c.in_check()) for (const [s, p] of Object.entries(P)) if (p === turn + 'k') checkSq = s; } catch (e) { }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const s = this.xySq(x, y); const light = (x + y) % 2 === 0;
      const cl = ['sq', light ? 'l' : 'd'];
      if (this.last && (this.last.slice(0, 2) === s || this.last.slice(2, 4) === s)) cl.push('last');
      if (this.sel === s) cl.push('sel');
      if (checkSq === s) cl.push('chk');
      if (this.marks[s]) cl.push(this.marks[s]);
      if (this.uMarks && this.uMarks[s]) cl.push('umark');
      const d = this.dests.find(t => t.to === s);
      if (d) cl.push(P[s] ? 'cap' : 'dot');
      let inner = '';
      if (x === 0) inner += `<i class="rk">${s[1]}</i>`;
      if (y === 7) inner += `<i class="fl">${s[0]}</i>`;
      if (P[s]) inner += `<b class="pc" style="background-image:url(${PIECE[P[s]]})"></b>`;
      if (this.badge && this.badge.sq === s) inner += `<em class="badge" style="background:${this.badge.c}">${this.badge.i}</em>`;
      h += `<div class="${cl.join(' ')}" data-sq="${s}">${inner}</div>`;
    }
    this.sqs.innerHTML = h; this.drawArrows();
  }
  drawArrows() {
    const all = this.arrows.concat(this.uArrows || []);
    let h = '<defs>' + all.map((a, i) => `<marker id="ah${i}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.4" markerHeight="2.4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${a.c}"/></marker>`).join('') + '</defs>';
    all.forEach((a, i) => {
      const [x1, y1] = this.sqXY(a.from), [x2, y2] = this.sqXY(a.to);
      const cx1 = x1 + .5, cy1 = y1 + .5, cx2 = x2 + .5, cy2 = y2 + .5;
      const dx = cx2 - cx1, dy = cy2 - cy1, L = Math.hypot(dx, dy) || 1;
      const ex = cx2 - dx / L * .32, ey = cy2 - dy / L * .32;
      h += `<line x1="${cx1}" y1="${cy1}" x2="${ex}" y2="${ey}" stroke="${a.c}" stroke-width="${a.w || .17}" stroke-linecap="round" opacity="${a.o || .82}" marker-end="url(#ah${i})"/>`;
    });
    this.svg.innerHTML = h;
  }
  sqAt(e) {
    const r = this.sqs.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * 8), y = Math.floor((e.clientY - r.top) / r.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null; return this.xySq(x, y);
  }
  canMove(sq) {
    const p = this.pieces()[sq]; if (!p) return false;
    const mv = this.o.movable ? this.o.movable() : null; if (!mv) return false;
    const turn = this.fen.split(' ')[1];
    return p[0] === turn && (mv === 'both' || mv === turn);
  }
  select(sq) { this.sel = sq; this.dests = this.o.legal ? this.o.legal(sq) : []; this.render(); }
  down(e) {
    if (!this.promo.hidden) return;
    const sq = this.sqAt(e); if (!sq) return;
    if (e.button === 2) { this.rdown = sq; e.preventDefault(); return; }
    if (this.uArrows && (this.uArrows.length || Object.keys(this.uMarks || {}).length)) { this.uArrows = []; this.uMarks = {}; this.render(); }
    if (this.o.onSquare && this.o.onSquare(sq)) return;
    if (this.sel && this.dests.some(d => d.to === sq)) { this.tryMove(this.sel, sq); return; }
    if (this.canMove(sq)) {
      this.select(sq);
      const p = this.pieces()[sq];
      this.drag = { from: sq, x: e.clientX, y: e.clientY, moved: false };
      const g = document.createElement('b'); g.className = 'dragpc'; g.style.backgroundImage = `url(${PIECE[p]})`;
      const r = this.sqs.getBoundingClientRect(); g.style.width = g.style.height = r.width / 8 + 'px';
      this.ghost = g; document.body.appendChild(g); this.posGhost(e);
      try { this.host.setPointerCapture(e.pointerId); } catch (er) { }
      const el = this.sqs.querySelector(`[data-sq="${sq}"] .pc`); if (el) el.style.opacity = .35;
      e.preventDefault();
    } else if (this.sel) { this.sel = null; this.dests = []; this.render(); }
  }
  posGhost(e) { if (!this.ghost) return; const w = parseFloat(this.ghost.style.width); this.ghost.style.transform = `translate(${e.clientX - w / 2}px,${e.clientY - w / 2}px)`; }
  moveG(e) { if (!this.drag) return; if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 4) this.drag.moved = true; this.posGhost(e); }
  cancelDrag() { if (this.ghost) this.ghost.remove(); this.ghost = null; this.drag = null; }
  up(e) {
    if (e.button === 2 && this.rdown) {
      const sq = this.sqAt(e), a = this.rdown; this.rdown = null; if (!sq) return;
      this.uArrows = this.uArrows || []; this.uMarks = this.uMarks || {};
      if (sq === a) { if (this.uMarks[sq]) delete this.uMarks[sq]; else this.uMarks[sq] = 1; }
      else { const i = this.uArrows.findIndex(x => x.from === a && x.to === sq); if (i >= 0) this.uArrows.splice(i, 1); else this.uArrows.push({ from: a, to: sq, c: '#f2a33a', o: .78 }); }
      this.render(); return;
    }
    if (!this.drag) return;
    const from = this.drag.from, moved = this.drag.moved; this.cancelDrag();
    const sq = this.sqAt(e);
    if (moved && sq && sq !== from && this.dests.some(d => d.to === sq)) { this.noAnimNext = true; this.tryMove(from, sq); }
    else if (moved) { this.sel = null; this.dests = []; this.render(); }
    else this.render();
  }
  tryMove(from, to) {
    const p = this.pieces()[from];
    if (p && p[1] === 'p' && (to[1] === '8' || to[1] === '1')) return this.askPromo(from, to, p[0]);
    this.finish(from, to);
  }
  askPromo(from, to, color) {
    const [x] = this.sqXY(to);
    this.promo.innerHTML = ['q', 'n', 'r', 'b'].map(t => `<button data-p="${t}" style="background-image:url(${PIECE[color + t]})" aria-label="${NAME[t]}"></button>`).join('');
    this.promo.style.left = (x / 8 * 100) + '%'; this.promo.hidden = false;
    this.promo.onclick = e => { const b = e.target.closest('button'); if (!b) return; this.promo.hidden = true; this.finish(from, to, b.dataset.p); };
    this.promo.onpointerdown = e => e.stopPropagation();
  }
  finish(from, to, promo) {
    this.sel = null; this.dests = [];
    this.lastWasDrag = !!this.noAnimNext; this.noAnimNext = false;
    const ok = this.o.onMove ? this.o.onMove(from, to, promo) : false;
    if (!ok) this.render();
  }
}

return { START, VAL, NAME, esc, $, sleep, S: () => S, save, initSync, onSync: f => listeners.push(f), syncState: () => syncState, eng, analyse, cpv, winW, winFor, fmtEval, moveAcc, gameAcc, mv, uciOf, sanOf, pvSan, matDiff, nonPawn, key4, isSacrifice, BOOK, BOOKLINES: [], loadBook, addLine, fillNames, openingName, CLS, BAD, classify, explain, describeTactic, judge, Board, setPieces };
})();
