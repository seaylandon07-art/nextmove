/* NextMove — Progress */
{
const { esc, $ } = K; const { S } = A;
function render() {
  const s = S(); s.best = s.best || {};
  const hist = s.puz.hist; const solved = hist.filter(h => h.ok).length;
  const revs = s.reviews.filter(r => r.me); const accs = revs.map(r => r.me === 'w' ? r.accW : r.accB).filter(x => x != null).map(A.ccAcc);
  const last10 = accs.slice(-10); const avg = last10.length ? Math.round(last10.reduce((a, b) => a + b, 0) / last10.length) : null;
  $('#stats').innerHTML = [
    ['Play rating', s.elo ? s.elo.r : '–', s.elo ? `${s.elo.n} rated game${s.elo.n === 1 ? '' : 's'} vs bots` : 'finish a game vs a bot'],
    ['Puzzle rating', Math.round(s.puz.r), hist.length ? `${solved} of ${hist.length} first try` : 'no puzzles yet'],
    ['Accuracy', avg ?? '–', last10.length ? `average, last ${last10.length} game${last10.length === 1 ? '' : 's'}` : 'review a game with your side set'],
    ['Drills mastered', `${s.drills.filter(d => d.box >= 4).length}/${s.drills.length}`, `${A.due().length} due now`],
    ['Streak', `${A.streak()}d`, `best rush ${s.best.rush || 0} · streak ${s.best.streak || 0}`]
  ].map(([a, b, c]) => `<div class="stat"><small>${a}</small><b>${esc(b)}</b><span>${esc(c)}</span></div>`).join('');
  line($('#rchart'), hist.map(h => h.r), 'Puzzle rating');
  line($('#achart'), accs, 'Accuracy');
  // activity calendar: as many weeks as fit the card (max a year)
  const cw = $('#cal').clientWidth || 300; const weeks = Math.max(12, Math.min(53, Math.floor((cw + 3) / 15)));
  const days = s.days || {}; const end = new Date(); const cells = []; const start = new Date(end); start.setDate(start.getDate() - (7 * weeks - 1) - end.getDay());
  let active = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const k = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); const n = days[k] || 0; if (n) active++; cells.push(`<i class="${n >= A.GOAL ? 'l3' : n >= 5 ? 'l2' : n ? 'l1' : ''}" title="${k}: ${n} reps"></i>`); }
  $('#cal').innerHTML = cells.join(''); $('#calNote').textContent = `${active} active day${active === 1 ? '' : 's'} · goal ${A.GOAL} reps`;
  const ph = { op: 0, mid: 0, end: 0 }, nph = { op: 0, mid: 0, end: 0 };
  revs.forEach(r => { for (const k in ph) { ph[k] += r.phase[k] || 0; nph[k] += (r.nPhase && r.nPhase[k]) || 0; } });
  const rate = k => nph[k] ? ph[k] / nph[k] * 100 : 0; const mx = Math.max(1, ...['op', 'mid', 'end'].map(rate));
  $('#phases').innerHTML = [['op', 'Opening'], ['mid', 'Middlegame'], ['end', 'Endgame']].map(([k, n]) => `<div class="hb"><span>${n}</span><div><i style="width:${rate(k) / mx * 100}%"></i></div><b>${nph[k] ? rate(k).toFixed(1) + '%' : '–'}</b></div>`).join('') + `<p class="small mute">Share of your moves that were a mistake, miss or blunder${revs.length ? `, across ${revs.length} game${revs.length === 1 ? '' : 's'}` : ' (needs reviewed games)'}.</p>`;
  const boxes = [0, 0, 0, 0, 0, 0]; s.drills.forEach(d => boxes[d.box]++);
  $('#boxes').innerHTML = boxes.map((n, i) => `<div class="hb"><span>${['New / missed', '1 day', '3 days', '1 week', '16 days', 'Mastered'][i]}</span><div><i style="width:${n / Math.max(1, ...boxes) * 100}%"></i></div><b>${n}</b></div>`).join('');
  renderWeek();
  $('#syncNote').textContent = K.syncState() === 'synced' ? 'Synced across your devices.' : 'Saved in this browser.';
}
/* ---------- weekly report: the last 7 days against the 7 before ---------- */
function renderWeek() {
  const s = S(); const now = Date.now(), W = 7 * A.DAY;
  const day = t => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const from = day(now - W + A.DAY), prevFrom = day(now - 2 * W + A.DAY);
  const inW = d => d >= from, inP = d => d >= prevFrom && d < from;
  const won = g => g.me && ((g.result === '1-0' && g.me === 'w') || (g.result === '0-1' && g.me === 'b'));
  const games = s.games.filter(g => g.result && g.result !== '*' && inW(g.date || ''));
  const W_ = games.filter(won).length, D_ = games.filter(g => g.result === '1/2-1/2').length, L_ = games.length - W_ - D_;
  const acc = list => { const a = list.filter(r => r.me).map(r => A.ccAcc(r.me === 'w' ? r.accW : r.accB)).filter(x => x != null); return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null; };
  const accW = acc(s.reviews.filter(r => inW(r.date || ''))), accP = acc(s.reviews.filter(r => inP(r.date || '')));
  const ph = s.puz.hist.filter(h => h.t > now - W); const before = s.puz.hist.filter(h => h.t <= now - W).slice(-1)[0];
  const pd = ph.length ? ph[ph.length - 1].r - (before ? before.r : 1000) : 0;
  const eh = (s.elo && s.elo.hist) || []; const ew = eh.filter(h => h.t > now - W); const eb = eh.filter(h => h.t <= now - W).slice(-1)[0];
  const ed = ew.length ? ew[ew.length - 1].r - (eb ? eb.r : 1000) : 0;
  const xpW = Object.entries((s.xp && s.xp.days) || {}).filter(([d]) => inW(d)).reduce((a, [, n]) => a + n, 0);
  const active = Object.entries(s.days || {}).filter(([d, n]) => inW(d) && n).length;
  const found = s.drills.filter(d => d.created > now - W).length;
  const sign = n => n > 0 ? `<span class="up">+${n}</span>` : n < 0 ? `<span class="dn">${n}</span>` : '';
  const cell = (a, b, c) => `<div><small>${a}</small><b>${b}</b><span>${c}</span></div>`;
  $('#week').innerHTML = [
    cell('Games', games.length, games.length ? `${W_} won · ${D_} drawn · ${L_} lost` : 'none this week'),
    cell('Accuracy', accW ?? '–', accW == null ? 'review a game to see it' : accP == null ? 'average this week' : `${accW >= accP ? '<span class="up">' : '<span class="dn">'}${accW >= accP ? '+' : ''}${accW - accP}</span> vs last week`),
    cell('Play rating', s.elo ? s.elo.r : '–', ew.length ? `${sign(ed) || 'no change'} this week` : 'no rated games'),
    cell('Puzzles', ph.length, ph.length ? `${ph.filter(h => h.ok).length} first try · ${sign(Math.round(pd)) || 'rating flat'}` : 'none this week'),
    cell('New drills', found, found ? 'mistakes caught from your games' : 'no new mistakes found'),
    cell('XP earned', xpW.toLocaleString(), `${active} of 7 days active`)
  ].join('');
  $('#weekNote').textContent = `${new Date(now - W + A.DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to today`;
  // one concrete thing to do next
  const revs = s.reviews.filter(r => r.me && inW(r.date || '')); const ph3 = { op: 0, mid: 0, end: 0 }, n3 = { op: 0, mid: 0, end: 0 };
  revs.forEach(r => { for (const k in ph3) { ph3[k] += (r.phase || {})[k] || 0; n3[k] += (r.nPhase || {})[k] || 0; } });
  const worst = ['op', 'mid', 'end'].filter(k => n3[k] >= 8).sort((a, b) => ph3[b] / n3[b] - ph3[a] / n3[a])[0];
  const due = A.due().length, mine = (s.mypuz || []).filter(p => !p.solved).length;
  const tip = due >= 5 ? `You have ${due} mistake drills due. Clearing them is the fastest way to stop repeating the same errors.`
    : worst === 'op' ? 'Most of your mistakes this week came in the opening. Pick one opening course in Train and drill it until it’s clean.'
    : worst === 'end' ? 'Your endgames cost you the most this week. Try the endgame lessons in Train, then the “Convert your wins” positions.'
    : worst === 'mid' ? `The middlegame is where your games were decided this week. ${mine ? `Start with your ${mine} unsolved game puzzles,` : 'Do 10 rated puzzles a day,'} so you spot the shots your opponents leave.`
    : !games.length ? 'No games yet this week. Play one against a bot near your rating and the review will tell you exactly what to work on.'
    : accW != null && accP != null && accW > accP ? 'Your accuracy went up this week. Keep the same routine: a game, its review, then your drills.'
    : 'Review your games with your side set so the drills and this report can learn from them.';
  $('#weekFocus').textContent = tip;
}
function line(svg, vals, label) {
  const W = svg.clientWidth, H = svg.clientHeight; if (!W) return;
  if (vals.length < 2) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="gt">Not enough data yet</text>`; return; }
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * .15 || 10, a = lo - pad, b = hi + pad;
  const L = 40, Rr = 8, Tp = 10, B = 10;
  const x = i => L + i / (vals.length - 1) * (W - L - Rr), y = v => Tp + (1 - (v - a) / (b - a)) * (H - Tp - B);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi].map(v => Math.round(v));
  svg.innerHTML = ticks.map(t => `<line x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}" class="gg"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="gt">${t}</text>`).join('') + `<path d="${d}" class="gl"/><circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3.5" class="gd"/>`;
}
const ro = new ResizeObserver(() => { if (A.cur() === 'progress') render(); }); ro.observe($('#rchart'));
A.views.progress = { enter: render, refresh() { if (A.cur() === 'progress') render(); } };
}
