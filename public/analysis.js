/* NextMove — Analysis board */
{
const { esc, $ } = K;
const AN = { start: K.START, moves: [], ply: 0, run: 0, lines: [], depth: 0 };
const ab = A.board($('#analysis .bd'), {
  movable: () => 'both',
  legal: A.legalFor(() => fenAt(AN.ply)),
  onMove: (f, t, pr) => anMove(f, t, pr)
});
function fenAt(p) { const c = new Chess(AN.start); for (const u of AN.moves.slice(0, p)) K.mv(c, u); return c.fen(); }
function sanList() { const c = new Chess(AN.start); return AN.moves.map(u => { const col = c.turn(); const m = K.mv(c, u); return m ? A.fig(m.san, col) : esc(u); }); }
function anMove(f, t, pr) {
  const c = new Chess(fenAt(AN.ply)); const m = c.move({ from: f, to: t, promotion: pr || 'q' }); if (!m) return false;
  const u = K.uciOf(m); A.moveSound(m, c);
  if (AN.moves[AN.ply] === u) AN.ply++;
  else { AN.moves = AN.moves.slice(0, AN.ply).concat(u); AN.ply++; }
  render(!ab.lastWasDrag); think(); return true;
}
function render(anim) {
  const fen = fenAt(AN.ply); const last = AN.ply ? AN.moves[AN.ply - 1] : null;
  const top = AN.lines[0]; const arrows = top && top.move && $('#aEngine').checked ? [{ from: top.move.slice(0, 2), to: top.move.slice(2, 4), c: '#ff5c28', o: .7 }] : [];
  ab.set(fen, { last, arrows, anim });
  $('#aFen').value = fen;
  const sans = sanList(); const sc = new Chess(AN.start); const black = sc.turn() === 'b'; const no0 = +sc.fen().split(' ')[5];
  const ml = []; let k = 0;
  if (black && sans.length) { ml.push(`<li><span>${no0}</span><b></b><b class="mv${AN.ply === 1 ? ' cur' : ''}" data-p="1">${sans[0]}</b></li>`); k = 1; }
  for (; k < sans.length; k += 2) { const no = no0 + Math.floor((k + (black ? 1 : 0)) / 2); ml.push(`<li><span>${no}</span><b class="mv${AN.ply === k + 1 ? ' cur' : ''}" data-p="${k + 1}">${sans[k]}</b>${sans[k + 1] ? `<b class="mv${AN.ply === k + 2 ? ' cur' : ''}" data-p="${k + 2}">${sans[k + 1]}</b>` : '<b></b>'}</li>`); }
  $('#aMoves').innerHTML = ml.join('');
  const cur = $('#aMoves .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  drawLines(fen);
}
function drawLines(fen) {
  const on = $('#aEngine').checked;
  $('#analysis .bwrap').classList.toggle('noeval', !on);
  if (!on) { $('#aLines').innerHTML = '<p class="small mute">Engine off.</p>'; $('#aDepth').textContent = ''; return; }
  const c = new Chess(fen);
  if (c.game_over()) { $('#aLines').innerHTML = `<p class="small mute">${c.in_checkmate() ? 'Checkmate.' : 'Draw.'}</p>`; return; }
  $('#aLines').innerHTML = AN.lines.length ? AN.lines.map((l, i) => `<div class="eline" data-l="${i}"><b>${esc(K.fmtEval(l))}</b><span>${esc(K.pvSan(fen, l.pv, 10))}</span></div>`).join('') : '<p class="small mute">Thinking…</p>';
  $('#aDepth').textContent = AN.depth ? `depth ${AN.depth}` : '';
  A.setEvalBar($('#analysis .evalbar'), AN.lines[0], ab.orient);
}
async function think() {
  const id = ++AN.run; AN.lines = []; AN.depth = 0;
  const fen = fenAt(AN.ply); render0();
  if (!$('#aEngine').checked || A.cur() !== 'analysis') return;
  K.eng.stop('an');
  await K.sleep(60); if (id !== AN.run) return;
  for (const d of [12, 18, 22]) {
    const r = await K.analyse(fen, d, 3, { tag: 'an', onInfo: j => { if (id !== AN.run) return; const ls = j.lines.filter(Boolean); if (ls.length && ls[0].depth >= 6) { AN.lines = ls; AN.depth = ls[0].depth; drawLines(fen); } } });
    if (id !== AN.run) return;
    if (r.lines.length) { AN.lines = r.lines; AN.depth = r.lines[0].depth || d; drawLines(fen); render0(); }
  }
}
function render0() { const top = AN.lines[0]; ab.setArrows(top && top.move && $('#aEngine').checked ? [{ from: top.move.slice(0, 2), to: top.move.slice(2, 4), c: '#ff5c28', o: .7 }] : []); }
function go(p) { const n = Math.max(0, Math.min(AN.moves.length, p)); const fwd = n === AN.ply + 1; AN.ply = n; render(fwd); if (fwd) A.sound('move'); think(); }
$('#aMoves').onclick = e => { const b = e.target.closest('[data-p]'); if (b) go(+b.dataset.p); };
$('#aLines').onclick = e => { const b = e.target.closest('[data-l]'); if (!b) return; const l = AN.lines[+b.dataset.l]; if (!l || !l.move) return; const c = new Chess(fenAt(AN.ply)); const m = K.mv(c, l.move); if (m) anMove(m.from, m.to, m.promotion); };
$('#anav').onclick = e => { const b = e.target.closest('[data-nav]'); if (!b) return; const n = b.dataset.nav; if (n === 'flip') { ab.flip(); render(); return; } go(n === 'first' ? 0 : n === 'prev' ? AN.ply - 1 : n === 'next' ? AN.ply + 1 : AN.moves.length); };
$('#aEngine').onchange = () => { render(); think(); };
$('#aLoad').onclick = () => { const f = $('#aFen').value.trim(); const c = new Chess(); if (!c.load(f)) { A.toast('That FEN isn’t valid'); return; } AN.start = c.fen(); AN.moves = []; AN.ply = 0; ab.flip(c.turn()); render(); think(); };
$('#aCopy').onclick = () => { navigator.clipboard.writeText(fenAt(AN.ply)).then(() => A.toast('FEN copied'), () => A.toast('Copy failed — select the FEN box instead')); };
$('#aCopyPgn').onclick = () => { const c = new Chess(AN.start); if (AN.start !== K.START) { c.header('SetUp', '1', 'FEN', AN.start); } for (const u of AN.moves) K.mv(c, u); navigator.clipboard.writeText(c.pgn()).then(() => A.toast('PGN copied'), () => A.toast('Copy failed')); };
$('#aReset').onclick = () => { AN.start = K.START; AN.moves = []; AN.ply = 0; ab.flip('w'); render(); think(); };
document.addEventListener('keydown', e => {
  if (A.cur() !== 'analysis' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft') go(AN.ply - 1); if (e.key === 'ArrowRight') go(AN.ply + 1);
});
A.openAnalysis = (start, moves, ply) => { AN.start = start || K.START; AN.moves = moves || []; AN.ply = ply ?? AN.moves.length; A.go('analysis'); render(); think(); };
A.views.analysis = { enter() { render(); think(); }, leave() { AN.run++; K.eng.stop('an'); } };
}
