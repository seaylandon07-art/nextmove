/* NextMove shell: shared helpers, settings, sounds, router */
window.A = (() => {
const { esc, $, CLS } = K;
const S = () => K.S();
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const DAY = 864e5, GOAL = 12;
const A = { S, $$, uid, today, DAY, GOAL, views: {}, PUZ: [], EG: [], GAMB: [], sample: null };

/* ---------- settings ---------- */
const UI_DEF = { board: 'blue', pieces: 'cburnett', sound: true, coords: true, anim: true, notation: 'plain', arrow: 'green' };
const ARROWS = [['green', 'Green', '#4fcf8f'], ['gold', 'Champagne gold', '#e9b850'], ['blue', 'Blue', '#5b9dff'], ['red', 'Red', '#ff5a5a'], ['orange', 'Orange', '#f2a33a']];
K.arrowColor = () => (ARROWS.find(a => a[0] === A.ui().arrow) || ARROWS[0])[2];
A.ui = () => { const s = S(); s.ui = Object.assign({}, UI_DEF, s.ui || {}); return s.ui; };
A.boards = [];
function applyUI() {
  const u = A.ui();
  document.documentElement.dataset.board = u.board;
  document.body.classList.toggle('nocoords', !u.coords);
  if (K.PIECESETS && K.PIECESETS[u.pieces]) K.setPieces(K.PIECESETS[u.pieces]);
  A.boards.forEach(b => { b.noAnim = !u.anim; b.render(); });
}
A.applyUI = applyUI;
const BOARDS = [['blue', '#e8e3d6', '#7a84ab'], ['green', '#ebecd0', '#739552'], ['walnut', '#f0d9b5', '#b58863'], ['graphite', '#d4d4cf', '#7b7e85'], ['night', '#9aa4b1', '#4f5b6b']];
function renderSettings() {
  const u = A.ui();
  $('#swatches').innerHTML = BOARDS.map(([n, a, b]) => `<button class="sw${u.board === n ? ' on' : ''}" data-b="${n}" style="--a:${a};--b:${b}" aria-label="${n} board"><i></i><i></i><i></i><i></i></button>`).join('');
  $('#psets').innerHTML = Object.keys(K.PIECESETS || {}).map(n => `<button class="pset${u.pieces === n ? ' on' : ''}" data-p="${n}" aria-label="${n} pieces">${['wn', 'wq', 'bk'].map(p => `<img alt="" src="${K.PIECESETS[n][p]}">`).join('')}</button>`).join('');
  $('#arrowSw').innerHTML = ARROWS.map(([k, n, c]) => `<button class="asw${u.arrow === k ? ' on' : ''}" data-a="${k}" style="--c:${c}"><i></i>${n}</button>`).join('');
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
$('#notSeg').onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; A.ui().notation = b.dataset.n; K.save(); renderSettings(); A.refresh(); };
$('#sSound').onchange = e => { A.ui().sound = e.target.checked; K.save(); };
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
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start(t0);
}
function tone(t0, freq, vol, len) {
  const c = ac; const o = c.createOscillator(); const g = c.createGain(); o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + len);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + len + .05);
}
A.sound = (kind) => {
  if (!A.ui().sound) return; const c = audio(); if (!c) return; const t = c.currentTime + .005;
  try {
    if (kind === 'move') knock(t, 1800, .9, .06);
    else if (kind === 'capture') { knock(t, 900, 1.2, .09); knock(t + .025, 2400, .5, .05); }
    else if (kind === 'check') { knock(t, 1500, .8, .06); tone(t + .02, 880, .08, .18); }
    else if (kind === 'end') { tone(t, 523, .07, .5); tone(t + .08, 659, .06, .5); tone(t + .16, 784, .06, .7); }
    else if (kind === 'good') { tone(t, 660, .07, .16); tone(t + .09, 990, .07, .22); }
    else if (kind === 'bad') { tone(t, 220, .08, .25); }
  } catch (e) { }
};
A.moveSound = (m, ch) => { if (!m) return; if (A.ui().sound && navigator.vibrate) try { navigator.vibrate(m.captured ? 14 : 7); } catch (e) { } A.sound(ch && ch.game_over() ? 'end' : ch && ch.in_check() ? 'check' : m.captured ? 'capture' : 'move'); };

/* ---------- small helpers ---------- */
A.flash = (host, kind) => { if (!host) return; host.classList.remove('fx-ok', 'fx-no'); void host.offsetWidth; host.classList.add(kind === 'ok' ? 'fx-ok' : 'fx-no'); clearTimeout(host._fx); host._fx = setTimeout(() => host.classList.remove('fx-ok', 'fx-no'), 900); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-draw]'); if (!b) return;
  const host = b.dataset.board ? $(b.dataset.board) : b.closest('.view').querySelector('.bd');
  const bd = A.boards.find(x => x.host === host); if (!bd) return;
  bd.setDraw(!bd.drawMode); b.classList.toggle('on', bd.drawMode); b.setAttribute('aria-pressed', bd.drawMode);
  if (bd.drawMode) A.toast(matchMedia('(pointer: coarse)').matches ? 'Drag to draw arrows, tap a square to highlight it' : 'Drag to draw arrows, click a square to highlight it');
});
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
const VIEWS = ['play', 'review', 'analysis', 'train', 'progress'];
A.cur = () => { const v = location.hash.slice(1); return VIEWS.includes(v) ? v : 'play'; };
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
  const [puz, eg, gamb] = await Promise.all([get('puzzles.json'), get('endgames.json'), get('gambits.json')]);
  A.PUZ = puz.map((p, i) => ({ id: p.id || 'p' + i, ...p })); A.EG = eg; A.GAMB = gamb;
  A.GAMB.filter(g => g.kind === 'gambit').forEach(g => K.addLine(g.name, g.moves, false)); K.fillNames(A.GAMB.filter(g => g.kind === 'gambit'));
  A.dataReady = true; A.refresh(); route();
  K.onSync(() => { applyUI(); A.refresh(); });
  K.initSync();
  try { if (window.claude?.use) { A.sample = await claude.use('sample'); A.refresh(); } } catch (e) { A.sample = null; }
});
return A;
})();
