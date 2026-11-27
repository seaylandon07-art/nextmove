/* NextMove — Play: bots, same-device, online */
{
const { esc, $ } = K; const { S, $$ } = A;
const BOTS = [
  { id: 'milo', n: 'Milo', r: 400, bio: 'Just learned how the knight moves', skill: 0, depth: 1, rand: .35 },
  { id: 'ava', n: 'Ava', r: 650, bio: 'Attacks everything, defends nothing', skill: 0, depth: 2, rand: .15, book: true },
  { id: 'theo', n: 'Theo', r: 850, bio: 'Careful beginner, slow to castle', skill: 2, depth: 3, rand: .05 },
  { id: 'nora', n: 'Nora', r: 1050, bio: 'Plays the London System every game', skill: 4, depth: 5, rand: .02, line: { w: 'London System', b: 'Caro-Kann: Classical' } },
  { id: 'gus', n: 'Gus', r: 1200, bio: 'The gambiteer — will sacrifice a pawn on move two', skill: 6, depth: 6, gambits: true },
  { id: 'victor', n: 'Victor', r: 1350, bio: 'Trades pieces and grinds endgames', skill: 8, depth: 8, book: true },
  { id: 'iris', n: 'Iris', r: 1550, bio: 'Sharp tactician who loves the Sicilian', elo: 1550, depth: 10, line: { b: 'Sicilian: Najdorf' }, book: true },
  { id: 'dmitri', n: 'Dmitri', r: 1800, bio: 'Strong club player, deep opening prep', elo: 1800, depth: 12, book: true },
  { id: 'sofia', n: 'Sofia', r: 2100, bio: 'Expert — punishes every slip', elo: 2100, depth: 14, book: true },
  { id: 'sf', n: 'Stockfish', r: 3000, bio: 'Full strength. Good luck.', depth: 18, icon: 'i-cpu' }];
const TCS = { none: null, '1+0': [60, 0], '3+2': [180, 2], '5+3': [300, 3], '10+0': [600, 0] };
const P = { coach: null, coachLog: [], coachAcc: [], view: null, seenN: 0, mode: 'bot', bot: 3, color: 'w', tc: 'none', open: 'auto', g: null, me: 'w', over: false, thinking: false, clocks: null, showEval: false, evalLine: null, line: null, online: null };
A.P = P;
const pb = A.board($('#play .bd'), {
  movable: () => !P.g || P.over || P.view != null ? null : P.mode === 'local' ? (P.thinking ? null : 'both') : (P.mode === 'online' && !P.online?.started) ? null : P.me,
  legal: sq => P.g.turn() === P.me || P.mode === 'local' ? A.legalFor(() => P.g.fen())(sq) : preDests(sq),
  onMove: (f, t, pr) => userMove(f, t, pr)
});
function botObj() { return BOTS[P.bot]; }
/* ---------- premoves: queue your reply while the opponent is thinking ---------- */
function preDests(sq) {
  // moves as if it were your turn on the current board; pawns may also aim diagonally at anything
  const parts = P.g.fen().split(' '); parts[1] = P.me; parts[3] = '-';
  let c; try { c = new Chess(parts.join(' ')); } catch (e) { return []; }
  const out = c.moves({ square: sq, verbose: true }).map(m => ({ to: m.to }));
  const pc = P.g.get(sq);
  if (pc && pc.type === 'p') { const f = sq.charCodeAt(0), r = +sq[1] + (P.me === 'w' ? 1 : -1); for (const df of [-1, 1]) { const ff = f + df; if (ff >= 97 && ff <= 104 && r >= 1 && r <= 8) { const t = String.fromCharCode(ff) + r; if (!out.some(o => o.to === t)) out.push({ to: t }); } } }
  return out;
}
function tryPremove() {
  const pr = P.pre; P.pre = null; if (!pr || !P.g || P.over || P.g.turn() !== P.me) { render(); return; }
  const legal = P.g.moves({ square: pr.from, verbose: true }).some(m => m.to === pr.to);
  if (!legal) { render(); return; }
  userMove(pr.from, pr.to, pr.promo);
}
pb.host.addEventListener('pointerdown', e => {
  if (!P.pre) return;
  const sq = e.target.closest('[data-sq]'); const pc = sq && P.g.get(sq.dataset.sq);
  if (e.button === 2 || !pc || pc.color !== P.me) { if (!pb.sel) { P.pre = null; render(); } }
}, true);
// touching the board while looking at an earlier move jumps back to the live position, like the big sites
pb.host.addEventListener('pointerdown', () => { if (P.g && P.view != null && !pb.drawMode) { P.view = null; render(); } }, true);
function renderSetup() {
  $('#bots').innerHTML = BOTS.map((b, i) => `<button class="bot${i === P.bot ? ' on' : ''}" data-i="${i}"><span class="av" data-av="${esc(b.n)}" data-icon="${b.icon || ''}"></span><span><b>${esc(b.n)}</b><small>${esc(b.bio)}</small></span><em>${b.r}</em></button>`).join('');
  $$('#bots .av').forEach(el => A.avatar(el, el.dataset.av, el.dataset.icon));
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === P.mode));
  $$('#colorSeg button').forEach(b => b.classList.toggle('on', b.dataset.color === P.color));
  $$('#tcSeg button').forEach(b => b.classList.toggle('on', b.dataset.tc === P.tc));
  $('#botSec').hidden = P.mode !== 'bot'; $('#openSec').hidden = P.mode !== 'bot';
  $('#colorSec').hidden = P.mode === 'local'; $('#onlineSec').hidden = P.mode !== 'online';
  $('#startSec').hidden = P.mode === 'online';
  const sel = $('#botOpen');
  if (!sel.dataset.filled && A.dataReady) {
    const lines = K.BOOKLINES.filter(l => l.moves.length >= 4);
    sel.innerHTML = `<option value="auto">Bot's usual openings</option><option value="none">No opening book</option><optgroup label="Practise an opening">${lines.map(l => `<option value="o:${esc(l.name)}">${esc(l.name)}</option>`).join('')}</optgroup><optgroup label="Practise against a gambit">${A.GAMB.filter(g => g.kind === 'gambit').map(g => `<option value="g:${esc(g.name)}">${esc(g.name)} (${g.side === 'w' ? 'White' : 'Black'})</option>`).join('')}</optgroup>`;
    sel.dataset.filled = 1;
  }
  sel.value = P.open;
}
$('#bots').onclick = e => { const b = e.target.closest('[data-i]'); if (b) { P.bot = +b.dataset.i; renderSetup(); } };
$('#setup').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mode) P.mode = b.dataset.mode; if (b.dataset.color) P.color = b.dataset.color; if (b.dataset.tc) P.tc = b.dataset.tc;
  if (b.dataset.mode || b.dataset.color || b.dataset.tc) renderSetup();
});
$('#botOpen').onchange = e => { P.open = e.target.value; };
function names() {
  if (P.mode === 'local') return { w: 'White', b: 'Black' };
  if (P.mode === 'online') { const o = P.online || {}; const me = (S().name || 'You').split(',')[0].trim() || 'You'; const them = o.oppName || 'Friend'; return P.me === 'w' ? { w: me, b: them } : { w: them, b: me }; }
  const b = botObj(), me = (S().name || 'You').split(',')[0].trim() || 'You';
  return P.me === 'w' ? { w: me, b: `${b.n} (${b.r})` } : { w: `${b.n} (${b.r})`, b: me };
}
function pickLine(botColor) {
  const b = botObj();
  if (P.open.startsWith('o:')) return K.BOOKLINES.find(l => l.name === P.open.slice(2)) || null;
  if (P.open.startsWith('g:')) { const g = A.GAMB.find(x => x.name === P.open.slice(2)); return g ? { name: g.name, moves: g.moves } : null; }
  if (P.open === 'none') return null;
  if (b.gambits) { const gs = A.GAMB.filter(g => g.kind === 'gambit' && g.side === botColor); const g = gs[Math.floor(Math.random() * gs.length)]; return g ? { name: g.name, moves: g.moves } : null; }
  if (b.line && b.line[botColor]) return K.BOOKLINES.find(l => l.name === b.line[botColor]) || A.GAMB.find(l => l.name === b.line[botColor]) || null;
  return null;
}
function startGame(opts = {}) {
  saveUnfinished();
  P.pre = null; P.g = new Chess(); P.gid = A.uid(); P.coach = null; P.coachLog = []; P.coachAcc = []; P.eloDelta = null; P.over = false; P.result = null; P.evalLine = null; P.hint = null; P.thinking = false;
  if (P.mode === 'local') P.me = 'w';
  else if (P.mode === 'online') P.me = opts.color;
  else P.me = opts.color || (P.color === 'r' ? (Math.random() < .5 ? 'w' : 'b') : P.color);
  const tc = TCS[opts.tc || P.tc]; P.clocks = tc ? { w: tc[0] * 1000, b: tc[0] * 1000, inc: tc[1] * 1000, t: null, base: tc[0] * 1000 } : null;
  P.line = P.mode === 'bot' && !opts.pre ? pickLine(P.me === 'w' ? 'b' : 'w') : null;
  if (opts.pre) for (const u of opts.pre) K.mv(P.g, u);
  pb.flip(P.me);
  const n = names(); P.g.header('Event', P.mode === 'online' ? 'NextMove online game' : 'NextMove game', 'Date', A.today().replace(/-/g, '.'), 'White', n.w, 'Black', n.b);
  $('#setup').hidden = true; $('#ingame').hidden = false; $('#overBox').hidden = true;
  $('#hintBtn').hidden = P.mode !== 'bot'; $('#undoBtn').hidden = P.mode === 'online';
  render();
  $('#coachBtn').hidden = P.mode !== 'bot'; $('#coachBtn').classList.toggle('on', A.ui().coach !== false); drawCoach();
  if (P.mode === 'bot' && P.g.turn() !== P.me) botMove(); else warmCoach();
}
// continue a trained line as a real game against a bot near your level
A.BOTS = BOTS;
A.quickBot = (i, color) => { leaveOnline(); P.mode = 'bot'; P.bot = i; A.go('play'); startGame(color ? { color } : {}); };
A.playMode = m => { P.mode = m; if (P.g && !P.over) { A.go('play'); return; } newGame(); A.go('play'); renderSetup(); };
A.playOnline = () => { P.mode = 'online'; newGame(); A.go('play'); renderSetup(); };
A.botForMe = () => { const r = S().puz.r || 1000; let bi = 0; BOTS.forEach((b, i) => { if (Math.abs(b.r - r) < Math.abs(BOTS[bi].r - r)) bi = i; }); return { i: bi, name: BOTS[bi].n, r: BOTS[bi].r }; };
A.playFrom = (moves, color, title) => {
  leaveOnline(); P.mode = 'bot'; P.bot = A.botForMe().i; A.go('play');
  startGame({ pre: moves, color, tc: 'none' });
  if (title) A.toast(`${title}: your move against ${BOTS[P.bot].n}`);
};
$('#startGame').onclick = () => startGame();
function render(anim) {
  const g = P.g; if (!g) { P.view = null; pb.host.classList.remove('viewing'); pb.set(K.START); drawPlayers(); $('#pnav') && $('#pnav').classList.remove('viewing'); return; }
  const h = g.history({ verbose: true }); const n = h.length;
  // any new move (yours, the bot's, your friend's) or a takeback brings you back to the live position
  if (n !== P.seenN) { P.seenN = n; P.view = null; }
  if (P.view != null && P.view >= n) P.view = null;
  const v = P.view == null ? n : P.view, live = v === n;
  let fen = g.fen();
  if (!live) { const c = new Chess(); for (let i = 0; i < v; i++) c.move(h[i].san); fen = c.fen(); }
  const last = h[v - 1];
  const cb = P.coach && P.coach.ply === v && K.CLS[P.coach.cls] ? { sq: P.coach.sq, c: K.CLS[P.coach.cls].c, i: K.CLS[P.coach.cls].i } : null;
  const marks = live && P.pre ? { [P.pre.from]: 'pre', [P.pre.to]: 'pre' } : {};
  pb.set(fen, { last: last ? last.from + last.to : null, arrows: live && P.hint ? [P.hint] : [], anim, badge: cb, marks });
  if (live && P.pre && !P.over && g.turn() === P.me && !P.preT) P.preT = setTimeout(() => { P.preT = null; tryPremove(); }, 60);
  pb.host.classList.toggle('viewing', !live);
  drawPlayers(fen);
  const ml = []; for (let i = 0; i < n; i += 2) ml.push(`<li><span>${i / 2 + 1}</span><b class="mv${v === i + 1 ? ' cur' : ''}" data-ply="${i + 1}">${A.fig(h[i].san, 'w')}</b><b class="mv${v === i + 2 ? ' cur' : ''}" data-ply="${i + 2}">${h[i + 1] ? A.fig(h[i + 1].san, 'b') : ''}</b></li>`);
  $('#pmoves').innerHTML = ml.join('');
  if (live) $('#pmoves').scrollTop = 1e6; else { const cur = $('#pmoves .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' }); }
  const nav = $('#pnav'); nav.classList.toggle('viewing', !live);
  nav.querySelector('[data-nav=first]').disabled = nav.querySelector('[data-nav=prev]').disabled = v === 0;
  nav.querySelector('[data-nav=next]').disabled = nav.querySelector('[data-nav=last]').disabled = live;
  let st = P.over ? P.result : g.in_check() ? 'Check' : (g.turn() === 'w' ? 'White' : 'Black') + ' to move';
  if (P.thinking) st = `${botObj().n} is thinking…`;
  if (P.mode === 'online' && !P.over) st = P.online && P.online.started ? (g.turn() === P.me ? 'Your move' : 'Their move') : 'Waiting for opponent';
  if (!live) st = `Looking at move ${Math.ceil(v / 2)}${v === 0 ? '' : v % 2 ? '' : ' (Black)'}`.replace('move 0', 'the start');
  $('#pstatus').textContent = st;
  $('#pdot').className = 'dot' + (!P.over && (P.thinking || (P.mode === 'online' && g.turn() !== P.me)) ? ' live' : '');
  const op = K.openingName([K.START, ...(() => { const c = new Chess(); return h.map(m => { c.move(m.san); return c.fen(); }); })()]);
  $('#popen').textContent = op || '';
  $('#play .evalbar').classList.toggle('off', !P.showEval);
  A.setEvalBar($('#play .evalbar'), P.evalLine, pb.orient);
  drawClocks();
}
function drawPlayers(viewFen) {
  const n = P.g ? names() : { w: 'White', b: 'Black' };
  const top = pb.orient === 'w' ? 'b' : 'w', bot = top === 'w' ? 'b' : 'w';
  const fen = viewFen || (P.g ? P.g.fen() : K.START);
  for (const [id, c] of [['#plTop', top], ['#plBot', bot]]) {
    const el = $(id); el.dataset.c = c;
    el.querySelector('.nm').textContent = n[c];
    el.querySelector('.mat').innerHTML = A.material(fen, c);
    const isBot = P.mode === 'bot' && P.g && c !== P.me;
    A.avatar(el.querySelector('.av'), isBot ? botObj().n : n[c], isBot ? botObj().icon : null);
  }
}
function drawClocks() {
  const fmt = ms => { ms = Math.max(0, ms); if (ms < 10000) return (ms / 1000).toFixed(1); const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  $$('#play .pl').forEach(p => { const c = p.dataset.c; const el = p.querySelector('.clk'); el.textContent = P.clocks ? fmt(P.clocks[c]) : ''; const run = !!(P.clocks && P.g && !P.over && P.g.turn() === c && P.g.history().length); el.classList.toggle('run', run); el.classList.toggle('low', !!(P.clocks && P.clocks[c] < 20000)); });
}
setInterval(() => {
  if (!P.clocks || !P.g || P.over || !P.g.history().length) return;
  if (P.mode === 'online' && !P.online?.started) return;
  const now = performance.now(); const c = P.g.turn();
  if (P.clocks.t != null) P.clocks[c] -= now - P.clocks.t; P.clocks.t = now;
  if (P.clocks[c] <= 0) { P.clocks[c] = 0; const flagMine = P.mode !== 'online' || c === P.me; if (flagMine) endGame(c === 'w' ? '0-1' : '1-0', `${c === 'w' ? 'White' : 'Black'} ran out of time`); }
  drawClocks();
}, 100);
function afterMove(color, m) {
  if (P.clocks) { P.clocks[color] += P.clocks.inc; P.clocks.t = performance.now(); }
  P.hint = null; A.moveSound(m, P.g); persistLive();
  if (P.mode === 'online') pushOnline();
  if (checkEnd()) return true;
  if (P.showEval) K.analyse(P.g.fen(), 12).then(r => { P.evalLine = r.lines[0]; A.setEvalBar($('#play .evalbar'), P.evalLine, pb.orient); });
  return false;
}
function userMove(f, t, pr) {
  if (!P.g || P.over) return false;
  if (P.mode !== 'local' && P.g.turn() !== P.me) { P.pre = { from: f, to: t, promo: pr }; render(); return true; }
  const color = P.g.turn(); const fenBefore = P.g.fen();
  const m = P.g.move({ from: f, to: t, promotion: pr || 'q' }); if (!m) return false;
  coachMove(fenBefore, K.uciOf(m), color, P.g.history().length);
  const ended = afterMove(color, m);
  if (P.mode === 'local' && !ended) pb.orient = P.g.turn();
  render(!pb.lastWasDrag && P.mode !== 'local');
  if (!ended && P.mode === 'bot') botMove();
  return true;
}
function bookMove() {
  const g = P.g; const h = g.history({ verbose: true }).map(K.uciOf);
  if (P.line) { const L = P.line.moves; if (h.length < L.length && h.every((u, i) => u === L[i])) return L[h.length]; }
  const b = botObj();
  if ((b.book || P.open === 'auto' && (b.gambits || b.line)) && P.open !== 'none') {
    const e = K.BOOK.get(K.key4(g.fen())); if (e && e.moves.size) { const arr = [...e.moves]; return arr[Math.floor(Math.random() * arr.length)]; }
  }
  return null;
}
async function botMove() {
  P.thinking = true; render();
  const b = botObj(); const fen = P.g.fen(); const gid = P.g; const t0 = performance.now();
  // Bots play like people on the clock: faster games and low time mean shallower thinking and more slips.
  const ck = P.clocks, mine = ck ? ck[P.g.turn()] : null;
  const pace = !ck ? 1 : ck.base <= 60000 ? .5 : ck.base <= 180000 ? .7 : ck.base <= 300000 ? .85 : 1;
  const panic = ck && mine < 10000 ? .1 : ck && mine < 20000 ? .05 : 0;
  const slip = (b.rand || 0) + (ck ? (1 - pace) * .12 : 0) + panic;
  let u = bookMove();
  if (!u) {
    const legal = P.g.moves({ verbose: true });
    if (slip && Math.random() < slip) u = K.uciOf(legal[Math.floor(Math.random() * legal.length)]);
    else { const j = await K.eng.run(fen, { depth: Math.max(1, Math.round(b.depth * pace)), skill: b.skill != null ? Math.max(0, Math.round(b.skill * pace)) : 20, elo: b.elo ? Math.max(1320, Math.round(b.elo - (1 - pace) * 500)) : undefined, multipv: 1 }); u = j.best; }
  }
  // spend clock time like a human: a slice of what's left, a bit random, quicker when short
  const think = ck ? Math.min(mine * .12, Math.max(400, (mine / (ck.base <= 60000 ? 26 : 32) + ck.inc * .7) * (.55 + Math.random() * .9))) : 350 + Math.random() * 600;
  const wait = think - (performance.now() - t0); if (wait > 0) await K.sleep(wait);
  if (gid !== P.g || P.over || P.g.fen() !== fen) { P.thinking = false; return; }
  const color = P.g.turn();
  const m = u && u !== '(none)' ? K.mv(P.g, u) : null;
  P.thinking = false;
  if (!m) { render(); return; }
  afterMove(color, m); render(true); warmCoach();
}
/* ---------- coach: a verdict on each of your moves against a bot ---------- */
const coachOn = () => A.ui().coach !== false && P.mode === 'bot';
const GOODC = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced'];
function warmCoach() { if (coachOn() && P.g && !P.over && P.g.turn() === P.me) K.analyse(P.g.fen(), 11, 2); }
async function coachMove(fen, u, color, ply) {
  if (P.mode !== 'bot') return;
  const gid = P.gid; if (coachOn()) { P.coach = { ply, think: true }; drawCoach(); }
  const pre = await K.analyse(fen, 11, 2); const c = new Chess(fen); K.mv(c, u); const post = await K.analyse(c.fen(), 11, 1);
  if (P.gid !== gid) return;
  const e = K.BOOK.get(K.key4(fen)); const inBook = !!(e && e.moves.has(u));
  const cl = K.classify({ fen, u, pre, post, color, inBook });
  const ex = K.explain({ fen, u, cls: cl.cls, pre, post, color });
  const lines = ex.text.filter(t => !/^The line:|^Engine line|^Line:/.test(t));
  const good = GOODC.includes(cl.cls);
  const head = { brilliant: 'Brilliant!', great: 'Great move', best: 'Best move', excellent: 'Excellent', good: 'Good move', book: 'Book move — that’s theory', forced: 'Only move', inaccuracy: 'Inaccuracy', mistake: 'Mistake', miss: 'Missed chance', blunder: 'Blunder' }[cl.cls] || 'Move played';
  let text = good ? (lines[0] || '') : lines.filter(t => !/^Better was/.test(t)).slice(0, 2).join(' ');
  if (!good && pre.lines[0] && pre.lines[0].move) text += ` Better was ${K.moveName(fen, pre.lines[0].move)}.${P.mode === 'bot' ? ' Use Takeback to try again.' : ''}`;
  P.coach = { ply, cls: cl.cls, sq: u.slice(2, 4), head, text, good };
  P.coachLog[ply] = cl.cls; P.coachAcc[ply] = ['book', 'forced'].includes(cl.cls) ? 100 : K.moveAcc(cl.loss);
  if (P.over) showRatings();
  drawCoach(); render();
}
function drawCoach() {
  const el = $('#coachBox'); const c = P.coach;
  if (!coachOn() || !c || !P.g) { el.hidden = true; return; }
  el.hidden = false;
  if (c.think) { el.className = 'coach think'; el.innerHTML = `<span class="ic" style="background:var(--glass2,#2a3254)">…</span><span><b>Coach</b><p>Looking at your move…</p></span>`; return; }
  el.className = 'coach ' + (c.good ? 'good' : ['mistake', 'blunder', 'miss'].includes(c.cls) ? 'bad' : '');
  el.innerHTML = `${A.clsChip(c.cls)}<span><b>${esc(c.head)}</b>${c.text ? `<p>${esc(c.text)}</p>` : ''}</span>`;
}
$('#coachBtn').onclick = () => { const u = A.ui(); u.coach = u.coach === false; K.save(); $('#coachBtn').classList.toggle('on', u.coach !== false); if (u.coach !== false) warmCoach(); drawCoach(); render(); };
/* ---------- ratings at the end of a game ---------- */
function myAcc() { const a = P.coachAcc.filter(x => x != null); return a.length >= 4 ? K.gameAcc(a) : null; }
function applyElo(res) {
  if (P.mode !== 'bot') return;
  const s = S(); s.elo = s.elo || { r: 1000, n: 0, hist: [] };
  const opp = botObj().r; const score = res === '1/2-1/2' ? .5 : (res === '1-0') === (P.me === 'w') ? 1 : 0;
  const exp = 1 / (1 + Math.pow(10, (opp - s.elo.r) / 400)); const k = s.elo.n < 10 ? 40 : 24;
  const d = Math.round(k * (score - exp)); s.elo.r += d; s.elo.n++; s.elo.hist.push({ t: Date.now(), r: s.elo.r, opp, score }); s.elo.hist = s.elo.hist.slice(-200);
  P.eloDelta = d; K.save();
}
function showRatings() {
  const el = $('#overRatings'); if (!el) return;
  if (P.mode !== 'bot') { el.hidden = true; return; }
  const acc = myAcc(); const gr = A.accElo(acc); const s = S(); const d = P.eloDelta;
  el.hidden = false;
  el.innerHTML = `<div><small>Game rating</small><b>${gr ?? '…'}</b><span>${acc != null ? `${acc}% accuracy` : 'Calculating…'}</span></div><div><small>Your rating</small><b>${s.elo ? s.elo.r : '–'}</b><span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d == null ? '' : d > 0 ? `+${d}` : d < 0 ? `${d}` : '±0'} vs ${esc(botObj().n)} (${botObj().r})</span></div>`;
}
function coachSummary() {
  const log = P.coachLog.filter(Boolean); if (!log.length) return '';
  const n = k => log.filter(x => k.includes(x)).length;
  const good = n(GOODC), inacc = n(['inaccuracy']), bad = n(['mistake', 'miss']), bl = n(['blunder']);
  return `Coach: ${good} good move${good === 1 ? '' : 's'}${inacc ? `, ${inacc} inaccurac${inacc === 1 ? 'y' : 'ies'}` : ''}${bad ? `, ${bad} mistake${bad === 1 ? '' : 's'}` : ''}${bl ? `, ${bl} blunder${bl === 1 ? '' : 's'}` : ''}. The full review shows where it turned and what to play instead.`;
}
function checkEnd() {
  const g = P.g;
  if (g.in_checkmate()) { endGame(g.turn() === 'w' ? '0-1' : '1-0', `Checkmate · ${g.turn() === 'w' ? 'Black' : 'White'} wins`); return true; }
  if (g.in_stalemate()) { endGame('1/2-1/2', 'Stalemate · draw'); return true; }
  if (g.in_threefold_repetition()) { endGame('1/2-1/2', 'Draw by repetition'); return true; }
  if (g.insufficient_material()) { endGame('1/2-1/2', 'Draw · insufficient material'); return true; }
  if (g.in_draw()) { endGame('1/2-1/2', 'Draw · 50-move rule'); return true; }
  return false;
}
function endGame(res, text, remote) {
  if (P.over) return;
  P.over = true; P.result = text; P.g.header('Result', res);
  const n = names();
  upsertGame(res); A.queueReview(P.gid); applyElo(res);
  K.save(); A.sound('end');
  if (P.mode === 'online' && !remote) pushOnline();
  $('#overBox').hidden = false; $('#overText').textContent = text;
  const cs = coachSummary(); $('#overCoach').hidden = !cs; $('#overCoach').textContent = cs; showRatings();
  render(); A.refresh();
}
// Every game against a bot or a friend is kept as it's played, so its mistakes can be reviewed
// even if it's never finished (new game, closed tab, or you wander off to train).
function upsertGame(res) {
  if (!P.g || !P.gid) return; const s = S(); const n = names();
  P.g.header('Result', res || '*');
  const rec = { id: P.gid, pgn: P.g.pgn(), date: A.today(), white: n.w, black: n.b, result: res || '*', src: P.mode, me: P.mode === 'local' ? null : P.me, rev: 0 };
  const i = s.games.findIndex(g => g.id === P.gid); if (i >= 0) s.games[i] = rec; else s.games.push(rec);
}
function persistLive() { if (P.g && !P.over && P.mode !== 'local' && P.g.history().length >= 10) { upsertGame(null); K.save(); } }
function saveUnfinished() {
  if (P.g && !P.over && P.g.history().length >= 10) { upsertGame(null); if (P.mode !== 'local') A.queueReview(P.gid); K.save(); }
}
A.playLive = () => !!(P.g && !P.over);
$('#hintBtn').onclick = async () => {
  if (!P.g || P.over || P.thinking) return;
  const r = await K.analyse(P.g.fen(), 14); const b = r.lines[0]; if (!b || !b.move) return;
  P.hint = { from: b.move.slice(0, 2), to: b.move.slice(2, 4), c: '#e6a83a' }; render();
};
$('#undoBtn').onclick = () => {
  if (!P.g || P.thinking || P.mode === 'online') return;
  if (P.over) { P.over = false; $('#overBox').hidden = true; const s = S(); s.games = s.games.filter(g => g.id !== P.gid); if (P.eloDelta != null && s.elo) { s.elo.r -= P.eloDelta; s.elo.n--; s.elo.hist.pop(); P.eloDelta = null; } K.save(); }
  P.g.undo(); if (P.mode === 'bot' && P.g.turn() !== P.me && P.g.history().length) P.g.undo();
  if (P.mode === 'local') pb.orient = P.g.turn();
  P.hint = null; P.coach = null; P.pre = null; drawCoach(); render();
  // taking back the bot's very first move (you're Black) hands the move back to the bot
  if (P.mode === 'bot' && !P.over && P.g.turn() !== P.me) botMove();
};
$('#flipBtn').onclick = () => { pb.flip(); render(); };
// step through the game while it's being played; making a move needs the live position
function goPly(to) {
  if (!P.g) return; const n = P.g.history().length; const cur = P.view == null ? n : P.view;
  to = Math.max(0, Math.min(n, to)); if (to === cur) return;
  P.view = to >= n ? null : to; render(to === cur + 1);
  const h = P.g.history({ verbose: true }); if (to === cur + 1 && h[to - 1]) A.sound(h[to - 1].captured ? 'capture' : 'move');
}
$('#pnav').onclick = e => { const b = e.target.closest('[data-nav]'); if (!b || !P.g) return; const n = P.g.history().length, v = P.view == null ? n : P.view; const k = b.dataset.nav; goPly(k === 'first' ? 0 : k === 'prev' ? v - 1 : k === 'next' ? v + 1 : n); };
$('#pmoves').onclick = e => { const b = e.target.closest('[data-ply]'); if (b && b.textContent) goPly(+b.dataset.ply); };
document.addEventListener('keydown', e => {
  if (A.cur() !== 'play' || !P.g || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const n = P.g.history().length, v = P.view == null ? n : P.view;
  const to = { ArrowLeft: v - 1, ArrowRight: v + 1, ArrowUp: 0, ArrowDown: n, Home: 0, End: n }[e.key];
  if (to != null) { e.preventDefault(); goPly(to); }
});
$('#evalBtn').onclick = () => { P.showEval = !P.showEval; $('#evalBtn').classList.toggle('on', P.showEval); if (P.showEval && P.g) K.analyse(P.g.fen(), 12).then(r => { P.evalLine = r.lines[0]; render(); }); render(); };
$('#resignBtn').onclick = () => {
  if (!P.g || P.over) return;
  if (P.mode === 'local') { const c = P.g.turn(); endGame(c === 'w' ? '0-1' : '1-0', `${c === 'w' ? 'White' : 'Black'} resigned`); }
  else endGame(P.me === 'w' ? '0-1' : '1-0', P.mode === 'online' ? `${P.me === 'w' ? 'White' : 'Black'} resigned` : 'You resigned');
};
function newGame() { saveUnfinished(); leaveOnline(); P.g = null; P.over = false; $('#setup').hidden = false; $('#ingame').hidden = true; $('#hostBox').hidden = true; pb.set(K.START); render(); renderSetup(); }
$('#newBtn').onclick = newGame; $('#newBtn2').onclick = newGame;
$('#rematchBtn').onclick = () => {
  if (P.mode === 'online') { if (P.online && P.online.role === 'host') { P.online.round = (P.online.round || 0) + 1; P.online.hostColor = P.online.hostColor === 'w' ? 'b' : 'w'; startGame({ color: P.online.hostColor, tc: P.online.tc }); P.online.started = true; pushOnline(); } else A.toast('Ask the host to start a rematch'); return; }
  if (P.mode === 'bot' && P.color !== 'r') P.color = P.me === 'w' ? 'b' : 'w'; startGame();
};
$('#reviewThis').onclick = () => { const g = S().games.find(x => x.id === P.gid) || S().games[S().games.length - 1]; if (g) { A.go('review'); if (A.loadReview(g.pgn, g.me)) A.reviewGid && A.reviewGid(g.id); } };

/* ---------- online play with a friend (room capability) ---------- */
let room = null, gr = null;
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
async function getRoom() { if (room) return room; try { room = window.claude?.use ? await claude.use('room') : null; } catch (e) { room = null; } return room; }
function peerState(p) { const st = p && (p.presence || p.state || p.data || p); return st && st.k === 'ks' ? st : null; }
function isYou(p) { return !!(p && (p.you || p.self || p.isYou || p.me)); }
async function joinRoom(code) {
  const r = await getRoom(); if (!r) { A.toast('Online play isn’t available in this view'); return null; }
  leaveOnline();
  gr = r.join('ks-' + code);
  gr.onPeers(peers => onPeers(Array.isArray(peers) ? peers : Object.values(peers || {})));
  try { gr.on('st', d => applyRemote(d)); } catch (e) { }
  return gr;
}
function myState() {
  const o = P.online; const nm = (S().name || 'Player').split(',')[0].trim() || 'Player';
  return { k: 'ks', role: o.role, name: nm, code: o.code, hostColor: o.hostColor, tc: o.tc, round: o.round || 0, started: !!o.started, pgn: P.g ? P.g.pgn() : '', ply: P.g ? P.g.history().length : 0, clocks: P.clocks ? { w: Math.round(P.clocks.w), b: Math.round(P.clocks.b) } : null, result: P.over ? (P.g.header().Result || '') : '', resultText: P.over ? P.result : '', t: Date.now() };
}
function pushOnline() { if (!gr || !P.online) return; const st = myState(); try { gr.presence(st); } catch (e) { } try { gr.emit('st', st); } catch (e) { } }
setInterval(() => { if (gr && P.online) { try { gr.presence(myState()); } catch (e) { } } }, 4000);
function onPeers(peers) {
  const o = P.online; if (!o) return;
  const others = peers.filter(p => !isYou(p)).map(peerState).filter(Boolean);
  const opp = others.find(s => s.role !== o.role);
  o.oppName = opp ? opp.name : o.oppName;
  if (o.role === 'host') {
    if (opp && !o.started) { o.started = true; startGame({ color: o.hostColor, tc: o.tc }); pushOnline(); A.toast(`${opp.name} joined`); }
  }
  if (opp) applyRemote(opp);
  $('#pstatus') && render();
}
function applyRemote(st) {
  const o = P.online; if (!o || !st || st.k !== 'ks' || st.role === o.role || st.code !== o.code) return;
  if (o.role === 'guest' && st.started && (!o.started || st.round !== o.round)) {
    o.started = true; o.round = st.round; o.tc = st.tc; o.hostColor = st.hostColor;
    startGame({ color: st.hostColor === 'w' ? 'b' : 'w', tc: st.tc });
  }
  if (!P.g || (st.round || 0) !== (o.round || 0)) return;
  if (st.ply > P.g.history().length && st.pgn) {
    const c = new Chess(); if (!c.load_pgn(st.pgn)) return;
    const mine = P.g.history(), theirs = c.history();
    if (!mine.every((s, i) => s === theirs[i])) return;
    const last = c.history({ verbose: true }).pop();
    P.g = c; if (st.clocks && P.clocks) { P.clocks.w = st.clocks.w; P.clocks.b = st.clocks.b; P.clocks.t = performance.now(); }
    A.moveSound(last, P.g); render(true);
  }
  if (st.result && !P.over && st.ply === P.g.history().length) endGame(st.result, st.resultText || 'Game over', true);
  else if (!P.over) checkEnd();
}
function leaveOnline() { if (gr) { try { gr.leave(); } catch (e) { } } gr = null; P.online = null; }
$('#hostBtn').onclick = async () => {
  let code = ''; for (let i = 0; i < 5; i++) code += CODE_CH[Math.floor(Math.random() * CODE_CH.length)];
  const hostColor = P.color === 'r' ? (Math.random() < .5 ? 'w' : 'b') : P.color;
  if (!(await joinRoom(code))) return;
  P.online = { role: 'host', code, hostColor, tc: P.tc, round: 0, started: false };
  $('#hostBox').hidden = false; $('#hostCode').textContent = code;
  try { gr.presence(myState()); } catch (e) { }
};
$('#joinBtn').onclick = async () => {
  const code = $('#joinCode').value.trim().toUpperCase(); if (code.length < 4) { A.toast('Enter the code your friend sent'); return; }
  if (!(await joinRoom(code))) return;
  P.online = { role: 'guest', code, round: 0, started: false };
  try { gr.presence(myState()); } catch (e) { }
  A.toast('Joined — waiting for the host');
};

A.views.play = { leave() { if (P.g && !P.over && P.mode !== 'local' && P.g.history().length >= 10) { persistLive(); A.queueReview(P.gid); } }, enter() { renderSetup(); render(); }, refresh() { renderSetup(); drawPlayers(); } };
A.openPlay = () => A.go('play');
}
