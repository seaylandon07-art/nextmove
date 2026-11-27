/* NextMove — Review */
{
const { esc, $, CLS, BAD } = K; const { S, $$ } = A;
const R = { moves: [], fens: [], an: [], cls: [], cur: 0, me: null, token: null, ex: null, retry: false, done: false, headers: {}, expl: {} };
const RS = R;
const rb = A.board($('#review .bd'), {
  movable: () => R.fens.length ? 'both' : null,
  legal: A.legalFor(() => R.ex ? R.ex.fen : R.fens[R.cur]),
  onMove: (f, t, pr) => reviewMove(f, t, pr)
});
function renderRecent() {
  const gs = S().games.slice().reverse().slice(0, 12);
  $('#recent').innerHTML = gs.length ? gs.map(g => `<button class="moment" data-id="${esc(g.id)}"><span>${esc(g.date.slice(5))}</span><span></span><b style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.white)} – ${esc(g.black)}</b><span>${esc(g.result === '1/2-1/2' ? '½–½' : g.result === '*' ? 'unfinished' : g.result)}</span></button>`).join('') : '<p class="small mute">Games you play here appear in this list.</p>';
}
$('#recent').onclick = e => { const b = e.target.closest('[data-id]'); if (!b) return; const g = S().games.find(x => x.id === b.dataset.id); if (g && loadReview(g.pgn, g.me)) R.gid = g.id; };
$('#pgnFile').onchange = async e => { const f = e.target.files[0]; if (f) $('#pgnIn').value = await f.text(); };
$('#analyseBtn').onclick = () => {
  const txt = $('#pgnIn').value.trim(); if (!txt) { A.toast('Paste a PGN first'); return; }
  const first = txt.split(/\n\s*\n(?=\[Event )/)[0];
  if (loadReview(first, null)) { S().games.push({ id: A.uid(), pgn: first, date: A.today(), white: R.headers.White || 'White', black: R.headers.Black || 'Black', result: R.headers.Result || '*', src: 'import', me: R.me }); K.save(); renderRecent(); }
};
const SAMPLE = `[Event "Paris"]\n[Date "1858.11.02"]\n[White "Paul Morphy"]\n[Black "Duke Karl / Count Isouard"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;
$('#sampleBtn').onclick = () => { $('#pgnIn').value = SAMPLE; $('#analyseBtn').click(); };
function detectMe(h) {
  const nm = (S().name || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (nm.some(n => (h.White || '').toLowerCase() === n)) return 'w';
  if (nm.some(n => (h.Black || '').toLowerCase() === n)) return 'b';
  return null;
}
function loadReview(pgn, me) {
  if (R.token) { R.token.cancel = true; K.eng.stop(); }
  const c = new Chess();
  const clean = pgn.replace(/\{[^}]*\}/g, ' ').replace(/\$\d+/g, '');
  if (!c.load_pgn(clean, { sloppy: true })) { A.toast("Couldn't read that PGN"); return false; }
  const hist = c.history({ verbose: true }); if (!hist.length) { A.toast('That game has no moves'); return false; }
  R.headers = c.header();
  const start = new Chess(R.headers.SetUp === '1' && R.headers.FEN ? R.headers.FEN : undefined);
  R.fens = [start.fen()]; R.moves = [];
  for (const m of hist) { const fb = start.fen(); const mm = start.move(m.san); R.moves.push({ san: mm.san, u: K.uciOf(mm), color: mm.color, fen: fb, captured: mm.captured }); R.fens.push(start.fen()); }
  R.gid = null; R.an = []; R.cls = []; R.cur = 0; R.ex = null; R.retry = false; R.done = false; R.expl = {}; R.added = 0;
  const pick = $('#asSide').value;
  R.me = me || (pick === 'auto' ? detectMe(R.headers) : pick) || null;
  rb.flip(R.me === 'b' ? 'b' : 'w');
  $('#rInput').hidden = true; $('#rResult').hidden = false;
  $('#rTitle').textContent = `${R.headers.White || 'White'} vs ${R.headers.Black || 'Black'}`;
  $('#rSub').textContent = [R.headers.Result && R.headers.Result.replace('1/2-1/2', '½–½'), R.headers.Date && R.headers.Date.replace(/\?/g, '').replace(/\.+$/, ''), K.openingName(R.fens)].filter(Boolean).join(' · ');
  render(); run(); window.scrollTo({ top: 0 });
  return true;
}
A.loadReview = loadReview;
A.reviewGid = id => { R.gid = id; };
async function run() {
  const token = R.token = { cancel: false };
  const depth = +S().depth || 14; const n = R.fens.length;
  $('#rprog').hidden = false;
  for (let i = 0; i < n; i++) {
    if (token.cancel) return;
    R.an[i] = await K.analyse(R.fens[i], depth, 2, { token });
    if (token.cancel) return;
    if (i > 0) classifyAt(i - 1);
    $('#rprog i').style.width = ((i + 1) / n * 100) + '%';
    if (i === R.cur || i === R.cur + 1 || i % 4 === 0) render();
  }
  R.done = true; $('#rprog').hidden = true; finish(); render();
}
function inBook(i, R = RS) { for (let k = 0; k <= i; k++) { const e = K.BOOK.get(K.key4(R.fens[k])); if (!e || !e.moves.has(R.moves[k].u)) return false; } return true; }
function classifyAt(i, R = RS) {
  const m = R.moves[i]; const prev = i > 0 ? R.cls[i - 1] : null;
  const prevWinBefore = i > 0 && R.an[i - 1] ? K.winFor(R.an[i - 1].lines[0], m.color) : null;
  R.cls[i] = K.classify({ fen: m.fen, u: m.u, pre: R.an[i], post: R.an[i + 1], color: m.color, inBook: inBook(i, R), prevCls: prev && prev.cls, prevWinBefore });
  R.cls[i].wb = K.winFor(R.an[i].lines[0], m.color); R.cls[i].wa = K.winFor(R.an[i + 1].lines[0], m.color);
}
function addDrill(i, R = RS) {
  const m = R.moves[i], c = R.cls[i]; const s = S();
  if (s.drills.some(d => d.fen === m.fen)) return false;
  s.drills.push({ id: A.uid(), fen: m.fen, played: m.u, best: R.an[i].lines[0].move, cls: c.cls, src: `${R.headers.White || '?'} – ${R.headers.Black || '?'}`, box: 0, due: Date.now(), n: 0, ok: 0, created: Date.now() });
  return true;
}
// Every time your opponent made a mistake, the position after it is a puzzle: you to move, with a shot
// that wins. Whether you found it in the game or not, it comes back in Train → Your game puzzles.
function addGamePuzzles(R) {
  const s = S(); s.mypuz = s.mypuz || [];
  const src = `${R.headers.White || '?'} – ${R.headers.Black || '?'}`;
  for (let i = 0; i < R.moves.length - 1; i++) {
    const m = R.moves[i], c = R.cls[i]; if (m.color === R.me || !c || !['mistake', 'blunder'].includes(c.cls)) continue;
    const fen = R.fens[i + 1], an = R.an[i + 1] && R.an[i + 1].lines[0]; if (!an || !an.pv || !an.pv.length) continue;
    const win = K.winFor(an, R.me); if (win < 70 || s.mypuz.some(p => p.fen === fen)) continue;
    const plies = an.mate != null ? Math.min(an.pv.length, Math.abs(an.mate) * 2 - 1) : Math.min(an.pv.length, 3);
    const sol = an.pv.slice(0, plies % 2 ? plies : plies - 1); if (!sol.length) continue;
    const mine = R.moves[i + 1]; const found = !!mine && mine.u === sol[0];
    s.mypuz.push({ id: 'g' + A.uid(), fen, sol, pre: R.fens[i], last: m.u, theme: an.mate != null ? 'Mate' : 'Punish the mistake', src, move: Math.floor(i / 2) + 2, found, rating: Math.round(s.puz.r), created: Date.now(), tries: 0, solved: 0 });
  }
  s.mypuz = s.mypuz.slice(-300);
}
function finish(R = RS) {
  if (R === RS) A.track('review');
  const sum = summary(R); const s = S(); const key = R.fens[R.fens.length - 1] + '|' + R.moves.length;
  if (s.reviews.some(r => r.key === key)) return;
  if (R.gid) s.reviews = s.reviews.filter(r => r.gid !== R.gid);
  const phase = { op: 0, mid: 0, end: 0 }, nPhase = { op: 0, mid: 0, end: 0 };
  R.moves.forEach((m, i) => {
    if (R.me && m.color !== R.me) return;
    const ph = A.phaseOf(i, m.fen); nPhase[ph]++;
    const c = R.cls[i]; if (!c) return;
    if (['mistake', 'blunder', 'miss'].includes(c.cls)) { phase[ph]++; if (R.me && addDrill(i, R)) R.added++; }
  });
  if (R.me) addGamePuzzles(R);
  if (R.me) {
    const res = R.headers.Result; const won = (R.me === 'w' && res === '1-0') || (R.me === 'b' && res === '0-1');
    if (!won) for (let i = 20; i < R.fens.length; i++) {
      const fen = R.fens[i]; if (fen.split(' ')[1] !== R.me) continue;
      if (K.winFor(R.an[i].lines[0], R.me) >= 85 && Math.abs(K.cpv(R.an[i].lines[0])) < 9000) { if (!s.conv.some(c => c.fen === fen)) s.conv.push({ id: A.uid(), fen, src: `${R.headers.White || '?'} – ${R.headers.Black || '?'}`, title: `Move ${Math.ceil(i / 2)}, ${K.fmtEval(R.an[i].lines[0])}` }); break; }
    }
  }
  s.reviews.push({ key, gid: R.gid || null, date: A.today(), white: R.headers.White || 'White', black: R.headers.Black || 'Black', me: R.me, accW: sum.acc.w, accB: sum.acc.b, opening: sum.opening, phase, nPhase, counts: sum.counts });
  K.save(); A.refresh();
}
function summary(R = RS) {
  const acc = { w: [], b: [] }, ph = { w: { op: [], mid: [], end: [] }, b: { op: [], mid: [], end: [] } }, counts = { w: {}, b: {} };
  R.moves.forEach((m, i) => { const c = R.cls[i]; if (!c) return; const a = c.cls === 'book' || c.cls === 'forced' ? 100 : K.moveAcc(c.loss); acc[m.color].push(a); ph[m.color][A.phaseOf(i, m.fen)].push(a); counts[m.color][c.cls] = (counts[m.color][c.cls] || 0) + 1; });
  const pa = c => Object.fromEntries(Object.entries(ph[c]).map(([k, v]) => [k, v.length ? K.gameAcc(v) : null]));
  return { acc: { w: K.gameAcc(acc.w), b: K.gameAcc(acc.b) }, phase: { w: pa('w'), b: pa('b') }, counts, opening: K.openingName(R.fens) };
}
// game rating per side: own decisions only, anchored to known ratings (PGN Elo, or your play rating)
function gr(c) {
  const accs = R.moves.map((m, i) => m.color === c && R.cls[i] && !['book', 'forced'].includes(R.cls[i].cls) ? K.moveAcc(R.cls[i].loss) : null);
  const elo = x => { const v = parseInt(R.headers[x === 'w' ? 'WhiteElo' : 'BlackElo'], 10); return isFinite(v) && v > 0 ? v : null; };
  const mine = S().elo ? S().elo.r : null;
  const prior = elo(c) || (R.me === c && mine) || 1200; const opp = elo(c === 'w' ? 'b' : 'w');
  return A.gameRating({ accs, prior, opp, known: !!(elo(c) || (R.me === c && mine)) });
}
function render() {
  if (!R.fens.length) return;
  $('#shareReview').hidden = !R.done;
  const i = R.cur; const fen = R.ex ? R.ex.fen : R.fens[i];
  const arrows = []; let badge = null, last = null;
  if (R.ex) { last = R.ex.last; const l = R.ex.line; if (l && l.move) arrows.push({ from: l.move.slice(0, 2), to: l.move.slice(2, 4), c: '#e6a83a' }); }
  else if (i > 0) {
    const m = R.moves[i - 1]; last = m.u; const c = R.cls[i - 1];
    if (c) { badge = { sq: m.u.slice(2, 4), c: CLS[c.cls].c, i: CLS[c.cls].i }; const b = R.an[i - 1].lines[0]; if (b && b.move && b.move !== m.u && !['book', 'forced'].includes(c.cls)) arrows.push({ from: b.move.slice(0, 2), to: b.move.slice(2, 4), c: '#5aa54a' }); }
  }
  if (R.retry) { arrows.length = 0; badge = null; }
  rb.set(fen, { last, arrows, badge, anim: R.animNext }); R.animNext = false;
  A.setEvalBar($('#review .evalbar'), R.ex ? R.ex.line : R.an[i] && R.an[i].lines[0], rb.orient);
  const sm = summary(); const done = R.cls.filter(Boolean).length;
  const W = esc(R.headers.White || 'White'), B = esc(R.headers.Black || 'Black');
  const rows = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  const pf = v => v == null ? '–' : Math.round(v);
  $('#sumgrid').innerHTML = `<span class="hd"></span><span class="hd" title="${W}">${W}</span><span class="hd" title="${B}">${B}</span>
    <span>Accuracy</span><span class="big n">${A.ccAcc(sm.acc.w) ?? '–'}</span><span class="big n">${A.ccAcc(sm.acc.b) ?? '–'}</span>
    ${R.done ? `<span>Game rating</span><span class="n">${gr('w') ?? '–'}</span><span class="n">${gr('b') ?? '–'}</span>` : ''}
    ${R.done ? [['op', 'Opening'], ['mid', 'Middlegame'], ['end', 'Endgame']].filter(([k]) => sm.phase.w[k] != null || sm.phase.b[k] != null).map(([k, n]) => `<span class="mute">${n}</span><span class="n">${pf(A.ccAcc(sm.phase.w[k]))}</span><span class="n">${pf(A.ccAcc(sm.phase.b[k]))}</span>`).join('') : ''}
    ${done ? rows.filter(k => sm.counts.w[k] || sm.counts.b[k]).map(k => `<span>${A.clsChip(k)} ${CLS[k].t}</span><span class="n">${sm.counts.w[k] || 0}</span><span class="n">${sm.counts.b[k] || 0}</span>`).join('') : ''}`;
  // key moments
  if (R.done) {
    const ms = R.cls.map((c, k) => ({ c, k })).filter(x => x.c && BAD.includes(x.c.cls) && x.c.cls !== 'inaccuracy' && (!R.me || R.moves[x.k].color === R.me)).sort((a, b) => b.c.loss - a.c.loss).slice(0, 4).sort((a, b) => a.k - b.k);
    $('#momentsSec').hidden = !ms.length;
    $('#moments').innerHTML = ms.map(({ c, k }) => { const m = R.moves[k]; return `<button class="moment" data-j="${k + 1}">${A.clsChip(c.cls)}<span>${Math.floor(k / 2) + 1}${m.color === 'w' ? '.' : '…'}</span><b style="font-weight:500">${A.fig(m.san, m.color)}</b><span>−${Math.round(c.loss)}%</span></button>`; }).join('');
  } else $('#momentsSec').hidden = true;
  const ml = [];
  for (let k = 0; k < R.moves.length; k += 2) {
    const cell = j => { const m = R.moves[j]; if (!m) return '<b></b>'; const c = R.cls[j]; return `<b class="mv${R.cur === j + 1 && !R.ex ? ' cur' : ''}" data-j="${j + 1}">${c && c.cls !== 'best' && c.cls !== 'excellent' && c.cls !== 'good' && c.cls !== 'book' ? A.clsChip(c.cls) : ''}${A.fig(m.san, m.color)}</b>`; };
    ml.push(`<li><span>${k / 2 + 1}</span>${cell(k)}${cell(k + 1)}</li>`);
  }
  $('#rmoves').innerHTML = ml.join('');
  const cur = $('#rmoves .cur'); if (cur) { const box = $('#rmoves'); const top = cur.offsetTop - box.offsetTop; if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 30) box.scrollTop = top - box.clientHeight / 2; }
  detail(); graph();
  $('#drillMine').hidden = !(R.done && R.added); $('#drillMine').textContent = `Drill ${R.added} mistake${R.added === 1 ? '' : 's'}`;
  $('#exBar').hidden = !R.ex; if (R.ex) $('#exLine').textContent = R.ex.line ? `${K.fmtEval(R.ex.line)}  ${K.pvSan(R.ex.fen, R.ex.line.pv, 6)}` : 'Analysing…';
}
function detail() {
  const box = $('#rdetail'); const i = R.cur;
  if (R.retry) return;
  if (R.ex) { box.innerHTML = '<p class="small mute">You’re exploring your own line. The engine line is shown above.</p>'; return; }
  if (i === 0) { box.innerHTML = `<p class="small mute">Step through with ← → or tap a move. Drag pieces to try your own ideas.</p>`; return; }
  const m = R.moves[i - 1], c = R.cls[i - 1];
  if (!c) { box.innerHTML = `<p class="small mute">Analysing ${esc(m.san)}…</p>`; return; }
  const ex = R.expl[i] || (R.expl[i] = K.explain({ fen: m.fen, u: m.u, cls: c.cls, pre: R.an[i - 1], post: R.an[i], color: m.color, openName: K.openingName(R.fens.slice(0, i + 1)) }));
  const bad = BAD.includes(c.cls);
  box.innerHTML = `<div class="dh">${A.clsChip(c.cls)}<span>${esc(ex.head)}</span><span class="ev">${esc(K.fmtEval(R.an[i].lines[0]))}</span></div>
    ${A.explainHTML(ex, rb, () => render())}
    <div class="row" style="margin-top:2px">${bad ? `<button class="btn sec" id="retryBtn">Find a better move</button>` : ''}${A.sample ? `<button class="btn quiet coach" id="coachR"><svg class="i"><use href="#i-chat"/></svg>Ask coach</button>` : ''}${bad && !R.me ? `<button class="btn quiet" id="saveDrill">Save to drills</button>` : ''}</div>
    <p class="coachbox" id="coachRbox" hidden></p>`;
  const cb = $('#coachR'); if (cb) cb.onclick = () => A.coach(cb, $('#coachRbox'), A.coachCtx(m.fen, m.u, R.an[i - 1], R.an[i], c.cls));
  const rt = $('#retryBtn'); if (rt) rt.onclick = startRetry;
  const sd = $('#saveDrill'); if (sd) sd.onclick = () => { addDrill(i - 1); K.save(); A.refresh(); A.toast('Saved to your drills'); sd.disabled = true; };
}
function startRetry() {
  R.retry = true; R.cur = R.cur - 1; R.ex = null; render();
  const m = R.moves[R.cur];
  $('#rdetail').innerHTML = `<div class="dh">Find a better move than: ${esc(K.moveName(m.fen, m.u))}</div><p class="small mute">Any move about as good as the engine’s best counts.</p><div id="retryFb"></div><div class="row"><button class="btn quiet" id="retryCancel">Cancel</button></div>`;
  $('#retryCancel').onclick = () => { R.retry = false; R.cur++; render(); };
}
async function reviewMove(f, t, pr) {
  const base = R.ex ? R.ex.fen : R.fens[R.cur];
  const c = new Chess(base); const m = c.move({ from: f, to: t, promotion: pr || 'q' }); if (!m) return false;
  const u = K.uciOf(m); A.moveSound(m, c);
  if (R.retry) {
    rb.set(c.fen(), { last: u });
    $('#retryFb').innerHTML = '<p class="small mute">Checking…</p>';
    const j = await K.judge(base, u, { depth: 14 });
    const cls = j.ok ? (j.isBest ? 'best' : 'excellent') : (j.loss > 22 ? 'blunder' : j.loss > 12 ? 'mistake' : 'inaccuracy');
    const ex = K.explain({ fen: base, u, cls, pre: j.pre, post: j.post, color: base.split(' ')[1] });
    A.sound(j.ok ? 'good' : 'bad');
    const nm = esc(K.moveName(base, u));
    $('#retryFb').innerHTML = `<div class="fb ${j.ok ? 'ok' : 'no'}"><b>${j.ok ? nm + ' — that works' : nm + ' — not quite'}</b>${A.explainHTML(ex, rb, () => rb.set(base, {}))}${j.ok && !j.isBest ? `<p>The engine’s top choice was: ${esc(K.moveName(base, j.best.move))}.</p>` : ''}</div><div class="row" style="margin-top:8px"><button class="btn" id="retryAgain">${j.ok ? 'Back to the game' : 'Try again'}</button>${!j.ok ? '<button class="btn sec" id="retryShow">Show best</button>' : ''}</div>`;
    $('#retryAgain').onclick = () => { if (j.ok) { R.retry = false; R.cur++; render(); } else rb.set(base, {}); };
    const sh = $('#retryShow'); if (sh) sh.onclick = () => { const b = j.best.move; rb.set(base, { arrows: [{ from: b.slice(0, 2), to: b.slice(2, 4), c: '#5aa54a' }] }); };
    return true;
  }
  if (!R.ex && R.moves[R.cur] && R.moves[R.cur].u === u) { R.cur++; render(); return true; }
  R.ex = { fen: c.fen(), last: u, line: null };
  render(); explore();
  return true;
}
async function explore() {
  const ex = R.ex; if (!ex) return;
  K.eng.stop('ex');
  const r = await K.analyse(ex.fen, 15, 1, { tag: 'ex', onInfo: j => { if (R.ex === ex && j.lines[0] && j.lines[0].depth >= 8) { ex.line = j.lines[0]; $('#exLine').textContent = `${K.fmtEval(ex.line)}  ${K.pvSan(ex.fen, ex.line.pv, 6)}`; A.setEvalBar($('#review .evalbar'), ex.line, rb.orient); } } });
  if (R.ex === ex) { ex.line = r.lines[0]; render(); }
}
$('#exBack').onclick = () => { R.ex = null; render(); };
function go(i) {
  if (!R.fens.length || R.retry) return; R.ex = null;
  const n = Math.max(0, Math.min(R.fens.length - 1, i));
  if (n === R.cur + 1) { R.animNext = true; const m = R.moves[R.cur]; A.sound(m.captured ? 'capture' : 'move'); }
  R.cur = n; render();
}
$('#rmoves').onclick = e => { const b = e.target.closest('[data-j]'); if (b) go(+b.dataset.j); };
$('#moments').onclick = e => { const b = e.target.closest('[data-j]'); if (b) go(+b.dataset.j); };
$('#rnav').onclick = e => { const b = e.target.closest('[data-nav]'); if (!b) return; const n = b.dataset.nav; if (n === 'flip') { rb.flip(); render(); return; } go(n === 'first' ? 0 : n === 'prev' ? R.cur - 1 : n === 'next' ? R.cur + 1 : R.fens.length - 1); };
$('#nextMistake').onclick = () => { for (let k = R.cur; k < R.moves.length; k++) { const c = R.cls[k]; if (c && BAD.includes(c.cls) && (!R.me || R.moves[k].color === R.me) && k + 1 > R.cur) { go(k + 1); return; } } A.toast('No more mistakes after this point'); };
$('#newReview').onclick = () => { if (R.token) { R.token.cancel = true; K.eng.stop(); } R.fens = []; R.moves = []; R.retry = false; $('#rInput').hidden = false; $('#rResult').hidden = true; rb.set(K.START); A.setEvalBar($('#review .evalbar'), null, 'w'); renderRecent(); };
$('#drillMine').onclick = () => { A.go('train'); A.startTrain('drills'); };
$('#toAnalysis').onclick = () => { if (!R.fens.length) return; A.openAnalysis(R.fens[0], R.moves.map(m => m.u), R.cur); };
document.addEventListener('keydown', e => {
  if (A.cur() !== 'review' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft') go(R.cur - 1); if (e.key === 'ArrowRight') go(R.cur + 1);
});
function graph() {
  const s = $('#graph'); if ((R.fens || []).length < 2) { $('#graphWrap').classList.add('empty'); s.innerHTML = ''; return; } $('#graphWrap').classList.remove('empty'); const W = s.clientWidth, H = s.clientHeight; if (!W) return;
  const n = R.fens.length; $('#graphWrap').classList.toggle('empty', n < 2); if (n < 2) { s.innerHTML = ''; return; }
  const x = i => i / (n - 1) * W, y = w => H - w / 100 * H;
  let d = `M0,${H}`; for (let i = 0; i < n; i++) { const w = R.an[i] ? K.winW(R.an[i].lines[0]) : 50; d += ` L${x(i).toFixed(1)},${y(w).toFixed(1)}`; } d += ` L${W},${H} Z`;
  let dots = '';
  R.cls.forEach((c, i) => { if (c && ['mistake', 'blunder', 'miss', 'brilliant', 'great'].includes(c.cls)) { const w = R.an[i + 1] ? K.winW(R.an[i + 1].lines[0]) : 50; dots += `<circle cx="${x(i + 1)}" cy="${y(w)}" r="3.5" fill="${CLS[c.cls].c}" stroke="#2c2e32" stroke-width="1.5"/>`; } });
  s.innerHTML = `<rect width="${W}" height="${H}" class="gb"/><path d="${d}" class="ga"/><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="gm"/><line x1="${x(R.cur)}" x2="${x(R.cur)}" y1="0" y2="${H}" class="gc"/>${dots}`;
}
const gro = new ResizeObserver(graph); gro.observe($('#graph'));
$('#graph').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); go(Math.round((e.clientX - r.left) / r.width * (R.fens.length - 1))); };
/* ---------- import from Chess.com / Lichess ---------- */
const IMP = { site: 'chesscom', games: [] };
if (window.NM_WEB) $('#impSec').hidden = false;
(() => { const s = S(); if (s.imp) { IMP.site = s.imp.site || 'chesscom'; $('#impUser').value = s.imp.user || ''; } })();
const siteSeg = () => $$('#impSite button').forEach(b => b.classList.toggle('on', b.dataset.site === IMP.site));
siteSeg();
$('#impSite').onclick = e => { const b = e.target.closest('[data-site]'); if (!b) return; IMP.site = b.dataset.site; siteSeg(); };
const resOf = g => g.result === '1/2-1/2' ? 'd' : g.result === '*' ? 'u' : (g.result === '1-0') === (g.me === 'w') ? 'w' : 'l';
function reviewedGid(id) { return S().reviews.some(r => r.gid === id); }
function renderImp() {
  const gs = IMP.games; if (!gs.length) return;
  $('#impOut').innerHTML = `<div class="imp-head"><span class="small mute">${gs.length} recent games</span><button class="btn quiet" id="impAll" type="button">Review all in the background</button></div><div class="imp-list">${gs.map(g => {
    const opp = g.me === 'w' ? g.black : g.white, oppR = g.me === 'w' ? g.blackElo : g.whiteElo, r = resOf(g);
    return `<button class="imp" data-gid="${esc(g.id)}"><span class="res ${r}">${{ w: 'W', l: 'L', d: '½', u: '…' }[r]}</span><span><b>vs ${esc(opp)}${oppR ? ` (${oppR})` : ''}</b><small>${esc(g.time || '')} · ${esc(g.date || '')} · you played ${g.me === 'w' ? 'White' : 'Black'}</small></span><em class="${reviewedGid(g.id) ? 'done' : ''}">${reviewedGid(g.id) ? 'Reviewed' : 'Review'}</em></button>`;
  }).join('')}</div>`;
}
function keepImported(g) {
  const s = S(); if (!s.games.some(x => x.id === g.id)) { s.games.push({ id: g.id, pgn: g.pgn, date: g.date || A.today(), white: g.white, black: g.black, result: g.result, src: 'import', me: g.me, site: g.site }); s.games = s.games.slice(-60); }
}
$('#impForm').onsubmit = async e => {
  e.preventDefault(); const user = $('#impUser').value.trim(); if (!user) return;
  $('#impBtn').disabled = true; $('#impOut').innerHTML = '<p class="small mute" style="margin-top:10px">Loading your games…</p>';
  try {
    const r = await fetch(`/api/import?site=${IMP.site}&user=${encodeURIComponent(user)}`); const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not load games.');
    IMP.games = d.games || []; S().imp = { site: IMP.site, user }; K.save(); A.track('import');
    if (!IMP.games.length) $('#impOut').innerHTML = '<p class="small mute" style="margin-top:10px">No recent standard games found for that player.</p>'; else renderImp();
  } catch (err) { $('#impOut').innerHTML = `<p class="small" style="margin-top:10px;color:var(--no)">${esc(err.message)}</p>`; }
  finally { $('#impBtn').disabled = false; }
};
$('#impOut').onclick = e => {
  if (e.target.closest('#impAll')) {
    let n = 0; IMP.games.forEach(g => { if (!reviewedGid(g.id)) { keepImported(g); A.queueReview(g.id); n++; } });
    K.save(); A.toast(n ? `Reviewing ${n} game${n === 1 ? '' : 's'} in the background. Mistakes go to your drills.` : 'All of these are reviewed already.'); return;
  }
  const b = e.target.closest('[data-gid]'); if (!b) return; const g = IMP.games.find(x => x.id === b.dataset.gid); if (!g) return;
  keepImported(g); K.save();
  if (loadReview(g.pgn, g.me)) R.gid = g.id;
};
$('#shareReview').onclick = async () => {
  if (!R.done) return; const sm = summary(); const me = R.me; const h = R.headers;
  const counts = ['brilliant', 'great', 'best', 'mistake', 'miss', 'blunder'].map(cls => ({ cls, n: me ? (sm.counts[me][cls] || 0) : (sm.counts.w[cls] || 0) + (sm.counts.b[cls] || 0) }));
  const res = h.Result === '1-0' ? 'White won' : h.Result === '0-1' ? 'Black won' : h.Result === '1/2-1/2' ? 'Draw' : 'Unfinished';
  const blob = await A.shareCard({ kicker: 'Game review', title: `${h.White || 'White'} vs ${h.Black || 'Black'}`, sub: [res, sm.opening && sm.opening.name ? sm.opening.name : sm.opening].filter(x => x && typeof x === 'string').join(' · '),
    fen: R.fens[R.fens.length - 1], orient: me || 'w', last: R.moves.length ? R.moves[R.moves.length - 1].u : null,
    cols: ['w', 'b'].map(c => ({ name: (c === 'w' ? h.White : h.Black) || (c === 'w' ? 'White' : 'Black'), acc: A.ccAcc(sm.acc[c]), rating: gr(c), me: me === c })), counts });
  if (blob) A.shareBlob(blob);
};
A.views.review = { enter() { renderRecent(); graph(); }, refresh() { renderRecent(); if (R.fens.length) render(); } };

/* ---------- background reviews ----------
   Games you play against a bot or a friend are reviewed quietly in the background (finished or not),
   so their mistakes turn into drills without you having to open Review. */
A.queueReview = id => { const s = S(); s.reviewQ = s.reviewQ || []; if (id && !s.reviewQ.includes(id)) s.reviewQ.push(id); K.save(); };
function gameState(g) {
  const c = new Chess(); const clean = (g.pgn || '').replace(/\{[^}]*\}/g, ' ').replace(/\$\d+/g, '');
  if (!c.load_pgn(clean, { sloppy: true })) return null;
  const hist = c.history({ verbose: true }); if (hist.length < 10) return null;
  const st = { headers: c.header(), fens: [], moves: [], an: [], cls: [], me: g.me, gid: g.id, added: 0 };
  const start = new Chess(st.headers.SetUp === '1' && st.headers.FEN ? st.headers.FEN : undefined);
  st.fens = [start.fen()];
  for (const m of hist) { const fb = start.fen(); const mm = start.move(m.san); st.moves.push({ san: mm.san, u: K.uciOf(mm), color: mm.color, fen: fb, captured: mm.captured }); st.fens.push(start.fen()); }
  return st;
}
let bgBusy = false, bgBooted = false;
const busy = () => (A.playLive && A.playLive() && A.cur() === 'play') || (R.token && !R.done && R.fens.length);
async function bgTick() {
  if (bgBusy || !K.eng || busy()) return;
  const s = S(); s.reviewQ = s.reviewQ || [];
  if (!bgBooted) {   // pick up games from before this feature, or left mid-way when the tab closed
    bgBooted = true;
    s.games.filter(g => g.me && !g.rev && g.src !== 'import' && !s.reviewQ.includes(g.id)).forEach(g => s.reviewQ.push(g.id));
  }
  if (!s.reviewQ.length) return;
  bgBusy = true;
  try {
    const id = s.reviewQ[0]; const g = s.games.find(x => x.id === id);
    const st = g && g.me ? gameState(g) : null;
    if (!st) { s.reviewQ.shift(); if (g) g.rev = 1; K.save(); return; }
    const depth = 12;
    for (let i = 0; i < st.fens.length; i++) {
      if (busy()) return;                       // you started playing or reviewing: pick this up later
      const r = await K.analyse(st.fens[i], depth, 2, { tag: 'bg' });
      const got = r.lines[0] && (r.lines[0].depth || depth);
      if (!r.lines.length || (got && got < depth - 1 && !r.lines[0].over)) return;   // interrupted: retry later
      st.an[i] = r; if (i > 0) classifyAt(i - 1, st);
    }
    st.done = true; finish(st);
    s.reviewQ = s.reviewQ.filter(x => x !== id); g.rev = 1; K.save(); A.refresh();
    if (st.added) A.toast(`${st.added} mistake${st.added === 1 ? '' : 's'} from your game vs ${g.me === 'w' ? g.black : g.white} added to Mistake drills`);
  } catch (e) { } finally { bgBusy = false; }
}
setInterval(bgTick, 2500);
}
