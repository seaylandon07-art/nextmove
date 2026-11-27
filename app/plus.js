/* NextMove Plus — $2.99/month.
   Free stays genuinely useful: every game is still checked in the background, accuracy and game rating are always free,
   and playing (bots, online, friends) is never limited. Plus removes the daily caps and adds depth.
   The paywall only switches on when billing is configured on the server (or with localStorage nm-paywall=1 to preview). */
{
const { esc, $ } = K; const { S } = A;
const FREE = { reviews: 3, puzzles: 25, runs: 3, mine: 5, drillsPerGame: 3, gambits: 4 };
const PLUS_BGS = ['tournament', 'bishop', 'marble', 'sunrise', 'ice'];
let billing = { enabled: false, price: '$2.99', yearly: null, trialDays: 0 }; let period = 'month';
const preview = () => { try { return localStorage.getItem('nm-paywall') === '1'; } catch (e) { return false; } };
A.paywall = () => !!window.NM_WEB && (billing.enabled || preview());
A.plus = () => !A.paywall() || (window.NM_PLAN && window.NM_PLAN() === 'plus');
A.FREE = FREE; A.PLUS_BGS = PLUS_BGS;
function quota() { const s = S(); if (!s.quota || s.quota.day !== A.today()) s.quota = { day: A.today(), rev: [], puz: 0, run: 0, mine: 0 }; return s.quota; }
A.quotaLeft = k => { const q = quota(); return k === 'reviews' ? FREE.reviews - q.rev.length : FREE[k] - q[{ puzzles: 'puz', runs: 'run', mine: 'mine' }[k]]; };

const WHY = {
  review: () => `You’ve used today’s ${FREE.reviews} free full reviews. Your games are still checked in the background, and your accuracy and drills keep coming.`,
  puzzles: () => `That’s today’s ${FREE.puzzles} free rated puzzles. The daily puzzle and your drills are still open.`,
  runs: () => `That’s today’s ${FREE.runs} free Puzzle Rush and Streak runs.`,
  mine: () => `That’s today’s ${FREE.mine} free puzzles from your games.`,
  depth: () => 'Full-length opening lines (up to 20 moves) are part of Plus. Quick and Standard stay free.',
  gambit: () => `The first ${FREE.gambits} gambits are free. Plus opens the whole lab, with every trap.`,
  deep: () => 'Deep review (stronger engine search) is part of Plus.',
  bg: () => 'This background is one of the Plus backgrounds.',
  drills: n => `Plus turns every mistake into a drill. Free keeps the ${FREE.drillsPerGame} biggest from each game${n ? ` (${n} more were found in this one)` : ''}.`,
  menu: () => ''
};
/** Check a limit. Counting kinds consume one use when allowed; returns false (and shows the Plus sheet) when not. */
A.gate = (kind, key) => {
  if (A.plus()) return true;
  const q = quota();
  if (kind === 'review') { if (q.rev.includes(key)) return true; if (q.rev.length < FREE.reviews) { q.rev.push(key); K.save(); return true; } }
  else if (kind === 'puzzles') { if (q.puz < FREE.puzzles) { q.puz++; K.save(); return true; } }
  else if (kind === 'runs') { if (q.run < FREE.runs) { q.run++; K.save(); return true; } }
  else if (kind === 'mine') { if (q.mine < FREE.mine) { q.mine++; K.save(); return true; } }
  A.showPlus(kind, key); return false;
};
A.locked = kind => !A.plus() && ['depth', 'gambit', 'deep', 'bg'].includes(kind);

/* ---------- the Plus sheet ---------- */
const FEATS = [
  ['Play bots, online and friends', 'Unlimited', 'Unlimited'],
  ['Every game checked, accuracy and game rating', 'Always', 'Always'],
  ['Full reviews, every move explained', `${FREE.reviews} a day`, 'Unlimited'],
  ['Mistakes turned into drills', `${FREE.drillsPerGame} per game`, 'Every one'],
  ['Rated puzzles', `${FREE.puzzles} a day`, 'Unlimited'],
  ['Puzzle Rush and Streak', `${FREE.runs} runs a day`, 'Unlimited'],
  ['Puzzles from your own games', `${FREE.mine} a day`, 'Unlimited'],
  ['Opening courses', 'Quick + Standard', 'Full 20-move lines'],
  ['Gambit lab', `${FREE.gambits} lines`, 'Every gambit and trap'],
  ['Deep review engine', '–', 'Included'],
  ['Plus backgrounds, banner and badge', '–', 'Included']
];
function sheet() {
  let el = $('#plusDlg'); if (el) return el;
  el = document.createElement('div'); el.className = 'overlay'; el.id = 'plusDlg'; el.hidden = true;
  el.innerHTML = `<div class="dialog plusdlg" role="dialog" aria-modal="true" aria-labelledby="plusTitle">
    <button class="btn quiet x" data-pclose aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button>
    <div class="phero"><span class="pmark">Plus</span><h2 id="plusTitle">Get better faster with NextMove Plus</h2><p class="pwhy" id="plusWhy"></p></div>
    <table class="ptab"><thead><tr><th></th><th>Free</th><th>Plus</th></tr></thead><tbody>${FEATS.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join('')}</tbody></table>
    <div class="pbuy"><div><div class="seg pper" id="plusPer" hidden><button data-per="month" class="on">Monthly</button><button data-per="year">Yearly · save 30%</button></div><b id="plusPrice"></b><small id="plusSub"></small></div><button class="btn big" id="plusGo"></button></div>
    <p class="small mute pfine" id="plusFine"></p>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-pclose]')) el.hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) el.hidden = true; });
  $('#plusGo').onclick = buy;
  $('#plusPer').onclick = e => { const b = e.target.closest('[data-per]'); if (!b) return; period = b.dataset.per; [...$('#plusPer').children].forEach(x => x.classList.toggle('on', x === b)); A.showPlus(sheet.kind || 'menu'); };
  return el;
}
A.showPlus = (kind = 'menu', n) => {
  const el = sheet(); sheet.kind = kind; const isPlus = window.NM_PLAN && window.NM_PLAN() === 'plus';
  const comp = window.NM_COMP && window.NM_COMP();
  $('#plusWhy').textContent = isPlus && comp ? 'You have Plus free, as one of NextMove’s first members. Everything is unlocked, no payment needed.' : isPlus ? 'You’re on Plus. Thanks for supporting NextMove.' : (WHY[kind] || WHY.menu)(n) || 'Unlimited reviews, puzzles and drills, full opening lines and the Plus look. One small price, cancel anytime.';
  $('#plusPer').hidden = isPlus || !billing.yearly;
  $('#plusPrice').textContent = period === 'year' && billing.yearly ? `${billing.yearly} / year` : `${billing.price} / month`;
  $('#plusSub').textContent = isPlus && comp ? 'Free for you, for good' : isPlus ? 'Active' : billing.trialDays ? `${billing.trialDays}-day free trial, then ${billing.price} a month` : 'Cancel anytime';
  $('#plusGo').hidden = !!(isPlus && comp);
  $('#plusGo').textContent = isPlus ? 'Manage subscription' : !billing.enabled ? 'Coming soon' : (window.NM_USER && window.NM_USER()) ? 'Get Plus' : 'Sign in to get Plus';
  $('#plusGo').disabled = !isPlus && !billing.enabled;
  $('#plusFine').textContent = isPlus ? '' : 'Billed monthly through Stripe. Cancel in one click from Settings and keep Plus until the end of the month you paid for.';
  el.hidden = false; A.track('plus_view');
};
async function buy() {
  const isPlus = window.NM_PLAN && window.NM_PLAN() === 'plus';
  if (!(window.NM_USER && window.NM_USER())) { $('#plusDlg').hidden = true; window.NM_ACCOUNT && window.NM_ACCOUNT(); A.toast('Create a free account first, then tap Get Plus again.'); return; }
  const b = $('#plusGo'); b.disabled = true; const t = b.textContent; b.textContent = 'Opening secure checkout…';
  try { const d = await window.NM_API(isPlus ? '/billing/portal' : '/billing/checkout', { method: 'POST', body: JSON.stringify({ period }) }); location.href = d.url; }
  catch (e) { A.toast(e.message); b.disabled = false; b.textContent = t; }
}

/* ---------- entry points: topbar chip, settings row, badge ---------- */
function render() {
  const on = A.paywall(), isPlus = window.NM_PLAN && window.NM_PLAN() === 'plus';
  const chip = $('#plusChip'); if (!chip) return;
  document.body.classList.toggle('founder', !!(window.NM_FOUNDER && window.NM_FOUNDER()));
  chip.hidden = !on; chip.textContent = isPlus ? 'Plus' : 'Get Plus'; chip.classList.toggle('have', !!isPlus);
  document.body.classList.toggle('isplus', !!(on && isPlus));
  // drop settings that are Plus-only when you're not on Plus
  const u = A.ui(), s = S(); let ch = false;
  if (on && !isPlus) { if (PLUS_BGS.includes(u.bg)) { u.bg = 'midnight'; ch = true; } if ((s.depth || 14) > 14) { s.depth = 14; ch = true; } if (s.opDepth === 'full') { s.opDepth = 'std'; ch = true; } }
  if (ch) { K.save(); A.applyUI && A.applyUI(); }
  const rq = $('#revQuota'); if (rq) rq.textContent = !on || isPlus ? 'Every move explained' : `${Math.max(0, A.quotaLeft('reviews'))} of ${FREE.reviews} free full reviews left today`;
  const row = $('#plusRow'); if (row) { row.hidden = !on; $('#plusRowText').textContent = isPlus && window.NM_COMP && window.NM_COMP() ? 'You have Plus free as an early member.' : isPlus ? 'You’re on Plus. Manage or cancel your subscription.' : `${billing.price} a month. Unlimited reviews, puzzles and drills.`; $('#plusRowBtn').textContent = isPlus && window.NM_COMP && window.NM_COMP() ? 'Details' : isPlus ? 'Manage' : 'See Plus'; }
}
A.renderPlus = render;
// A gentle offer at good moments (a win, a level-up), at most once every 3 days, never in the middle of a game.
A.plusMoment = why => {
  if (!A.paywall() || A.plus()) return; const s = S(); if (Date.now() - (s.plusNudge || 0) < 3 * A.DAY) return; s.plusNudge = Date.now(); K.save();
  let el = $('#plusNudge'); if (!el) { el = document.createElement('div'); el.id = 'plusNudge'; document.body.appendChild(el); }
  el.innerHTML = `<b>${why}</b><span>Plus unlocks unlimited reviews, puzzles and drills for ${billing.price} a month.</span><div class="row" style="gap:8px;margin-top:8px"><button class="btn" data-pn="go">See Plus</button><button class="btn quiet" data-pn="x">Not now</button></div>`;
  el.className = 'show'; el.onclick = e => { const b = e.target.closest('[data-pn]'); if (!b) return; el.className = ''; if (b.dataset.pn === 'go') A.showPlus('menu'); };
  setTimeout(() => el.className = '', 12000);
};
document.addEventListener('click', e => { if (e.target.closest('#plusRowBtn')) A.showPlus('menu'); });
(async () => {
  if (!window.NM_WEB) return;
  try { billing = await (await fetch('/api/billing/config')).json(); } catch (e) { }
  try { await (window.NM_READY && window.NM_READY()); } catch (e) { }
  render();
  if (/[?&]plus=welcome/.test(location.search)) {
    history.replaceState(null, '', location.pathname + location.hash);
    for (let i = 0; i < 6; i++) { const u = window.NM_REFRESH_ME && await window.NM_REFRESH_ME(); if (u && u.plan === 'plus') break; await K.sleep(2000); }
    render(); A.toast(window.NM_PLAN() === 'plus' ? 'Welcome to NextMove Plus. Everything is unlocked.' : 'Payment received. Plus turns on in a moment; refresh if it hasn’t.');
  }
})();
}
