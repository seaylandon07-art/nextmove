/* NextMove — Train */
{
const { esc, $, CLS } = K; const { S, $$ } = A;
const T = { mode: null, theme: 'All' };
const tb = A.board($('#session .bd'), {
  movable: () => T.lock ? null : T.movable || null,
  legal: A.legalFor(() => T.fen),
  onMove: (f, t, pr) => trainMove(f, t, pr),
  onSquare: sq => T.onSquare ? T.onSquare(sq) : false
});
const BOX_DAYS = [0, 1, 3, 7, 16, 35];

/* ---------- hub ---------- */
function renderHub() {
  const s = S(); s.best = s.best || {};
  const done = (s.days || {})[A.today()] || 0, st = A.streak(), due = A.due().length;
  const pct = Math.min(1, done / A.GOAL), C = 2 * Math.PI * 23;
  $('#today').innerHTML = `<svg viewBox="0 0 58 58" class="ring"><circle cx="29" cy="29" r="23" class="rb"/><circle cx="29" cy="29" r="23" class="rf" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/><text x="29" y="35" text-anchor="middle">${Math.min(done, 99)}</text></svg>
    <div><h1>${done >= A.GOAL ? 'Daily goal done' : 'Train'}</h1><p class="mute">${done >= A.GOAL ? 'Anything more is a bonus.' : `${A.GOAL - done} more reps for today’s goal`} · ${st ? `${st}-day streak` : 'no streak yet'} · ${due} drill${due === 1 ? '' : 's'} due</p></div>
    <button class="btn" data-start="${due ? 'drills' : 'tactics'}">${due ? 'Start with drills' : 'Start with puzzles'}</button>`;
  const mastered = s.drills.filter(x => x.box >= 4).length;
  $('#hDrills').textContent = s.drills.length ? `${due} due` : 'empty';
  $('#hConv').textContent = s.conv.length ? `${s.conv.filter(c => s.eg['c:' + c.id]).length}/${s.conv.length}` : 'none yet';
  $('#hTactics').textContent = Math.round(s.puz.r);
  $('#hStreak').textContent = s.best.streak ? `best ${s.best.streak}` : '';
  $('#hRush').textContent = s.best.rush ? `best ${s.best.rush}` : '';
  $('#hGambit').textContent = A.GAMB.length ? `${A.GAMB.filter(g => s.op[g.name]).length}/${A.GAMB.length}` : '';
  $('#hOpen').textContent = `${Object.keys(s.op).filter(n => !A.GAMB.some(g => g.name === n)).length} drilled`;
  $('#hEnd').textContent = A.EG.length ? `${A.EG.filter(e => s.eg[e.title]).length}/${A.EG.length}` : '';
  $('#hVision').textContent = s.best.vision ? `best ${s.best.vision}` : '';
  void mastered;
}
$('#hub').onclick = e => { const b = e.target.closest('[data-start]'); if (b) start(b.dataset.start); };
function start(m) { ({ drills: () => startDrills(), conv: startConv, tactics: startTactics, streak: () => startRun('streak'), rush: () => startRun('rush'), gambits: startGambits, open: startOpenings, end: startEndgames, vision: startVision })[m](); }
A.startTrain = start;

/* ---------- session chrome ---------- */
function open(mode, title) {
  stopTimer();
  T.mode = mode; T.lock = false; T.movable = null; T.hintLvl = 0; T.onSquare = null; T.onMove = null; T.inner = false; T.back = null;
  $('#hub').hidden = true; $('#session').hidden = false; $('#tTitle').textContent = title; $('#tMeta').textContent = '';
  $('#tFb').innerHTML = ''; $('#tList').innerHTML = ''; $('#tList').hidden = true; $('#tTop').hidden = true;
  $('#session .bwrap').hidden = false;
  tools({}); window.scrollTo({ top: 0 });
}
function close() { stopTimer(); T.mode = null; K.eng.stop(); $('#hub').hidden = false; $('#session').hidden = true; renderHub(); }
$('#tBack').onclick = () => { if (T.mode && T.back && T.inner) { T.inner = false; T.back(); } else close(); };
function tools(o) { for (const k of ['Hint', 'Show', 'Undo', 'Restart', 'Skip', 'Next']) $('#t' + k).hidden = !o[k.toLowerCase()]; $('#tTools').hidden = !Object.values(o).some(Boolean); }
function prompt(h, sub) { $('#tPrompt').innerHTML = `<b>${h}</b>${sub ? `<p>${sub}</p>` : ''}`; }
function fb(kind, head, lines = [], extra = '', shows = [], restore) { $('#tFb').innerHTML = `<div class="fb ${kind}"><b>${head}</b>${A.explainHTML({ text: lines.filter(Boolean), shows }, tb, restore || (() => show(T.fen)))}${extra}</div>`; }
const nm = (fen, u) => esc(K.moveName(fen, u));
const keep = t => !/^The line:|^Better was/.test(t);
function show(fen, o = {}) { T.fen = fen; tb.set(fen, o); }
for (const [id, fn] of [['tHint', 'hint'], ['tShow', 'show'], ['tNext', 'next'], ['tUndo', 'undo'], ['tRestart', 'restart']]) $('#' + id).onclick = () => T[fn] && T[fn]();
$('#tSkip').onclick = () => T.skip ? T.skip() : T.next && T.next();
document.addEventListener('keydown', e => {
  if (A.cur() !== 'train' || !T.mode || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === 'Enter' && !$('#tNext').hidden) T.next(); if ((e.key === 'h' || e.key === 'H') && !$('#tHint').hidden) T.hint();
});
async function hintFor(fen) {
  const r = await K.analyse(fen, 13, 1); const b = r.lines[0]; if (!b || !b.move) return;
  T.hintLvl++;
  if (T.hintLvl === 1) tb.set(fen, { marks: { [b.move.slice(0, 2)]: 'hint' } });
  else tb.set(fen, { arrows: [{ from: b.move.slice(0, 2), to: b.move.slice(2, 4), c: '#ff5c28' }] });
}
function trainMove(f, t, pr) {
  const c = new Chess(T.fen); const m = c.move({ from: f, to: t, promotion: pr || 'q' }); if (!m) return false;
  A.moveSound(m, c);
  T.onMove && T.onMove(K.uciOf(m), c, m);
  return true;
}
const clsOf = j => j.loss > 22 ? 'blunder' : j.loss > 12 ? 'mistake' : 'inaccuracy';

/* ---------- mistake drills ---------- */
function startDrills(all) {
  let q = A.due().sort((a, b) => a.due - b.due);
  if (!q.length && all) q = S().drills.slice().sort(() => Math.random() - .5).slice(0, 12);
  open('drills', 'Mistake drills');
  if (!q.length) {
    prompt(S().drills.length ? 'All caught up' : 'No drills yet', S().drills.length ? 'Nothing is due right now. Practise anyway, or come back tomorrow.' : 'Review one of your games with your side set, and every mistake you made lands here automatically.');
    show(K.START); $('#tFb').innerHTML = S().drills.length ? '<button class="btn" id="drillAny">Practise anyway</button>' : '<a class="btn" href="#review">Review a game</a>';
    const b = $('#drillAny'); if (b) b.onclick = () => startDrills(true);
    return;
  }
  T.q = q; T.qi = 0; drill();
}
function drill() {
  const d = T.q[T.qi];
  if (!d) { prompt('Session done', `${T.q.length} position${T.q.length === 1 ? '' : 's'} reviewed. Missed ones come back sooner.`); $('#tFb').innerHTML = ''; tools({}); T.movable = null; return; }
  T.d = d; T.first = true; T.hintLvl = 0; T.lock = false;
  const color = d.fen.split(' ')[1]; tb.orient = color; show(d.fen); T.movable = color;
  $('#tMeta').textContent = `${T.qi + 1} / ${T.q.length}`;
  prompt(`${color === 'w' ? 'White' : 'Black'} to move — find a better move`, `From ${esc(d.src)}. You played: <b>${nm(d.fen, d.played)}</b>${CLS[d.cls] ? ` (${CLS[d.cls].t.toLowerCase()})` : ''}.`);
  $('#tFb').innerHTML = '';
  tools({ hint: true, show: true, skip: true });
  T.hint = () => { T.first = false; hintFor(d.fen); };
  T.show = () => drillReveal();
  T.skip = () => { T.qi++; drill(); };
  T.onMove = async (u, c) => {
    T.lock = true; tb.set(c.fen(), { last: u, anim: !tb.lastWasDrag }); fb('', 'Checking…');
    const j = await K.judge(d.fen, u, { depth: 14, tol: 5 });
    if (T.d !== d) return;
    if (j.ok) {
      grade(T.first); A.sound('good');
      const x = new Chess(d.fen); K.mv(x, d.played); const orig = await K.analyse(x.fen(), 13, 1);
      const why = K.explain({ fen: d.fen, u: d.played, cls: d.cls, pre: j.pre, post: orig, color: d.fen.split(' ')[1] });
      fb('ok', `${nm(d.fen, u)} — that works${T.first ? '' : ' (with help)'}`, [j.isBest ? 'That’s the engine’s top move.' : `The engine’s top choice was: ${K.moveName(d.fen, j.best.move)}. Yours is just as good.`, `What went wrong in the game: ${why.text.filter(keep).join(' ')}`], A.sample ? `<div class="row"><button class="btn quiet coach" id="coachT"><svg class="i"><use href="#i-chat"/></svg>Ask coach</button></div><p class="coachbox" id="coachTbox" hidden></p>` : '', why.shows.filter(x => x.label === 'Show what happens').map(x => ({ ...x, label: 'Show what went wrong in the game' })), () => show(c.fen()));
      const cb = $('#coachT'); if (cb) cb.onclick = () => A.coach(cb, $('#coachTbox'), A.coachCtx(d.fen, d.played, j.pre, orig, d.cls));
      tools({ next: true }); T.next = () => { T.qi++; drill(); };
    } else {
      T.first = false; A.sound('bad');
      const ex = K.explain({ fen: d.fen, u, cls: clsOf(j), pre: j.pre, post: j.post, color: d.fen.split(' ')[1] });
      fb('no', `${nm(d.fen, u)} — not quite`, ex.text.filter(keep).concat(['Try again.']), '', ex.shows.filter(x => x.label === 'Show what happens'), () => { show(d.fen); T.lock = false; });
      setTimeout(() => { if (T.d === d && !A.playing) { show(d.fen); T.lock = false; } }, 900);
    }
  };
}
function grade(ok) {
  const d = S().drills.find(x => x.id === T.d.id); if (!d) return;
  d.n++; A.tick(); if (ok) { d.ok++; d.box = Math.min(5, d.box + 1); d.due = Date.now() + BOX_DAYS[d.box] * A.DAY; } else { d.box = 0; d.due = Date.now() + 10 * 60e3; }
  K.save();
}
async function drillReveal() {
  const d = T.d; T.lock = true; grade(false);
  const pre = await K.analyse(d.fen, 14, 3); const b = pre.lines[0];
  const x = new Chess(d.fen); K.mv(x, d.played); const orig = await K.analyse(x.fen(), 13, 1);
  const why = K.explain({ fen: d.fen, u: d.played, cls: d.cls, pre, post: orig, color: d.fen.split(' ')[1] });
  show(d.fen, { arrows: [{ from: b.move.slice(0, 2), to: b.move.slice(2, 4), c: '#5aa54a' }] });
  const db = K.describeBest(d.fen, b);
  fb('', `Best: ${nm(d.fen, b.move)}`, [db.text, `Your game move: ${why.text.filter(keep).join(' ')}`, 'This one comes back in 10 minutes.'], '', db.shows, () => show(d.fen, { arrows: [{ from: b.move.slice(0, 2), to: b.move.slice(2, 4), c: '#5aa54a' }] }));
  tools({ next: true }); T.next = () => { T.qi++; drill(); };
}

/* ---------- puzzles: rated, streak, rush ---------- */
function pool(min, max) {
  const s = S();
  let p = A.PUZ.filter(x => (T.theme === 'All' || x.theme.startsWith(T.theme)) && x.rating >= min && x.rating <= max);
  const fresh = p.filter(x => !(x.id in s.puz.done)); return fresh.length ? fresh : p;
}
function pickRated() {
  const r = S().puz.r; let p = pool(r - 250, r + 250); if (p.length < 3) p = pool(0, 9999);
  p.sort((a, b) => Math.abs(a.rating - r) - Math.abs(b.rating - r)); return p[Math.floor(Math.random() * Math.min(8, p.length))];
}
function themeChips() {
  const themes = ['All', 'Mate', 'Fork', 'Hanging piece', 'Win material'];
  $('#tList').hidden = false;
  $('#tList').innerHTML = `<div class="chips">${themes.map(t => `<button class="chip${t === T.theme ? ' on' : ''}" data-th="${t}">${t}</button>`).join('')}</div>`;
  $('#tList').onclick = e => { const b = e.target.closest('[data-th]'); if (b) { T.theme = b.dataset.th; startTactics(); } };
}
function startTactics() {
  open('tactics', 'Rated puzzles'); themeChips();
  if (!A.PUZ.length) { prompt('Puzzles are loading…'); return; }
  T.run = null; puzzle(pickRated());
}
function startRun(kind) {
  open(kind, kind === 'rush' ? 'Puzzle rush' : 'Puzzle streak');
  if (!A.PUZ.length) { prompt('Puzzles are loading…'); return; }
  T.theme = 'All';
  T.run = { kind, n: 0, strikes: 0, seen: new Set(), end: kind === 'rush' ? Date.now() + 180e3 : 0, over: false };
  prompt(kind === 'rush' ? 'Three minutes. Three strikes.' : 'Solve as many as you can in a row.', kind === 'rush' ? 'Puzzles get harder as you go. A wrong move is a strike.' : 'No time limit, but one wrong move ends the streak.');
  $('#tFb').innerHTML = '<button class="btn" id="runGo">Start</button>';
  show(K.START); tools({});
  $('#runGo').onclick = () => { if (kind === 'rush') { T.run.end = Date.now() + 180e3; startTimer(); } nextRun(); };
}
function nextRun() {
  const R = T.run; if (R.over) return;
  const target = 600 + R.n * (R.kind === 'rush' ? 45 : 60);
  let p = A.PUZ.filter(x => !R.seen.has(x.id) && x.rating >= target - 150 && x.rating <= target + 200);
  if (!p.length) p = A.PUZ.filter(x => !R.seen.has(x.id)).sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target)).slice(0, 6);
  if (!p.length) return endRun('You cleared every puzzle!');
  const z = p[Math.floor(Math.random() * p.length)]; R.seen.add(z.id); puzzle(z);
  runMeta();
}
function runMeta() { const R = T.run; if (!R) return; $('#tMeta').innerHTML = R.kind === 'rush' ? `<span class="strikes">${[0, 1, 2].map(i => `<i class="${i < R.strikes ? 'x' : ''}"></i>`).join('')}</span>` : ''; }
let timer = null;
function startTimer() { stopTimer(); timer = setInterval(() => { const R = T.run; if (!R || R.over) return stopTimer(); const left = Math.max(0, R.end - Date.now()); const s = Math.ceil(left / 1000); $('#tTitle').textContent = `Rush · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${R.n}`; if (!left) endRun('Time’s up!'); }, 250); }
function stopTimer() { if (timer) clearInterval(timer); timer = null; }
function endRun(why) {
  const R = T.run; if (!R || R.over) return; R.over = true; stopTimer(); T.lock = true; T.movable = null;
  const s = S(); s.best = s.best || {}; const key = R.kind; const rec = R.n > (s.best[key] || 0);
  if (rec) s.best[key] = R.n; K.save(); A.sound('end');
  $('#tTitle').textContent = R.kind === 'rush' ? 'Puzzle rush' : 'Puzzle streak';
  prompt(why, '');
  $('#tFb').innerHTML = `<div class="score"><b>${R.n}</b><span>solved${rec ? ' · new best!' : ` · best ${s.best[key] || 0}`}</span></div><div class="row" style="margin-top:12px"><button class="btn" id="runAgain">Go again</button></div>`;
  $('#runAgain').onclick = () => startRun(R.kind);
  tools({});
}
function puzzle(p) {
  T.p = p; T.step = 0; T.alt = false; T.failed = false; T.hintLvl = 0; T.lock = true;
  const color = p.fen.split(' ')[1]; T.color = color; tb.orient = color;
  const isRun = !!T.run;
  prompt(`${color === 'w' ? 'White' : 'Black'} to move`, isRun ? `Puzzle ${T.run.n + 1} · rated ${p.rating}` : `Find the strongest move. Rated ${p.rating} · you ${Math.round(S().puz.r)}`);
  $('#tFb').innerHTML = '';
  tools(isRun ? (T.run.kind === 'rush' ? { skip: false } : {}) : { hint: true, show: true, skip: true });
  // show the opponent's last move first when we have it
  if (p.pre && p.last) { show(p.pre); setTimeout(() => { if (T.p !== p) return; const c = new Chess(p.pre); const m = K.mv(c, p.last); show(p.fen, { last: p.last, anim: true }); A.moveSound(m, c); T.lock = false; T.movable = color; }, 450); }
  else { show(p.fen); T.lock = false; T.movable = color; }
  T.hint = () => { fail(); if (T.hintLvl === 0) fb('', `Theme: ${esc(p.theme)}`); hintFor(T.fen); };
  T.show = () => solution();
  T.skip = () => puzzle(pickRated());
  T.onMove = async (u, c) => {
    const fen = T.fen; T.lock = true; tb.set(c.fen(), { last: u, anim: !tb.lastWasDrag });
    let ok = false, alt = false, j = null;
    if (!T.alt && u === p.sol[T.step]) ok = true;
    else if (c.in_checkmate()) ok = true;
    else { fb('', 'Checking…'); j = await K.judge(fen, u, { depth: 13, tol: 5, winning: 93 }); ok = j.ok; alt = ok; }
    if (T.p !== p) return;
    if (!ok) {
      A.sound('bad');
      if (T.run) { if (T.run.kind === 'streak') return endRun(`Streak over at ${T.run.n}`); T.run.strikes++; runMeta(); fb('no', `Strike ${T.run.strikes}`, [`The answer was: ${K.moveName(fen, p.sol[T.step])}.`]); if (T.run.strikes >= 3) return endRun('Three strikes'); setTimeout(() => nextRun(), 900); return; }
      fail();
      const ex = K.explain({ fen, u, cls: clsOf(j), pre: j.pre, post: j.post, color: T.color });
      fb('no', `${nm(fen, u)} — not quite`, ex.text.filter(keep).slice(0, 2).concat(['Try again, or tap Answer.']), '', ex.shows.filter(x => x.label === 'Show what happens'), () => { show(fen); T.lock = false; });
      setTimeout(() => { if (T.p === p && !A.playing) { show(fen); T.lock = false; } }, 900);
      return;
    }
    if (alt && !T.run) { T.alt = true; fb('ok', 'That works too', [`The planned answer was: ${K.moveName(fen, p.sol[T.step])}. Your move wins just as well.`]); }
    else if (alt) T.alt = true;
    const left = Math.ceil((p.sol.length - T.step) / 2) - 1;
    if (c.in_checkmate() || left <= 0) return solved(c.fen(), u);
    let reply;
    if (!T.alt) reply = p.sol[T.step + 1];
    else { const r = await K.analyse(c.fen(), 12, 1); reply = r.lines[0] && r.lines[0].move; }
    T.step += 2;
    await K.sleep(320); if (T.p !== p) return;
    if (!reply) return solved(c.fen(), u);
    const m = K.mv(c, reply); show(c.fen(), { last: reply, anim: true }); A.moveSound(m, c);
    if (!$('#tFb .ok') && !T.run) fb('', 'Good — keep going.');
    T.lock = false;
  };
}
function fail() {
  if (T.failed || T.run) return; T.failed = true;
  const s = S(); const p = T.p; const e = 1 / (1 + 10 ** ((p.rating - s.puz.r) / 400)); s.puz.r += 24 * (0 - e);
  s.puz.done[p.id] = 0; s.puz.hist.push({ t: Date.now(), r: Math.round(s.puz.r), ok: 0 }); A.tick(); K.save();
}
function solved(fen, u) {
  const s = S(); const p = T.p; T.lock = true; A.sound('good');
  if (T.run) { T.run.n++; A.tick(); K.save(); runMeta(); if (T.run.kind === 'rush') $('#tTitle').textContent = `Rush · ${T.run.n}`; else $('#tTitle').textContent = `Streak · ${T.run.n}`; setTimeout(() => nextRun(), 500); return; }
  let delta = 0;
  if (!T.failed) { const e = 1 / (1 + 10 ** ((p.rating - s.puz.r) / 400)); delta = 24 * (1 - e); s.puz.r += delta; s.puz.done[p.id] = 1; s.puz.hist.push({ t: Date.now(), r: Math.round(s.puz.r), ok: 1 }); A.tick(); K.save(); }
  const db = K.describeBest(p.fen, { move: p.sol[0], pv: p.sol });
  fb('ok', T.failed ? 'Solved (no rating change)' : `Solved · +${Math.round(delta)}`, [`Theme: ${p.theme}.`, db.text, K.plainMode() ? '' : `Line: ${K.pvSan(p.fen, p.sol, 8)}`], '', db.shows, () => show(fen, { last: u }));
  tools({ next: true }); T.next = () => puzzle(pickRated()); A.renderMe();
}
async function solution() {
  const p = T.p; fail(); T.lock = true;
  const c = new Chess(p.fen); show(p.fen);
  const db = K.describeBest(p.fen, { move: p.sol[0], pv: p.sol });
  fb('', 'Solution', [db.text, K.plainMode() ? '' : `Line: ${K.pvSan(p.fen, p.sol, 8)}`], '', db.shows);
  for (const u of p.sol) { await K.sleep(650); if (T.p !== p) return; const m = K.mv(c, u); show(c.fen(), { last: u, anim: true }); A.moveSound(m, c); }
  tools({ next: true }); T.next = () => puzzle(pickRated());
}

