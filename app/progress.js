/* NextMove — Progress */
{
const { esc, $ } = K; const { S } = A;
function render() {
  const s = S(); s.best = s.best || {};
  const hist = s.puz.hist; const solved = hist.filter(h => h.ok).length;
  const revs = s.reviews.filter(r => r.me); const accs = revs.map(r => r.me === 'w' ? r.accW : r.accB).filter(x => x != null);
  const last10 = accs.slice(-10); const avg = last10.length ? Math.round(last10.reduce((a, b) => a + b, 0) / last10.length) : null;
  $('#stats').innerHTML = [
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
  $('#syncNote').textContent = K.syncState() === 'synced' ? 'Synced across your devices.' : 'Saved in this browser.';
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
