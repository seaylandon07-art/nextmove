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
const P = { mode: 'bot', bot: 3, color: 'w', tc: 'none', open: 'auto', g: null, me: 'w', over: false, thinking: false, clocks: null, showEval: false, evalLine: null, line: null, online: null };
A.P = P;
const pb = A.board($('#play .bd'), {
  movable: () => !P.g || P.over || P.thinking ? null : P.mode === 'local' ? 'both' : (P.mode === 'online' && !P.online?.started) ? null : P.me,
  legal: A.legalFor(() => P.g.fen()),
  onMove: (f, t, pr) => userMove(f, t, pr)
});
function botObj() { return BOTS[P.bot]; }
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
  P.g = new Chess(); P.over = false; P.result = null; P.evalLine = null; P.hint = null; P.thinking = false;
  if (P.mode === 'local') P.me = 'w';
  else if (P.mode === 'online') P.me = opts.color;
  else P.me = P.color === 'r' ? (Math.random() < .5 ? 'w' : 'b') : P.color;
  const tc = TCS[opts.tc || P.tc]; P.clocks = tc ? { w: tc[0] * 1000, b: tc[0] * 1000, inc: tc[1] * 1000, t: null } : null;
  P.line = P.mode === 'bot' ? pickLine(P.me === 'w' ? 'b' : 'w') : null;
  pb.flip(P.me);
  const n = names(); P.g.header('Event', P.mode === 'online' ? 'NextMove online game' : 'NextMove game', 'Date', A.today().replace(/-/g, '.'), 'White', n.w, 'Black', n.b);
  $('#setup').hidden = true; $('#ingame').hidden = false; $('#overBox').hidden = true;
  $('#hintBtn').hidden = P.mode !== 'bot'; $('#undoBtn').hidden = P.mode === 'online';
  render();
  if (P.mode === 'bot' && P.me === 'b') botMove();
}
$('#startGame').onclick = () => startGame();
function render(anim) {
  const g = P.g; if (!g) { pb.set(K.START); drawPlayers(); return; }
  const h = g.history({ verbose: true }); const last = h[h.length - 1];
  pb.set(g.fen(), { last: last ? last.from + last.to : null, arrows: P.hint ? [P.hint] : [], anim });
  drawPlayers();
  const ml = []; for (let i = 0; i < h.length; i += 2) ml.push(`<li><span>${i / 2 + 1}</span><b>${A.fig(h[i].san, 'w')}</b><b>${h[i + 1] ? A.fig(h[i + 1].san, 'b') : ''}</b></li>`);
  $('#pmoves').innerHTML = ml.join(''); $('#pmoves').scrollTop = 1e6;
  let st = P.over ? P.result : g.in_check() ? 'Check' : (g.turn() === 'w' ? 'White' : 'Black') + ' to move';
  if (P.thinking) st = `${botObj().n} is thinking…`;
  if (P.mode === 'online' && !P.over) st = P.online && P.online.started ? (g.turn() === P.me ? 'Your move' : 'Their move') : 'Waiting for opponent';
  $('#pstatus').textContent = st;
  $('#pdot').className = 'dot' + (!P.over && (P.thinking || (P.mode === 'online' && g.turn() !== P.me)) ? ' live' : '');
  const op = K.openingName([K.START, ...(() => { const c = new Chess(); return h.map(m => { c.move(m.san); return c.fen(); }); })()]);
  $('#popen').textContent = op || '';
  $('#play .evalbar').classList.toggle('off', !P.showEval);
  A.setEvalBar($('#play .evalbar'), P.evalLine, pb.orient);
  drawClocks();
}
function drawPlayers() {
  const n = P.g ? names() : { w: 'White', b: 'Black' };
  const top = pb.orient === 'w' ? 'b' : 'w', bot = top === 'w' ? 'b' : 'w';
  const fen = P.g ? P.g.fen() : K.START;
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
  P.hint = null; A.moveSound(m, P.g);
  if (P.mode === 'online') pushOnline();
  if (checkEnd()) return true;
  if (P.showEval) K.analyse(P.g.fen(), 12).then(r => { P.evalLine = r.lines[0]; A.setEvalBar($('#play .evalbar'), P.evalLine, pb.orient); });
  return false;
}
function userMove(f, t, pr) {
  if (!P.g || P.over) return false;
  const color = P.g.turn();
  const m = P.g.move({ from: f, to: t, promotion: pr || 'q' }); if (!m) return false;
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
  let u = bookMove();
  if (!u) {
    const legal = P.g.moves({ verbose: true });
    if (b.rand && Math.random() < b.rand) u = K.uciOf(legal[Math.floor(Math.random() * legal.length)]);
    else { const j = await K.eng.run(fen, { depth: b.depth, skill: b.skill ?? 20, elo: b.elo, multipv: 1 }); u = j.best; }
  }
  const think = P.clocks ? 250 + Math.random() * 500 : 350 + Math.random() * 600;
  const wait = think - (performance.now() - t0); if (wait > 0) await K.sleep(wait);
  if (gid !== P.g || P.over || P.g.fen() !== fen) { P.thinking = false; return; }
  const color = P.g.turn();
  const m = u && u !== '(none)' ? K.mv(P.g, u) : null;
  P.thinking = false;
  if (!m) { render(); return; }
  afterMove(color, m); render(true);
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
  S().games.push({ id: A.uid(), pgn: P.g.pgn(), date: A.today(), white: n.w, black: n.b, result: res, src: P.mode, me: P.mode === 'local' ? null : P.me });
  K.save(); A.sound('end');
  if (P.mode === 'online' && !remote) pushOnline();
  $('#overBox').hidden = false; $('#overText').textContent = text;
  render(); A.refresh();
}
function saveUnfinished() {
  if (P.g && !P.over && P.g.history().length >= 16) { P.g.header('Result', '*'); const n = names(); S().games.push({ id: A.uid(), pgn: P.g.pgn(), date: A.today(), white: n.w, black: n.b, result: '*', src: P.mode, me: P.mode === 'local' ? null : P.me }); K.save(); }
}
$('#hintBtn').onclick = async () => {
  if (!P.g || P.over || P.thinking) return;
  const r = await K.analyse(P.g.fen(), 14); const b = r.lines[0]; if (!b || !b.move) return;
  P.hint = { from: b.move.slice(0, 2), to: b.move.slice(2, 4), c: '#e6a83a' }; render();
};
$('#undoBtn').onclick = () => {
  if (!P.g || P.thinking || P.mode === 'online') return;
  if (P.over) { P.over = false; $('#overBox').hidden = true; S().games.pop(); }
  P.g.undo(); if (P.mode === 'bot' && P.g.turn() !== P.me) P.g.undo();
  if (P.mode === 'local') pb.orient = P.g.turn();
  render();
};
$('#flipBtn').onclick = () => { pb.flip(); render(); };
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
$('#reviewThis').onclick = () => { const g = S().games[S().games.length - 1]; if (g) { A.go('review'); A.loadReview(g.pgn, g.me); } };

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

A.views.play = { enter() { renderSetup(); render(); }, refresh() { renderSetup(); drawPlayers(); } };
A.openPlay = () => A.go('play');
}