/* ---------- endgames & conversion ---------- */
function startEndgames() {
  open('end', 'Endgames'); $('#session .bwrap').hidden = true;
  prompt('Pick a position', 'You play it out against full-strength Stockfish. Undo is allowed — this is practice.');
  const s = S(); const groups = {};
  A.EG.forEach(e => (groups[e.group] = groups[e.group] || []).push(e));
  let h = '<div class="picker">';
  for (const [g, list] of Object.entries(groups)) h += `<h4>${esc(g)}</h4>${list.map(e => `<div class="prow"><span><b>${esc(e.title)}${s.eg[e.title] ? '<span class="done">✓ done</span>' : ''}</b><small>${e.goal === 'win' ? 'Win it' : 'Hold the draw'}</small></span><button class="btn sec" data-eg="${esc(e.title)}">Play</button></div>`).join('')}`;
  $('#tList').hidden = false; $('#tList').innerHTML = h + '</div>';
  $('#tList').onclick = e => { const b = e.target.closest('[data-eg]'); if (b) { T.inner = true; T.back = startEndgames; egPlay(A.EG.find(x => x.title === b.dataset.eg)); } };
}
function startConv() {
  open('conv', 'Convert your wins'); $('#session .bwrap').hidden = true;
  const s = S();
  if (!s.conv.length) { prompt('Nothing to convert yet', 'When a reviewed game had a clearly winning position that you didn’t win, it shows up here so you can practise finishing it.'); show(K.START); $('#session .bwrap').hidden = false; return; }
  prompt('Finish what you started', 'Each position is from one of your games where you were clearly winning. Beat full-strength Stockfish from there.');
  $('#tList').hidden = false; $('#tList').innerHTML = `<div class="picker">${s.conv.slice().reverse().map(c => `<div class="prow"><span><b>${esc(c.src)}${s.eg['c:' + c.id] ? '<span class="done">✓ converted</span>' : ''}</b><small>${esc(c.title)}</small></span><button class="btn sec" data-conv="${esc(c.id)}">Play</button></div>`).join('')}</div>`;
  $('#tList').onclick = e => { const b = e.target.closest('[data-conv]'); if (!b) return; const c = s.conv.find(x => x.id === b.dataset.conv); T.inner = true; T.back = startConv; egPlay({ title: 'Convert this win', key: 'c:' + c.id, group: 'Conversion', fen: c.fen, goal: 'win', tip: 'You were clearly winning here. Trade pieces, keep your king safe, and push your extra material home.' }); };
}
function egPlay(e) {
  $('#tList').hidden = true; $('#session .bwrap').hidden = false;
  const color = e.fen.split(' ')[1];
  T.e = e; T.g = new Chess(e.fen); T.color = color; T.hintLvl = 0; T.lock = false;
  tb.orient = color; show(T.g.fen()); T.movable = color;
  prompt(`${esc(e.title)} — ${e.goal === 'win' ? 'win it' : 'hold the draw'}`, esc(e.tip));
  $('#tFb').innerHTML = '';
  tools({ hint: true, undo: true, restart: true });
  T.hint = () => hintFor(T.g.fen());
  T.restart = () => egPlay(e);
  T.undo = () => { if (T.lock) return; T.g.undo(); if (T.g.turn() !== color) T.g.undo(); show(T.g.fen()); $('#tFb').innerHTML = ''; T.movable = color; };
  T.onMove = async (u) => {
    K.mv(T.g, u); show(T.g.fen(), { last: u, anim: !tb.lastWasDrag }); T.hintLvl = 0;
    if (egEnd()) return;
    T.lock = true;
    const r = await K.analyse(T.g.fen(), 14, 1); const b = r.lines[0]; if (T.e !== e) return;
    const v = K.winFor(b, color);
    await K.sleep(250);
    const m = K.mv(T.g, b.move); show(T.g.fen(), { last: b.move, anim: true }); A.moveSound(m, T.g); T.lock = false;
    if (egEnd()) return;
    const conv = e.group === 'Conversion';
    if (e.goal === 'win' && conv && v >= 99.3 && Math.abs(K.cpv(b)) < 9000) return egDone(true, 'The bot resigns — you converted it.');
    if (e.goal === 'win' && v < 70) fb('no', 'The win is slipping', ['The engine no longer sees a clear win. Undo and try a different plan.']);
    else if (e.goal === 'draw' && v < 15) fb('no', 'You’re losing this', ['Undo and try to set up the defence again.']);
    else $('#tFb').innerHTML = `<p class="small mute">Move ${Math.floor(T.g.history().length / 2) + 1} · eval ${esc(K.fmtEval(b))}</p>`;
    if (e.goal === 'draw' && T.g.history().length >= 60) egDone(true, 'You held for 30 moves — that’s a draw.');
  };
}
function egEnd() {
  const g = T.g, e = T.e, me = T.color;
  if (g.in_checkmate()) { const won = g.turn() !== me; egDone(won, won ? 'Checkmate!' : 'You got mated.'); return true; }
  if (g.in_draw() || g.in_stalemate() || g.in_threefold_repetition() || g.insufficient_material()) { const why = g.in_stalemate() ? 'Stalemate' : g.in_threefold_repetition() ? 'Repetition' : 'Draw'; egDone(e.goal === 'draw', e.goal === 'draw' ? `${why} — you held it.` : `${why}. The win got away — try again.`); return true; }
  return false;
}
function egDone(ok, msg) {
  T.lock = true; A.sound(ok ? 'good' : 'bad');
  if (ok) { S().eg[T.e.key || T.e.title] = Date.now(); A.tick(); K.save(); }
  fb(ok ? 'ok' : 'no', msg);
  tools({ restart: true });
}

