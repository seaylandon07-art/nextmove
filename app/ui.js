/* NextMove shell: shared helpers, settings, sounds, router */
window.A = (() => {
const { esc, $, CLS } = K;
const S = () => K.S();
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const DAY = 864e5, GOAL = 12;
const A = { S, $$, uid, today, DAY, GOAL, views: {}, PUZ: [], EG: [], GAMB: [], COURSES: [], sample: null };

/* ---------- settings ---------- */
const UI_DEF = { board: 'blue', pieces: 'cburnett', sound: true, coords: true, anim: true, notation: 'plain', arrow: 'green', mark: 'red', bg: 'midnight', volume: .8, sstyle: 'wood' };
const BGS = [['midnight', 'Midnight', 'radial-gradient(circle at 30% 0%,#1c2552,#0a0e1c 70%)'], ['royal', 'Club room', 'url(bg/royal.jpg) 60% 50%/cover'], ['spotlight', 'Spotlight', 'url(bg/arena.jpg) center/cover'], ['checkmate', 'Checkmate', 'url(bg/checkmate.jpg) 40% 50%/cover'], ['goldset', 'Gold set', 'url(bg/gold.jpg) center/cover'], ['neon', 'Neon knight', 'url(bg/neon.svg) center/cover'], ['tournament', 'Tournament hall', 'url(bg/tournament.jpg) center/cover'], ['bishop', 'Bishop', 'url(bg/bishop.jpg) 35% 50%/cover'], ['marble', 'Marble opening', 'url(bg/marble.jpg) center/cover'], ['sunrise', 'Sunrise', 'url(bg/sunrise.jpg) center/cover'], ['ice', 'Crystal', 'url(bg/ice.jpg) center/cover'], ['pieces', 'Pieces', ''], ['grid', 'Grid horizon', 'linear-gradient(transparent 45%,rgba(241,207,134,.25)),conic-gradient(rgba(241,207,134,.18) 25%,transparent 0 50%,rgba(241,207,134,.18) 0 75%,transparent 0) 0 0/16px 16px,#0a0e1c'], ['aurora', 'Aurora', 'radial-gradient(circle at 25% 30%,rgba(111,211,160,.45),transparent 50%),radial-gradient(circle at 75% 30%,rgba(150,120,255,.45),transparent 50%),radial-gradient(circle at 55% 85%,rgba(241,207,134,.35),transparent 50%),#0a0e1c'], ['stars', 'Night sky', 'radial-gradient(1px 1px at 10px 12px,#fff,transparent),radial-gradient(1px 1px at 40px 30px,#fff,transparent),radial-gradient(1px 1px at 70px 18px,#fff,transparent),radial-gradient(circle at 70% 0%,#1a1440,#05070f 70%)'], ['walnut', 'Walnut', 'repeating-linear-gradient(97deg,#2a1a10 0 4px,#32200f 4px 6px),#1a110b'], ['felt', 'Felt', 'radial-gradient(circle at 50% 30%,#1f5a40,#0b2a1e 75%)'], ['pure', 'Pure black', '#05060b']];
const ARROWS = [['green', 'Green', '#4fcf8f'], ['gold', 'Champagne gold', '#e9b850'], ['blue', 'Blue', '#5b9dff'], ['red', 'Red', '#ff5a5a'], ['orange', 'Orange', '#f2a33a']];
const MARKS = [['red', 'Red', '#ff5a5a'], ['green', 'Green', '#4fcf8f'], ['blue', 'Blue', '#5b9dff'], ['gold', 'Champagne gold', '#e9b850'], ['orange', 'Orange', '#f2a33a']];
K.markColor = () => (MARKS.find(a => a[0] === A.ui().mark) || MARKS[0])[2];
K.arrowColor = () => (ARROWS.find(a => a[0] === A.ui().arrow) || ARROWS[0])[2];
A.ui = () => { const s = S(); s.ui = Object.assign({}, UI_DEF, s.ui || {}); return s.ui; };
A.boards = [];
function applyUI() {
  const u = A.ui();
  document.documentElement.dataset.board = u.board;
  document.body.classList.toggle('nocoords', !u.coords);
  document.body.dataset.bg = u.bg || 'midnight';
  if (u.bg === 'pieces' && K.PIECESETS) $('#bgfx').style.setProperty('--piecebg', `url("${pieceTile(u.pieces)}")`);
  if (K.PIECESETS && K.PIECESETS[u.pieces]) K.setPieces(K.PIECESETS[u.pieces]);
  A.boards.forEach(b => { b.noAnim = !u.anim; b.render(); });
}
A.applyUI = applyUI;
// a scattered tile of pieces from your chosen set, used by the "Pieces" background
function pieceTile(set) {
  const P = K.PIECESETS[set] || K.PIECESETS.cburnett; if (!P) return '';
  const spots = [['wn', 20, 30, -12], ['wk', 170, 10, 8], ['wb', 90, 140, 15], ['wq', 220, 170, -6], ['wr', 10, 220, 4], ['wp', 150, 250, -10], ['bn', 250, 80, 10], ['bp', 60, 80, 0]];
  const img = spots.map(([p, x, y, r]) => `<image href="${P[p]}" x="${x}" y="${y}" width="56" height="56" transform="rotate(${r} ${x + 28} ${y + 28})"/>`).join('');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="300">${img}</svg>`);
}
const BOARDS = [['blue', '#e8e3d6', '#7a84ab'], ['green', '#ebecd0', '#739552'], ['walnut', '#f0d9b5', '#b58863'], ['graphite', '#d4d4cf', '#7b7e85'], ['night', '#9aa4b1', '#4f5b6b']];
function renderSettings() {
  const u = A.ui();
  $('#bgSw').innerHTML = BGS.map(([k, n, css]) => `<button class="bgo${(u.bg || 'midnight') === k ? ' on' : ''}" data-bg="${k}"><i style="background:${k === 'pieces' ? `url('${pieceTile(u.pieces)}') 0 0/90px 90px,#0a0e1c` : css}"></i>${n}</button>`).join('');
  $('#swatches').innerHTML = BOARDS.map(([n, a, b]) => `<button class="sw${u.board === n ? ' on' : ''}" data-b="${n}" style="--a:${a};--b:${b}" aria-label="${n} board"><i></i><i></i><i></i><i></i></button>`).join('');
  $('#psets').innerHTML = Object.keys(K.PIECESETS || {}).map(n => `<button class="pset${u.pieces === n ? ' on' : ''}" data-p="${n}" aria-label="${n} pieces">${['wn', 'wq', 'bk'].map(p => `<img alt="" src="${K.PIECESETS[n][p]}">`).join('')}</button>`).join('');
  $$('#sndStyle button').forEach(b => b.classList.toggle('on', b.dataset.ss === (u.sstyle || 'wood'))); $('#sVol').value = Math.round((u.volume ?? .8) * 100);
  $('#arrowSw').innerHTML = ARROWS.map(([k, n, c]) => `<button class="asw${u.arrow === k ? ' on' : ''}" data-a="${k}" style="--c:${c}"><i></i>${n}</button>`).join('');
  $('#markSw').innerHTML = MARKS.map(([k, n, c]) => `<button class="asw sq-sw${u.mark === k ? ' on' : ''}" data-m="${k}" style="--c:${c}"><i></i>${n}</button>`).join('');
  [...document.querySelectorAll('#notSeg button')].forEach(b => b.classList.toggle('on', b.dataset.n === u.notation));
  $('#sSound').checked = u.sound; $('#sCoords').checked = u.coords; $('#sAnim').checked = u.anim;
  $('#nameIn').value = S().name || ''; $('#depthIn').value = String(S().depth || 14);
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) { renderSettings(); $('#' + o.dataset.open).hidden = false; }
  if (e.target.closest('[data-close]') || e.target.id === 'settings') $('#settings').hidden = true;
});
$('#swatches').onclick = e => { const b = e.target.closest('[data-b]'); if (!b) return; A.ui().board = b.dataset.b; K.save(); applyUI(); renderSettings(); };
$('#psets').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; A.ui().pieces = b.dataset.p; K.save(); applyUI(); renderSettings(); };
$('#arrowSw').onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; A.ui().arrow = b.dataset.a; K.save(); renderSettings(); };
$('#markSw').onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; A.ui().mark = b.dataset.m; K.save(); renderSettings(); };
$('#bgSw').onclick = e => { const b = e.target.closest('[data-bg]'); if (!b) return; A.ui().bg = b.dataset.bg; K.save(); applyUI(); renderSettings(); };
$('#notSeg').onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; A.ui().notation = b.dataset.n; K.save(); renderSettings(); A.refresh(); };
$('#sSound').onchange = e => { A.ui().sound = e.target.checked; K.save(); };
$('#sndStyle').onclick = e => { const b = e.target.closest('[data-ss]'); if (!b) return; A.ui().sstyle = b.dataset.ss; K.save(); renderSettings(); A.sound('move'); };
$('#sVol').oninput = e => { A.ui().volume = +e.target.value / 100; K.save(); };
$('#sVol').onchange = () => A.sound('move');
$('#sndTest').onclick = () => { A.sound('move'); setTimeout(() => A.sound('capture'), 500); setTimeout(() => A.sound('check'), 1000); };
$('#sCoords').onchange = e => { A.ui().coords = e.target.checked; K.save(); applyUI(); };
$('#sAnim').onchange = e => { A.ui().anim = e.target.checked; K.save(); applyUI(); };
$('#nameIn').onchange = e => { S().name = e.target.value.trim(); K.save(); renderMe(); };
$('#depthIn').onchange = e => { S().depth = +e.target.value; K.save(); };
$('#resetBtn').onclick = () => { $('#resetConfirm').hidden = false; };
$('#resetNo').onclick = () => { $('#resetConfirm').hidden = true; };
$('#resetYes').onclick = () => { const s = S(); Object.assign(s, { games: [], reviews: [], drills: [], conv: [], puz: { r: 1000, hist: [], done: {} }, eg: {}, op: {}, days: {}, best: {} }); K.save(); $('#resetConfirm').hidden = true; $('#settings').hidden = true; A.refresh(); A.toast('Progress reset'); };

/* ---------- sounds (synthesised, no files) ---------- */
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } } if (ac && ac.state === 'suspended') ac.resume().catch(() => { }); return ac; }
function knock(t0, freq, vol, len) {
  const c = ac; const n = Math.floor(c.sampleRate * len); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = c.createGain(); g.gain.value = vol * (A.ui().volume ?? .8);
  src.connect(f); f.connect(g); g.connect(c.destination); src.start(t0);
}
function tone(t0, freq, vol, len) {
  const c = ac; const o = c.createOscillator(); const g = c.createGain(); o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol * (A.ui().volume ?? .8) + .0002, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + len);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + len + .05);
}
// Recorded-style wooden board sounds (synthesized offline, see gen/sfx.py); the old synth is the fallback.
const SFX = {}; const SFX_NAMES = ['move', 'capture', 'check', 'castle', 'promote', 'start', 'end', 'good', 'bad'];
let sfxLoading = null;
function loadSfx() {
  if (sfxLoading) return sfxLoading; const c = audio(); if (!c) return null;
  sfxLoading = Promise.all(SFX_NAMES.map(n => fetch(`sfx/${n}.mp3`).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => c.decodeAudioData(b, ok, no))).then(buf => { SFX[n] = buf; }).catch(() => { })));
  return sfxLoading;
}
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => loadSfx(), { once: true, passive: true }));
function playSfx(name) {
  const c = audio(); const buf = SFX[name]; if (!c || !buf) return false;
  const u = A.ui(); if (u.sstyle === 'classic') return false;
  const src = c.createBufferSource(); src.buffer = buf;
  if (['move', 'capture', 'castle'].includes(name)) src.playbackRate.value = (u.sstyle === 'soft' ? .9 : .97) + Math.random() * .06;   // no two moves sound identical
  const g = c.createGain(); g.gain.value = (u.volume ?? .8) * (u.sstyle === 'soft' ? .7 : 1) * (.92 + Math.random() * .08);
  let node = src;
  if (u.sstyle === 'soft') { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = .5; node.connect(f); node = f; }   // felt-pad feel
  node.connect(g).connect(c.destination); src.start(); return true;
}
A.sound = (kind) => {
  if (!A.ui().sound) return; const c = audio(); if (!c) return; loadSfx();
  if (playSfx(kind) || (kind === 'castle' || kind === 'promote') && playSfx('move')) return;
  if (kind === 'start' || kind === 'castle' || kind === 'promote') kind = kind === 'start' ? 'good' : 'move';
  const t = c.currentTime + .005;
  try {
    if (kind === 'move') knock(t, 1800, .9, .06);
    else if (kind === 'capture') { knock(t, 900, 1.2, .09); knock(t + .025, 2400, .5, .05); }
    else if (kind === 'check') { knock(t, 1500, .8, .06); tone(t + .02, 880, .08, .18); }
    else if (kind === 'end') { tone(t, 523, .07, .5); tone(t + .08, 659, .06, .5); tone(t + .16, 784, .06, .7); }
    else if (kind === 'good') { tone(t, 660, .07, .16); tone(t + .09, 990, .07, .22); }
    else if (kind === 'bad') { tone(t, 220, .08, .25); }
  } catch (e) { }
};
A.moveSound = (m, ch) => { if (!m) return; if (A.ui().sound && navigator.vibrate) try { navigator.vibrate(m.captured ? 14 : 7); } catch (e) { } A.sound(ch && ch.game_over() ? 'end' : ch && ch.in_check() ? 'check' : m.promotion ? 'promote' : /[kq]/.test(m.flags || '') ? 'castle' : m.captured ? 'capture' : 'move'); };

/* ---------- small helpers ---------- */
A.flash = (host, kind) => { if (!host) return; host.classList.remove('fx-ok', 'fx-no'); void host.offsetWidth; host.classList.add(kind === 'ok' ? 'fx-ok' : 'fx-no'); clearTimeout(host._fx); host._fx = setTimeout(() => host.classList.remove('fx-ok', 'fx-no'), 900); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-draw]'); if (!b) return;
  const host = b.dataset.board ? $(b.dataset.board) : b.closest('.view').querySelector('.bd');
  const bd = A.boards.find(x => x.host === host); if (!bd) return;
  bd.setDraw(!bd.drawMode); b.classList.toggle('on', bd.drawMode); b.setAttribute('aria-pressed', bd.drawMode);
  if (bd.drawMode) A.toast(matchMedia('(pointer: coarse)').matches ? 'Drag to draw arrows, tap a square to highlight it' : 'Drag to draw arrows, click a square to highlight it');
});
/* Accuracy on a chess.com-like scale. We compute accuracy with Lichess's open formula, which bunches
   club games between 80 and 95; chess.com's (unpublished) CAPS2 spreads most games between 50 and 95.
   This curve stretches ours to feel the same: sloppy ~60, solid ~80, near-perfect ~95. Shown everywhere. */
const CC = [[0, 0], [40, 25], [50, 35], [60, 45], [70, 57], [77, 65], [82, 72], [86, 78], [90, 84], [93, 89], [96, 94], [98, 97], [100, 100]];
A.ccAcc = raw => { if (raw == null || !isFinite(raw)) return raw; for (let i = 1; i < CC.length; i++) if (raw <= CC[i][0]) { const [a0, e0] = CC[i - 1], [a1, e1] = CC[i]; return Math.round((e0 + (raw - a0) / (a1 - a0) * (e1 - e0)) * 10) / 10; } return 100; };
/* Game rating, chess.com style: how well you played compared with what's expected at your level.
   1) accuracy over your own decisions only (book and forced moves don't count),
   2) turned into a rating with a curve of typical accuracy by rating,
   3) pulled toward your known rating in short games, and adjusted for the opponent's strength. */
const ACC_R = [[50, 200], [65, 500], [72, 800], [77, 1000], [81, 1300], [85, 1600], [88, 1900], [91, 2200], [94, 2600], [97, 2950], [100, 3200]];
const lerp = (T, x) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [a0, e0] = T[i - 1], [a1, e1] = T[i]; return e0 + (x - a0) / (a1 - a0) * (e1 - e0); } return T[T.length - 1][1]; };
A.gameRating = ({ accs, prior = 1200, opp = null, known = true }) => {
  const a = (accs || []).filter(x => x != null); if (a.length < 6) return null;
  const acc = K.gameAcc(a); const fromMoves = lerp(ACC_R, acc);
  const w0 = known ? 14 : 3, n = a.length; let r = (prior * w0 + fromMoves * n) / (w0 + n);
  if (opp != null && known) r += Math.max(-200, Math.min(200, (opp - prior) * .2));
  return Math.max(100, Math.min(3200, Math.round(r / 10) * 10));
};
// rough game rating from accuracy (like the big sites' "game rating"); short games are noisy
A.accElo = acc => { if (acc == null) return null; const P = [[0, 100], [40, 250], [50, 400], [60, 700], [70, 1000], [80, 1400], [85, 1650], [90, 2000], [95, 2500], [98, 2900], [100, 3100]]; for (let i = 1; i < P.length; i++) if (acc <= P[i][0]) { const [a0, e0] = P[i - 1], [a1, e1] = P[i]; return Math.round((e0 + (acc - a0) / (a1 - a0) * (e1 - e0)) / 10) * 10; } return 3100; };

/* ---------- share cards: a branded image of a game, ready for socials ---------- */
// opts: { kicker, title, sub, fen, orient, last, cols: [{name, acc, rating, me}], counts: [{cls, n}], foot }
A.shareCard = async opts => {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  const F = (w, s, cond) => { x.font = `${w} ${s}px 'Instrument Sans', system-ui, sans-serif`; try { x.fontStretch = cond ? 'condensed' : 'normal'; } catch (e) { } };
  const bg = x.createRadialGradient(W * .3, -100, 50, W * .3, -100, 1300); bg.addColorStop(0, '#1d2756'); bg.addColorStop(.7, '#0a0e1c'); bg.addColorStop(1, '#070a14');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const gold = x.createLinearGradient(0, 0, 0, 80); gold.addColorStop(0, '#f9e5b8'); gold.addColorStop(1, '#e2b45f');
  // brand
  const logo = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = 'icons/logo.svg'; });
  if (logo) x.drawImage(logo, 64, 60, 64, 64);
  F(650, 40, true); x.fillStyle = '#eceefb'; x.textBaseline = 'middle'; x.fillText('NextMove', 146, 93);
  F(500, 26); x.fillStyle = '#8990b0'; x.textAlign = 'right'; x.fillText(opts.kicker || 'Game review', W - 64, 93); x.textAlign = 'left';
  // title
  F(650, 64, true); x.fillStyle = '#ffffff'; x.textBaseline = 'alphabetic'; x.fillText(opts.title || '', 64, 214, W - 128);
  F(500, 28); x.fillStyle = '#8990b0'; x.fillText(opts.sub || '', 64, 258, W - 128);
  // board
  const bs = 600, bx = (W - bs) / 2, by = 300, sq = bs / 8; const css = getComputedStyle(document.body);
  const L = css.getPropertyValue('--sqL').trim() || '#e8e3d6', D = css.getPropertyValue('--sqD').trim() || '#7a84ab';
  x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 50; x.shadowOffsetY = 24; x.fillStyle = D; x.beginPath(); x.roundRect(bx, by, bs, bs, 18); x.fill(); x.restore();
  x.save(); x.beginPath(); x.roundRect(bx, by, bs, bs, 18); x.clip();
  const flip = opts.orient === 'b'; const sqOf = s => { const f = s.charCodeAt(0) - 97, r = +s[1] - 1; return flip ? [7 - f, r] : [f, 7 - r]; };
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { x.fillStyle = (r + f) % 2 ? D : L; x.fillRect(bx + f * sq, by + r * sq, sq, sq); }
  if (opts.last) for (const s of [opts.last.slice(0, 2), opts.last.slice(2, 4)]) { const [f, r] = sqOf(s); x.fillStyle = 'rgba(241,196,104,.46)'; x.fillRect(bx + f * sq, by + r * sq, sq, sq); }
  const P = K.PIECESETS[A.ui().pieces] || K.PIECESETS.cburnett; const rows = (opts.fen || K.START).split(' ')[0].split('/');
  const imgs = {}; await Promise.all(Object.entries(P).map(([k, u]) => new Promise(ok => { const i = new Image(); i.onload = i.onerror = () => ok(); i.src = u; imgs[k] = i; })));
  rows.forEach((row, ri) => { let fi = 0; for (const ch of row) { if (/\d/.test(ch)) { fi += +ch; continue; } const code = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase(); const fr = flip ? 7 - fi : fi, rr = flip ? 7 - ri : ri; if (imgs[code]) x.drawImage(imgs[code], bx + fr * sq, by + rr * sq, sq, sq); fi++; } });
  x.restore();
  // players
  const cols = opts.cols || []; const cw = (W - 128 - 24) / Math.max(1, cols.length);
  cols.forEach((p, i) => {
    const px = 64 + i * (cw + 24), py = 940;
    x.fillStyle = p.me ? 'rgba(241,207,134,.10)' : 'rgba(150,166,232,.07)'; x.beginPath(); x.roundRect(px, py, cw, 220, 26); x.fill();
    x.strokeStyle = p.me ? 'rgba(241,207,134,.45)' : 'rgba(160,176,236,.14)'; x.lineWidth = 2; x.stroke();
    F(600, 28); x.fillStyle = '#c3c8e0'; x.fillText(p.name, px + 28, py + 52, cw - 56);
    F(600, 96, true); x.fillStyle = p.me ? gold : '#eceefb'; x.fillText(p.acc != null ? String(p.acc) : '–', px + 26, py + 150);
    const aw = x.measureText(p.acc != null ? String(p.acc) : '–').width; F(500, 28); x.fillStyle = '#8990b0'; x.fillText('% accuracy', px + 34 + aw, py + 150);
    if (p.rating) { F(500, 26); x.fillStyle = '#8990b0'; x.fillText(`Game rating ${p.rating}`, px + 28, py + 192); }
  });
  // move quality chips
  let cx = 64; const cy = 1196; F(600, 26);
  for (const { cls, n } of (opts.counts || []).filter(c => c.n)) {
    const C = K.CLS[cls]; if (!C) continue; const label = `${n} ${C.t || cls}`; const w = x.measureText(label).width + 66;
    if (cx + w > W - 64) break;
    x.fillStyle = 'rgba(150,166,232,.08)'; x.beginPath(); x.roundRect(cx, cy, w, 52, 26); x.fill();
    x.fillStyle = C.c; x.beginPath(); x.arc(cx + 28, cy + 26, 13, 0, 7); x.fill();
    F(700, 15); x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText(C.i, cx + 28, cy + 31); x.textAlign = 'left';
    F(700, 26); x.fillStyle = '#eceefb'; x.fillText(String(n), cx + 50, cy + 35); const nw = x.measureText(String(n)).width; F(500, 26); x.fillStyle = '#c3c8e0'; x.fillText(C.t || cls, cx + 58 + nw, cy + 35); cx += w + 20;
  }
  F(500, 26); x.fillStyle = '#8990b0'; x.fillText(opts.foot || 'Free, unlimited game reviews at', 64, 1300);
  const fw = x.measureText(opts.foot || 'Free, unlimited game reviews at').width; F(650, 26); x.fillStyle = gold; x.fillText(' nextmove.gg', 64 + fw, 1300);
  return new Promise(r => c.toBlob(r, 'image/png'));
};
A.shareBlob = async (blob, name = 'nextmove-game.png', text = 'My game, reviewed on NextMove') => {
  A.track('share');
  const file = new File([blob], name, { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text + ' https://nextmove.gg' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  A.toast('Image saved. Post it anywhere.');
};
A.track = k => { try { window.NM_TRACK && window.NM_TRACK(k); } catch (e) { } };
A.toast = msg => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 2600); };
A.clsChip = cls => { const c = CLS[cls]; return c ? `<em class="ic" style="background:${c.c}" title="${c.t}">${c.i}</em>` : ''; };
A.legalFor = fenGetter => sq => { const c = new Chess(fenGetter()); return c.moves({ square: sq, verbose: true }).map(m => ({ to: m.to })); };
A.setEvalBar = (el, line, orient) => {
  if (!el) return;
  const w = line ? K.winW(line) : 50;
  el.querySelector('i').style.height = (orient === 'w' ? w : 100 - w) + '%';
  el.classList.toggle('flip', orient === 'b');
  const sp = el.querySelector('span'); sp.textContent = line ? K.fmtEval(line).replace('+', '') : '';
  sp.className = (w >= 50) === (orient === 'w') ? 'lo' : 'hi';
};
A.board = (host, o) => { const mo = o.movable; o.movable = () => A.playing ? null : mo(); const b = new K.Board(host, o); A.boards.push(b); b.noAnim = !A.ui().anim; return b; };
// figurine notation for move lists: piece letter → small piece image
A.fig = (san, color) => { const m = /^([KQRBN])(.*)$/.exec(san); if (!m || !K.PIECESETS) return K.esc(san); return `<img class="fg" alt="${m[1]}" src="${K.PIECESETS[A.ui().pieces][color + m[1].toLowerCase()]}">${K.esc(m[2])}`; };
// explanation block with "show me" buttons that play the idea on a board
A.shows = [];
A.explainHTML = (ex, board, restore, extra = []) => {
  const lines = ex.text.map(t => `<p${/^The line:|^Engine line|^Line:/.test(t) ? ' class="line"' : ''}>${K.esc(t)}</p>`).join('');
  const btns = (ex.shows || []).concat(extra).map(sh => { const id = A.shows.push({ ...sh, board, restore }) - 1; return `<button class="btn quiet show" data-show="${id}">▶ ${K.esc(sh.label)}</button>`; }).join('');
  if (A.shows.length > 300) A.shows.splice(0, 100);
  return lines + (btns ? `<div class="row shows">${btns}</div>` : '');
};
A.playShow = async (sh) => {
  if (!sh || !sh.board || A.playing) return;
  A.playing = true; const b = sh.board; const c = new Chess(sh.fen); const me = c.turn();
  b.set(sh.fen, {}); await K.sleep(350);
  for (const u of sh.pv) {
    const who = c.turn() === me ? 'your' : 'their'; const before = c.fen();
    const m = K.mv(c, u); if (!m) break;
    b.set(c.fen(), { last: u, anim: true, arrows: [{ from: u.slice(0, 2), to: u.slice(2, 4), c: who === 'your' ? '#5aa54a' : '#e0402e', o: .55 }] }); A.moveSound(m, c);
    A.toast(K.plainMode() ? K.act(before, u, who).replace(/^./, x => x.toUpperCase()) : K.sanOf(before, u));
    await K.sleep(1100);
  }
  await K.sleep(700); A.playing = false;
  if (sh.restore) sh.restore(); else b.render();
};
document.addEventListener('click', e => { const b = e.target.closest('[data-show]'); if (b) A.playShow(A.shows[+b.dataset.show]); });
const AVC = ['#c2553d', '#3d7cc2', '#7b5cc2', '#2f9a7a', '#b8892e', '#c23d7b', '#5a8a3a', '#4b6b8a', '#8a4b4b', '#3a8a8a'];
A.avatar = (el, name, icon) => {
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  el.style.background = AVC[h % AVC.length];
  el.innerHTML = icon ? `<svg><use href="#${icon}"/></svg>` : esc(String(name).replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?');
};
// captured pieces + material lead for `color`
A.material = (fen, color) => {
  const cnt = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) { const l = ch.toLowerCase(); if ('pnbrq'.includes(l)) cnt[ch === l ? 'b' : 'w'][l]++; }
  const full = { p: 8, n: 2, b: 2, r: 2, q: 1 }; const opp = color === 'w' ? 'b' : 'w';
  let html = ''; let lead = 0;
  for (const t of ['q', 'r', 'b', 'n', 'p']) {
    const took = Math.max(0, full[t] - cnt[opp][t]); for (let i = 0; i < took; i++) html += `<img alt="" src="${K.PIECESETS ? K.PIECESETS[A.ui().pieces][opp + t] : ''}">`;
    lead += (cnt[color][t] - cnt[opp][t]) * K.VAL[t];
  }
  return html + (lead > 0 ? `<em>+${lead}</em>` : '');
};
A.phaseOf = (ply, fen) => { if (ply < 24) return 'op'; return K.nonPawn(new Chess(fen)) <= 20 ? 'end' : 'mid'; };
A.tick = () => { const s = S(); s.days = s.days || {}; const d = today(); s.days[d] = (s.days[d] || 0) + 1; renderMe(); };
A.streak = () => {
  const days = S().days || {}; let n = 0; const t = new Date();
  const key = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  if (!days[key(t)]) t.setDate(t.getDate() - 1);
  while (days[key(t)]) { n++; t.setDate(t.getDate() - 1); }
  return n;
};
A.due = () => { const now = Date.now(); return S().drills.filter(d => d.due <= now); };
function renderMe() {
  const s = S(); const el = $('#meCard'); if (!el) return;
  const nm = (s.name || 'You').split(',')[0].trim() || 'You';
  const st = A.streak(); el.innerHTML = `<span class="av" id="meAv"></span><b>${esc(nm)}</b><span>${Math.round(s.puz.r)} · ${st ? st + '-day streak' : 'puzzle rating'}</span>`;
  A.avatar($('#meAv'), nm);
}
A.renderMe = renderMe;

/* ---------- coach (asks Claude, if the page is allowed to) ---------- */
A.coach = async (btn, box, ctx) => {
  if (!A.sample) return;
  btn.disabled = true; box.hidden = false; box.textContent = 'Thinking…';
  const prompt = `You are a friendly, direct chess coach for a club player rated about 800–1400. In 2–4 short plain-English sentences, explain why the move is good or bad and the one idea to remember. Only mention moves that appear in the facts below. No headings or lists.

Position (FEN): ${ctx.fen}
Side to move: ${ctx.color === 'w' ? 'White' : 'Black'}
Move played: ${ctx.san}${ctx.cls ? ` (graded: ${ctx.cls})` : ''}
Engine best move: ${ctx.bestSan || 'n/a'}; best line: ${ctx.bestLine || 'n/a'}
Opponent's best reply line after the played move: ${ctx.replyLine || 'n/a'}
Evaluation before: ${ctx.evBefore}; after: ${ctx.evAfter} (White's point of view)
Engine-derived facts: ${ctx.facts || 'none'}`;
  try { await A.sample(prompt, { modelTier: 'quick', onText: ({ text }) => { box.textContent = text; } }); }
  catch (e) { box.textContent = e && e.code === 'rate_limited' ? 'The coach is busy — try again in a minute.' : 'The coach is unavailable right now.'; if (e && e.code === 'not_granted') { A.sample = null; $$('.coach').forEach(b => b.hidden = true); } }
  btn.disabled = false;
};
A.coachCtx = (fen, u, pre, post, cls) => {
  const color = fen.split(' ')[1]; const c = new Chess(fen); const m = K.mv(c, u);
  const ex = K.explain({ fen, u, cls, pre, post, color });
  return { fen, color, san: m ? m.san : u, cls, bestSan: pre.lines[0] && pre.lines[0].move ? K.sanOf(fen, pre.lines[0].move) : '', bestLine: pre.lines[0] ? K.pvSan(fen, pre.lines[0].pv, 6) : '', replyLine: post.lines[0] ? K.pvSan(c.fen(), post.lines[0].pv || [], 6) : '', evBefore: K.fmtEval(pre.lines[0]), evAfter: K.fmtEval(post.lines[0]), facts: ex.text.join(' ') };
};

/* ---------- router ---------- */
const VIEWS = ['home', 'play', 'review', 'analysis', 'train', 'progress'];
A.cur = () => { const v = location.hash.slice(1); return VIEWS.includes(v) ? v : 'home'; };
function route() {
  const v = A.cur();
  $$('main .view').forEach(s => { if (VIEWS.includes(s.id)) s.hidden = s.id !== v; });
  $$('.nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + v));
  placePill();
  Object.entries(A.views).forEach(([k, o]) => { if (k !== v && o.leave) o.leave(); });
  A.views[v] && A.views[v].enter && A.views[v].enter();
  // view ids double as URL fragments, so the browser may try to scroll to them after unhiding; pin the top
  window.scrollTo(0, 0); requestAnimationFrame(() => window.scrollTo(0, 0)); setTimeout(() => window.scrollTo(0, 0), 60);
}
A.route = route;
// the champagne pill glides to the active dock item
function placePill() {
  const pill = $('.dock .pill'), a = $('.dock a.on'); if (!pill || !a) return;
  pill.style.width = a.offsetWidth + 'px'; pill.style.height = a.offsetHeight + 'px';
  pill.style.transform = `translate(${a.offsetLeft}px,${a.offsetTop}px)`;
  if (!pill.classList.contains('ready')) requestAnimationFrame(() => pill.classList.add('ready'));
}
window.addEventListener('resize', placePill);
if (document.fonts) document.fonts.ready.then(placePill);
A.refresh = () => { renderMe(); Object.values(A.views).forEach(o => o.refresh && o.refresh()); };
window.addEventListener('hashchange', route);
A.go = v => { if (location.hash === '#' + v) route(); else location.hash = v; };

/* ---------- boot (after all view scripts have loaded) ---------- */
window.addEventListener('load', async () => {
  applyUI(); renderMe(); route();
  K.eng.readyP.then(() => $$('.engState').forEach(e => { e.textContent = 'Stockfish 17.1'; e.className = 'eng ok engState'; })).catch(() => $$('.engState').forEach(e => { e.textContent = 'Engine failed'; e.className = 'eng bad engState'; }));
  await K.loadBook();
  const get = async f => { try { return await (await fetch(f)).json(); } catch (e) { return []; } };
  const [puz, eg, gamb, crs] = await Promise.all([get('puzzles.json'), get('endgames.json'), get('gambits.json'), get('courses.json')]);
  A.COURSES = crs || []; A.COURSES.forEach(c => K.addLine(c.name, c.moves, false)); K.fillNames(A.COURSES);
  A.PUZ = puz.map((p, i) => ({ id: p.id || 'p' + i, ...p })); A.EG = eg; A.GAMB = gamb;
  A.GAMB.filter(g => g.kind === 'gambit').forEach(g => K.addLine(g.name, g.moves, false)); K.fillNames(A.GAMB.filter(g => g.kind === 'gambit'));
  A.dataReady = true; A.refresh(); route();
  K.onSync(() => { applyUI(); A.refresh(); });
  K.initSync();
  try { if (window.claude?.use) { A.sample = await claude.use('sample'); A.refresh(); } } catch (e) { A.sample = null; }
});
return A;
})();
