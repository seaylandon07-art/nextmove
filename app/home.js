/* NextMove — Home: a living front door. The Opera Game plays itself, your day at a glance,
   training, the daily puzzle and one-tap games. */
{
const { esc, $ } = K; const { S } = A;
const OPERA = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');
const CAP = {
  5: 'Black pins the knight, an old-fashioned choice that hands Morphy time.',
  12: 'The queen hits b7 and f7 at the same time.',
  18: 'A knight sacrifice to rip the queenside open.',
  20: 'Every white piece joins in while Black’s are still at home.',
  22: 'Castles with a rook already aimed down the d-file.',
  24: 'Another sacrifice: the rook gives itself up to keep the attack rolling.',
  28: 'The bishop removes a defender, with check.',
  30: 'The queen sacrifice. The knight has to take it.',
  32: 'Checkmate with the last two pieces. Development beats material.'
};
const H = { b: null, ply: 0, t: null, uci: [] };
(() => { const c = new Chess(); H.uci = OPERA.map(s => K.uciOf(c.move(s))); })();
const hb = A.board($('#heroBd'), { movable: () => null });
H.b = hb;
$('#heroBd').title = 'Open this game in Analysis';
$('#heroBd').addEventListener('click', () => A.openAnalysis && A.openAnalysis(K.START, H.uci, Math.max(1, H.ply)));
function heroStep() {
  if (A.cur() !== 'home') return;
  if (H.ply >= H.uci.length) {   // pause on the final position, then start again
    H.t = setTimeout(() => { H.ply = 0; hb.set(K.START); $('#heroMove').textContent = 'Morphy vs Duke Karl & Count Isouard, Paris 1858'; $('#heroCap').textContent = 'The Opera Game, played in a box at the Paris opera.'; H.t = setTimeout(heroStep, 1800); }, 5000);
    return;
  }
  const c = new Chess(); for (let i = 0; i < H.ply; i++) K.mv(c, H.uci[i]);
  const before = c.fen(); const u = H.uci[H.ply]; const m = K.mv(c, u);
  hb.set(c.fen(), { last: u, anim: true });
  const n = Math.floor(H.ply / 2) + 1;
  $('#heroMove').textContent = `${n}${H.ply % 2 ? '…' : '.'} ${m.san}`;
  const cap = $('#heroCap'); cap.style.opacity = 0; const p = H.ply;
  setTimeout(() => { cap.textContent = CAP[p] || `${p % 2 ? 'Black' : 'White'}: ${K.moveName(before, u)}.`; cap.style.opacity = 1; }, 150);
  H.ply++;
  H.t = setTimeout(heroStep, CAP[H.ply - 1] ? 2600 : 1500);
}

/* ---------- today ---------- */
function countUp(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-n]').forEach(el => {
    const to = +el.dataset.n; if (!isFinite(to) || to <= 0) return; const t0 = performance.now(), d = 700;
    const f = t => { const k = Math.min(1, (t - t0) / d); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
}
function renderToday() {
  const s = S(); const nm = (s.name || '').split(',')[0].trim();
  const returning = s.games.length || s.puz.hist.length || s.drills.length;
  $('#hWelcome').textContent = returning ? `Welcome back${nm ? ', ' + nm : ''}` : 'Chess training built around your own games';
  const cards = [];
  if (A.playLive && A.playLive()) {
    const P = A.P; const opp = P.mode === 'bot' ? A.BOTS[P.bot].n : 'your friend';
    cards.push(`<a class="tcard hot" href="#play"><span class="big">${Math.ceil(P.g.history().length / 2)}</span><span><small>Game in progress</small><b>Continue vs ${esc(opp)}</b></span></a>`);
  }
  if (returning) {
    const done = (s.days || {})[A.today()] || 0, pct = Math.min(1, done / A.GOAL), C = 2 * Math.PI * 22, st = A.streak();
    cards.push(`<button class="tcard" data-train="tactics"><svg viewBox="0 0 52 52" class="ring"><circle cx="26" cy="26" r="22" class="rb"/><circle cx="26" cy="26" r="22" class="rf" style="stroke:var(--acc)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg><span><small>${done >= A.GOAL ? 'Daily goal done' : `${A.GOAL - done} reps to today’s goal`}</small><b>${st ? `${st}-day streak` : 'Start a streak today'}</b></span></button>`);
    const due = A.due().length;
    cards.push(`<button class="tcard${due ? ' hot' : ''}" data-train="drills"><span class="big" data-n="${due}">${due}</span><span><small>Mistake drills</small><b>${due ? 'Due now' : s.drills.length ? 'All caught up' : 'Play a game to fill these'}</b></span></button>`);
    const rv = s.reviews.filter(r => r.me).slice(-1)[0];
    if (rv) { const acc = A.ccAcc(rv.me === 'w' ? rv.accW : rv.accB); cards.push(`<a class="tcard" href="#review"><span class="big" data-n="${acc ?? 0}">${acc ?? '–'}</span><span><small>Last game accuracy</small><b>vs ${esc(rv.me === 'w' ? rv.black : rv.white)}</b></span></a>`); }
    if (s.elo) cards.push(`<a class="tcard" href="#play"><span class="big" data-n="${s.elo.r}">${s.elo.r}</span><span><small>Play rating</small><b>${s.elo.n} game${s.elo.n === 1 ? '' : 's'} vs bots</b></span></a>`);
    const h = s.puz.hist; const wk = h.find(x => x.t > Date.now() - 7 * A.DAY); const dr = wk ? Math.round(s.puz.r - wk.r) : 0;
    cards.push(`<button class="tcard" data-train="tactics"><span class="big" data-n="${Math.round(s.puz.r)}">${Math.round(s.puz.r)}</span><span><small>Puzzle rating</small><b>${dr ? `${dr > 0 ? '+' : ''}${dr} this week` : 'Solve to climb'}</b></span></button>`);
  } else {
    cards.push(`<a class="tcard hot" href="#play"><span class="big">1</span><span><small>Start here</small><b>Play your first game</b></span></a>`);
    cards.push(`<button class="tcard" data-scroll="dp"><span class="big">2</span><span><small>Two minutes</small><b>Solve today’s puzzle</b></span></button>`);
    cards.push(`<button class="tcard" data-train="open"><span class="big">3</span><span><small>Openings</small><b>Learn a real main line</b></span></button>`);
  }
  $('#homeToday').innerHTML = cards.join('');
  countUp($('#homeToday'));
}

/* ---------- training tiles ---------- */
function renderTrain() {
  const s = S(); s.best = s.best || {}; const due = A.due().length;
  const gam = A.GAMB.filter(g => s.op[g.name]).length, crs = A.COURSES.filter(c => s.op[c.name]).length, eg = A.EG.filter(e => (s.eg || {})[e.id || e.title]).length;
  const T = [
    ['drills', 'i-repeat', 'Mistake drills', s.drills.length ? 'The positions you got wrong in your own games, with how the game would have gone.' : 'Play or review a game and your mistakes land here, explained.', s.drills.length ? `${due} due` : '', true],
    ['tactics', 'i-knight', 'Rated puzzles', 'Matched to your rating. Any winning move counts.', Math.round(s.puz.r)],
    ['rush', 'i-bolt', 'Puzzle rush', 'Three minutes, three strikes.', s.best.rush ? `best ${s.best.rush}` : ''],
    ['open', 'i-book', 'Opening courses', 'Main lines up to 20 moves, explained.', `${crs}/${A.COURSES.length}`],
    ['gambits', 'i-swords', 'Gambit lab', 'Sharp gambits and the traps that win games.', `${gam}/${A.GAMB.length}`],
    ['end', 'i-crown', 'Endgames', 'Mates, pawn and rook endings.', A.EG.length ? `${eg}/${A.EG.length}` : ''],
    ['vision', 'i-grid', 'Board vision', 'Name squares fast from either side.', '']
  ];
  const ART = { drills: 'ill-drills', tactics: 'ill-puzzle', rush: 'ill-rush', open: 'ill-open', gambits: 'ill-gambit', end: 'ill-end', vision: 'ill-vision' };
  $('#homeTrain').innerHTML = T.map(([m, ic, t, d, stat, feat]) => `<button class="tile${feat ? ' feature' : ''}" data-train="${m}"><svg class="tart"><use href="#${ART[m]}"/></svg><b>${t}</b><small>${d}</small>${stat !== '' ? `<em>${esc(String(stat))}</em>` : ''}</button>`).join('');
}

/* ---------- daily puzzle ---------- */
const D = { p: null, i: 0, g: null, done: false, busy: false };
const db = A.board($('#dpBd'), { scroll: true, movable: () => D.done || D.busy || !D.g ? null : D.g.turn(), legal: A.legalFor(() => D.g.fen()), onMove: (f, t, pr) => dailyMove(f, t, pr) });
function dpFb(kind, head, sub, extra = '') { $('#dpFb').innerHTML = `<div class="fb ${kind}"><b>${head}</b>${sub ? `<p>${sub}</p>` : ''}${extra}</div>`; }
function setupDaily() {
  if (!A.PUZ.length) return;
  const s = S(); const today = A.today(); s.daily = s.daily || {};
  let p = s.daily.date === today ? A.PUZ.find(x => x.id === s.daily.id) : null;
  if (!p) {
    const r = s.puz.r || 1000; const pool = A.PUZ.filter(x => Math.abs(x.rating - r) < 200); const arr = pool.length ? pool : A.PUZ;
    let h = 0; for (const ch of today) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    p = arr[h % arr.length]; s.daily = { date: today, id: p.id, done: false }; K.save();
  }
  D.p = p; D.i = 0; D.g = new Chess(p.fen); D.done = !!s.daily.done; D.busy = false;
  const me = D.g.turn(); db.orient = me;
  $('#dpMeta').textContent = `Rated ${p.rating}`;
  $('#dpPrompt').textContent = `${me === 'w' ? 'White' : 'Black'} to move. Find the strongest move.`;
  if (D.done) { const c = new Chess(p.fen); p.sol.forEach(u => K.mv(c, u)); db.set(c.fen(), { last: p.sol[p.sol.length - 1] }); dpFb('ok', 'Solved today', 'A new one appears tomorrow.', `<div class="row" style="margin-top:6px"><button class="btn" data-train="tactics">More puzzles</button></div>`); $('#dpTools').innerHTML = ''; return; }
  db.set(p.fen, { last: p.last || null }); $('#dpFb').innerHTML = '';
  $('#dpTools').innerHTML = '<button class="btn sec" id="dpHint">Hint</button>';
  $('#dpHint').onclick = () => { const u = p.sol[D.i]; if (u) db.set(D.g.fen(), { marks: { [u.slice(0, 2)]: 'hint' } }); };
}
function solved(other) {
  const s = S(); s.daily.done = true; A.tick(); K.save(); D.done = true;
  A.sound('good'); A.flash(db.host, 'ok');
  dpFb('ok', other ? 'That wins too. Solved!' : 'Solved!', 'Nice. Keep the streak going with a few more.', `<div class="row" style="margin-top:6px"><button class="btn" data-train="tactics">More puzzles</button></div>`);
  $('#dpTools').innerHTML = ''; renderToday();
}
function dailyMove(f, t, pr) {
  const fen = D.g.fen(); const u = f + t + (pr || ''); const want = D.p.sol[D.i];
  const m = D.g.move({ from: f, to: t, promotion: pr || 'q' }); if (!m) return false;
  A.moveSound(m, D.g);
  if (want && u.slice(0, 4) === want.slice(0, 4)) {
    D.i++; db.set(D.g.fen(), { last: u });
    if (D.i >= D.p.sol.length || D.g.game_over()) { solved(); return true; }
    D.busy = true; dpFb('', 'Good. Keep going.');
    setTimeout(() => { const r = D.p.sol[D.i++]; const mm = K.mv(D.g, r); db.set(D.g.fen(), { last: r, anim: true }); A.moveSound(mm, D.g); D.busy = false; if (D.i >= D.p.sol.length) solved(); }, 550);
    return true;
  }
  // not the book answer: any move that still wins counts
  db.set(D.g.fen(), { last: u }); D.busy = true; dpFb('', 'Checking…');
  K.judge(fen, u, { depth: 14, tol: 4 }).then(j => {
    if (j.ok) { solved(true); return; }
    A.sound('bad'); A.flash(db.host, 'no');
    dpFb('no', 'Not this one', 'Look for checks, captures and threats first. Try again.');
    D.g.undo(); setTimeout(() => { db.set(D.g.fen(), { last: D.i ? D.p.sol[D.i - 1] : D.p.last || null }); D.busy = false; }, 700);
  });
  return true;
}

/* ---------- quick play ---------- */
function renderBots() {
  const me = A.botForMe().i; const pick = [Math.max(0, me - 1), me, Math.min(A.BOTS.length - 1, me + 1), Math.min(A.BOTS.length - 1, me + 2)];
  const uniq = [...new Set(pick)];
  $('#homeBots').innerHTML = uniq.map(i => { const b = A.BOTS[i]; return `<button class="qbot" data-bot="${i}"><span class="av" data-av="${esc(b.n)}" data-icon="${b.icon || ''}"></span><span><b>${esc(b.n)}</b><small>${b.r} · ${i < me ? 'warm-up' : i === me ? 'your level' : 'a challenge'}</small></span></button>`; }).join('');
  $('#homeBots').querySelectorAll('.av').forEach(el => A.avatar(el, el.dataset.av, el.dataset.icon));
}
$('#homeBots').onclick = e => { const b = e.target.closest('[data-bot]'); if (b) A.quickBot(+b.dataset.bot); };
$('#homeFriend').onclick = () => A.playOnline();
document.querySelectorAll('[data-mode-go]').forEach(b => b.onclick = () => A.playMode(b.dataset.modeGo));
document.addEventListener('click', e => {
  const t = e.target.closest('[data-train]'); if (t && A.startTrain) { e.preventDefault(); A.startTrain(t.dataset.train); return; }
  const sc = e.target.closest('[data-scroll]'); if (sc) $('#dpBd').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* ---------- install the app + daily reminder ---------- */
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
A.refreshInstall = () => {
  const s = S(); const card = $('#appCard'); if (!window.NM_WEB) { card.hidden = true; return; }
  const canPrompt = !!window.NM_INSTALL, inApp = standalone();
  card.hidden = !!s.appHide && !canPrompt;
  $('#appInstall').hidden = !canPrompt;
  $('#appTitle').textContent = inApp ? 'Never miss the daily puzzle' : 'Get the app';
  $('#appText').textContent = inApp ? 'Add a daily reminder to your calendar so the puzzle and your drills are waiting for you.' : canPrompt ? 'Install NextMove on your home screen. It opens full screen, works offline and loads instantly.' : isIOS ? 'On iPhone: tap the Share button in Safari, then “Add to Home Screen”. It opens full screen and works offline.' : 'Add NextMove to your home screen from your browser menu. It opens full screen and works offline.';
};
$('#appInstall').onclick = async () => { const p = window.NM_INSTALL; if (!p) return; p.prompt(); const r = await p.userChoice.catch(() => null); window.NM_INSTALL = null; A.refreshInstall(); if (r && r.outcome === 'accepted') A.toast('Installed. Find NextMove on your home screen.'); };
$('#appHide').onclick = () => { S().appHide = true; K.save(); $('#appCard').hidden = true; };
$('#appRemind').onclick = () => {
  // a calendar event that repeats daily at 6 PM local time, linking back to the daily puzzle
  const d = new Date(); d.setHours(18, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1);
  const p2 = n => String(n).padStart(2, '0'); const local = x => `${x.getFullYear()}${p2(x.getMonth() + 1)}${p2(x.getDate())}T${p2(x.getHours())}${p2(x.getMinutes())}00`;
  const end = new Date(d.getTime() + 15 * 60e3);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NextMove//Daily puzzle//EN', 'BEGIN:VEVENT', `UID:nextmove-daily-${Date.now()}@nextmove.gg`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${local(d)}`, `DTEND:${local(end)}`, 'RRULE:FREQ=DAILY', 'SUMMARY:NextMove daily puzzle', 'DESCRIPTION:Today’s puzzle and your mistake drills are waiting: https://nextmove.gg', 'URL:https://nextmove.gg', 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:NextMove daily puzzle', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'nextmove-daily-puzzle.ics'; document.body.appendChild(a); a.click(); a.remove();
  A.toast('Open the file to add a daily 6 PM reminder to your calendar. You can change the time there.');
};
function render() { renderToday(); A.refreshInstall(); renderTrain(); renderBots(); if (!D.p || D.p.id !== (S().daily || {}).id || (S().daily || {}).date !== A.today()) setupDaily(); }
A.views.home = {
  enter() { render(); clearTimeout(H.t); H.t = setTimeout(heroStep, 900); },
  leave() { clearTimeout(H.t); },
  refresh() { if (A.cur() === 'home') { renderToday(); renderTrain(); } }
};
}