/* ---------- openings & gambits ---------- */
function startOpenings() {
  open('open', 'Opening lines'); $('#session .bwrap').hidden = true;
  prompt('Pick a line and a side', 'The board plays the other side. Other theory moves are accepted with a note.');
  const lines = K.BOOKLINES.filter(l => l.moves.length >= 4);
  const grp = { '1.e4': [], '1.d4': [], 'Other first moves': [] };
  lines.forEach(l => (l.moves[0] === 'e2e4' ? grp['1.e4'] : l.moves[0] === 'd2d4' ? grp['1.d4'] : grp['Other first moves']).push(l));
  const s = S(); let h = '<div class="picker">';
  for (const [g, list] of Object.entries(grp)) h += `<h4>${g}</h4>${list.map(l => `<div class="prow"><span><b>${esc(l.name)}${s.op[l.name] ? `<span class="done">${s.op[l.name].reps}×</span>` : ''}</b><small>${esc(K.pvSan(K.START, l.moves, 8))}</small></span><span class="row"><button class="btn sec" data-ol="${esc(l.name)}" data-c="w">White</button><button class="btn sec" data-ol="${esc(l.name)}" data-c="b">Black</button></span></div>`).join('')}`;
  $('#tList').hidden = false; $('#tList').innerHTML = h + '</div>';
  $('#tList').onclick = e => { const b = e.target.closest('[data-ol]'); if (b) { T.inner = true; T.back = startOpenings; opPlay(lines.find(l => l.name === b.dataset.ol), b.dataset.c); } };
}
function startGambits() {
  open('gambit', 'Gambit lab'); $('#session .bwrap').hidden = true;
  prompt('Gambits and traps', 'Each line shows its plan while you play. In traps, the opponent walks in and you find the punishing moves.');
  const s = S();
  const grp = { 'Gambits for White': A.GAMB.filter(g => g.kind === 'gambit' && g.side === 'w'), 'Gambits for Black': A.GAMB.filter(g => g.kind === 'gambit' && g.side === 'b'), 'Traps': A.GAMB.filter(g => g.kind === 'trap') };
  let h = '<div class="picker">';
  for (const [g, list] of Object.entries(grp)) h += `<h4>${g}</h4>${list.map(l => `<div class="prow"><span><b>${esc(l.name)}${l.kind === 'trap' ? '<span class="tag">trap</span>' : ''}${s.op[l.name] ? `<span class="done">✓ ${s.op[l.name].reps}×</span>` : ''}</b><small>${esc(K.pvSan(K.START, l.moves, 8))}</small></span><button class="btn sec" data-gl="${esc(l.name)}">Play ${l.side === 'w' ? 'White' : 'Black'}</button><p>${esc(l.idea)}</p></div>`).join('')}`;
  $('#tList').hidden = false; $('#tList').innerHTML = h + '</div>';
  $('#tList').onclick = e => { const b = e.target.closest('[data-gl]'); if (b) { const l = A.GAMB.find(x => x.name === b.dataset.gl); T.inner = true; T.back = startGambits; opPlay(l, l.side); } };
}
function opPlay(line, color) {
  $('#tList').hidden = true; $('#session .bwrap').hidden = false;
  T.line = line; T.color = color; T.idx = 0; T.g = new Chess(); T.clean = true; T.hintLvl = 0; T.lock = false;
  tb.orient = color; show(T.g.fen()); T.movable = color;
  const mine = line.moves.filter((_, i) => (i % 2 === 0) === (color === 'w')).length;
  prompt(esc(line.name), `You play ${color === 'w' ? 'White' : 'Black'} · ${mine} moves to find.`);
  const ideaBox = () => line.idea ? `<p class="idea">${esc(line.idea)}</p>` : '';
  $('#tFb').innerHTML = ideaBox();
  tools({ hint: true, restart: true });
  T.restart = () => opPlay(line, color);
  T.hint = () => { T.clean = false; const u = line.moves[T.idx]; if (u) show(T.g.fen(), { arrows: [{ from: u.slice(0, 2), to: u.slice(2, 4), c: '#ff5c28' }] }); };
  const auto = async () => {
    while (T.idx < line.moves.length && T.g.turn() !== color) { await K.sleep(450); if (T.line !== line) return; const u = line.moves[T.idx++]; const m = K.mv(T.g, u); show(T.g.fen(), { last: u, anim: true }); A.moveSound(m, T.g); }
    if (T.idx >= line.moves.length) opDone(); else $('#tMeta').textContent = `${Math.ceil(T.idx / 2)} / ${Math.ceil(line.moves.length / 2)}`;
  };
  T.onMove = async (u) => {
    const fen = T.g.fen(); const want = line.moves[T.idx];
    if (u === want) { const m = K.mv(T.g, u); T.idx++; show(T.g.fen(), { last: u, anim: !tb.lastWasDrag }); $('#tFb').innerHTML = ideaBox(); auto(); return; }
    T.clean = false; T.lock = true;
    const e = K.BOOK.get(K.key4(fen));
    if (e && e.moves.has(u)) { fb('', `${nm(fen, u)} — also theory`, [`It’s a fine move, but this line continues: ${K.moveName(fen, want)}. Try that.`]); T.lock = false; show(fen); return; }
    fb('', 'Checking…');
    const j = await K.judge(fen, u, { depth: 13, tol: 4 });
    if (j.ok) fb('', `${nm(fen, u)} — playable`, [`It’s not this line, though. The line continues: ${K.moveName(fen, want)}.`]);
    else { A.sound('bad'); const ex = K.explain({ fen, u, cls: clsOf(j), pre: j.pre, post: j.post, color }); fb('no', `${nm(fen, u)} — a mistake here`, ex.text.filter(keep).concat([`The line plays: ${K.moveName(fen, want)}.`]), '', ex.shows.filter(x => x.label === 'Show what happens'), () => show(fen)); }
    T.lock = false; show(fen);
  };
  auto();
}
function opDone() {
  const s = S(); const o = s.op[T.line.name] = s.op[T.line.name] || { reps: 0, clean: 0 };
  o.reps++; if (T.clean) o.clean++; o.last = Date.now(); A.tick(); K.save(); A.sound('good');
  fb('ok', `${T.line.kind === 'trap' ? 'Trap sprung' : 'Line complete'}${T.clean ? ' — no mistakes' : ''}`, [T.line.note || '', `Drilled ${o.reps}× (${o.clean} clean).`]);
  T.movable = null; tools({ restart: true });
}

/* ---------- board vision ---------- */
function startVision() {
  open('vision', 'Board vision');
  T.vis = { color: 'w', score: 0, end: 0, on: false };
  prompt('Find the square', 'A square name appears — tap it on the board. 30 seconds.');
  tb.orient = 'w'; show('8/8/8/8/8/8/8/8 w - - 0 1');
  $('#tList').hidden = false;
  $('#tList').innerHTML = `<div class="seg" id="visSeg"><button data-vc="w" class="on">From White</button><button data-vc="b">From Black</button><button data-vc="r">Random</button></div>`;
  $('#visSeg').onclick = e => { const b = e.target.closest('[data-vc]'); if (!b) return; $$('#visSeg button').forEach(x => x.classList.toggle('on', x === b)); T.vis.color = b.dataset.vc; tb.orient = b.dataset.vc === 'b' ? 'b' : 'w'; tb.render(); };
  $('#tFb').innerHTML = '<button class="btn" id="visGo">Start</button>';
  $('#visGo').onclick = visGo;
}
function visGo() {
  const V = T.vis; V.score = 0; V.on = true; V.end = Date.now() + 30e3; $('#tList').hidden = true;
  const newTarget = () => { V.target = 'abcdefgh'[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8)); if (V.color === 'r') { tb.orient = Math.random() < .5 ? 'w' : 'b'; tb.render(); } $('#tFb').innerHTML = `<div class="vision">${V.target}</div><p class="small mute" style="text-align:center">Score ${V.score}</p>`; };
  newTarget();
  T.onSquare = sq => {
    if (!V.on) return true;
    const ok = sq === V.target; A.sound(ok ? 'move' : 'bad');
    tb.set(tb.fen, { marks: { [sq]: ok ? 'good' : 'bad' } }); if (ok) V.score++;
    newTarget(); return true;
  };
  stopTimer(); timer = setInterval(() => { const left = Math.max(0, V.end - Date.now()); $('#tMeta').textContent = `${Math.ceil(left / 1000)}s`; if (!left) { stopTimer(); V.on = false; const s = S(); s.best = s.best || {}; const rec = V.score > (s.best.vision || 0); if (rec) s.best.vision = V.score; A.tick(); K.save(); A.sound('end'); $('#tFb').innerHTML = `<div class="score"><b>${V.score}</b><span>squares${rec ? ' · new best!' : ` · best ${s.best.vision}`}</span></div><div class="row" style="margin-top:12px"><button class="btn" id="visAgain">Go again</button></div>`; $('#visAgain').onclick = visGo; tb.set(tb.fen, {}); } }, 200);
}

A.views.train = { enter() { renderHub(); }, leave() { stopTimer(); }, refresh() { renderHub(); } };
}
