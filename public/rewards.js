/* NextMove — XP, levels, titles, awards and profile banners.
   XP comes from the same actions the site already counts (A.track), so every game, review,
   puzzle, drill and opening line moves you forward. Everything lives in your saved state. */
{
const { esc, $ } = K; const { S } = A;
const XP = { game_bot: 30, game_online: 40, game_local: 10, review: 20, puzzle: 8, drill: 12, course: 25, import: 10, share: 15, install: 50 };
const need = L => 100 + (L - 1) * 50;   // XP from level L to L+1
function lvl(t) { let L = 1, base = 0; while (t >= base + need(L)) { base += need(L); L++; } return { L, into: t - base, need: need(L) }; }
const TITLES = [[1, 'Pawn', 'p'], [5, 'Knight', 'n'], [10, 'Bishop', 'b'], [15, 'Rook', 'r'], [22, 'Queen', 'q'], [30, 'King', 'k'], [40, 'Grandmaster', 'k']];
const titleOf = L => TITLES.filter(t => L >= t[0]).pop();
const TIER = ['', '#d39a6a', '#cfd7ec', '#f1cf86'];   // bronze, silver, gold

const fin = s => s.games.filter(g => g.result && g.result !== '*');
const won = g => g.me && ((g.result === '1-0' && g.me === 'w') || (g.result === '0-1' && g.me === 'b'));
const botName = id => (A.BOTS.find(b => b.id === id) || {}).n;
const beat = id => s => fin(s).some(g => won(g) && (g.bot === id || (g.src === 'bot' && !g.bot && [g.white, g.black].some(n => (n || '').startsWith(botName(id) + ' (')))));
const myAcc = r => A.ccAcc(r.me === 'w' ? r.accW : r.accB);
const accOver = n => s => s.reviews.some(r => r.me && (myAcc(r) || 0) >= n);
const puzMax = s => Math.max(s.puz.r || 0, ...s.puz.hist.map(h => h.r || 0));
const mastered = s => s.drills.filter(d => d.box >= 4).length;
const did = k => s => ((s.xp.k || {})[k] || 0) >= 1;
const AWARDS = [
  ['first_game', 'First game', 'Finish a game', 'p', 1, s => fin(s).length >= 1],
  ['first_win', 'First win', 'Win a game', 'n', 1, s => fin(s).some(won)],
  ['games_10', 'Regular', 'Finish 10 games', 'b', 1, s => fin(s).length >= 10],
  ['games_50', 'Committed', 'Finish 50 games', 'r', 2, s => fin(s).length >= 50],
  ['games_100', 'Centurion', 'Finish 100 games', 'q', 3, s => fin(s).length >= 100],
  ['beat_theo', 'Beat Theo', 'Win against Theo (850)', 'n', 1, beat('theo')],
  ['beat_nora', 'Beat Nora', 'Win against Nora (1050)', 'b', 1, beat('nora')],
  ['beat_victor', 'Beat Victor', 'Win against Victor (1350)', 'r', 2, beat('victor')],
  ['beat_iris', 'Beat Iris', 'Win against Iris (1550)', 'q', 2, beat('iris')],
  ['beat_dmitri', 'Beat Dmitri', 'Win against Dmitri (1800)', 'q', 3, beat('dmitri')],
  ['beat_sofia', 'Beat Sofia', 'Win against Sofia (2100)', 'k', 3, beat('sofia')],
  ['beat_sf', 'Stockfish slayer', 'Beat full-strength Stockfish', 'k', 3, beat('sf')],
  ['acc_80', 'Clean game', 'Score 80+ accuracy in a reviewed game', 'b', 1, accOver(80)],
  ['acc_90', 'Sharp', 'Score 90+ accuracy in a reviewed game', 'q', 2, accOver(90)],
  ['review_1', 'Self-aware', 'Review one of your games', 'p', 1, s => s.reviews.length >= 1],
  ['review_25', 'Student of the game', 'Review 25 games', 'r', 2, s => s.reviews.length >= 25],
  ['puz_50', 'Puzzler', 'Try 50 puzzles', 'n', 1, s => s.puz.hist.length >= 50],
  ['puz_250', 'Tactician', 'Try 250 puzzles', 'q', 2, s => s.puz.hist.length >= 250],
  ['puz_1200', '1200 club', 'Reach a 1200 puzzle rating', 'b', 1, s => puzMax(s) >= 1200],
  ['puz_1500', '1500 club', 'Reach a 1500 puzzle rating', 'r', 2, s => puzMax(s) >= 1500],
  ['puz_1800', '1800 club', 'Reach an 1800 puzzle rating', 'k', 3, s => puzMax(s) >= 1800],
  ['rush_20', 'Rush hour', 'Score 20 in Puzzle Rush', 'n', 2, s => ((s.best || {}).rush || 0) >= 20],
  ['drill_10', 'Fixed it', 'Master 10 mistake drills', 'b', 1, s => mastered(s) >= 10],
  ['drill_50', 'Never again', 'Master 50 mistake drills', 'q', 3, s => mastered(s) >= 50],
  ['course_1', 'Booked up', 'Finish an opening line', 'p', 1, s => Object.keys(s.op || {}).length >= 1],
  ['course_10', 'Repertoire', 'Finish 10 opening lines', 'r', 2, s => Object.keys(s.op || {}).length >= 10],
  ['streak_7', 'Week streak', 'Train 7 days in a row', 'n', 2, s => (s.xp.bestDays || 0) >= 7],
  ['streak_30', 'Month streak', 'Train 30 days in a row', 'k', 3, s => (s.xp.bestDays || 0) >= 30],
  ['share', 'Show-off', 'Share a game or review', 'p', 1, did('share')],
  ['import', 'Moving in', 'Import your games from chess.com or Lichess', 'n', 1, did('import')],
  ['install', 'Home screen', 'Install the NextMove app', 'b', 1, did('install')],
  ['founder', 'Founder', 'One of the first 500 NextMove Plus members', 'k', 3, () => !!(window.NM_FOUNDER && window.NM_FOUNDER())]
].map(([id, n, d, p, tier, t]) => ({ id, n, d, p, tier, t }));
const BANNERS = [
  ['midnight', 'Midnight', 'linear-gradient(135deg,#1a2350,#0a0e1c 70%)', 1],
  ['board', 'Checkered', 'repeating-conic-gradient(#1c2550 0 25%,#121937 0 50%) 0 0/44px 44px', 3],
  ['gold', 'Gold set', "url('bg/gold.jpg') center/cover", 5],
  ['marble', 'Marble', "url('bg/marble.jpg') center/cover", 8],
  ['royal', 'Royal', "url('bg/royal.jpg') center/cover", 12],
  ['tournament', 'Tournament hall', "url('bg/tournament.jpg') center/cover", 16],
  ['neon', 'Neon', "url('bg/neon.svg') center/cover", 20],
  ['bishop', 'Cathedral', "url('bg/bishop.jpg') center/cover", 25],
  ['arena', 'Arena', "url('bg/arena.jpg') center/cover", 30],
  ['sunrise', 'Sunrise', "url('bg/sunrise.jpg') center/cover", 0, 'puz_250'],
  ['ice', 'Ice', "url('bg/ice.jpg') center/cover", 0, 'streak_30'],
  ['checkmate', 'Checkmate', "url('bg/checkmate.jpg') center/cover", 0, 'games_100'],
  ['plusgold', 'Plus gold', 'radial-gradient(120% 140% at 85% 0%,#f6dc9e 0%,#c8923e 28%,#3a2a12 62%,#120d06 100%)', 0, 'plus'],
  ['plusice', 'Plus ice', "url('bg/ice.jpg') center/cover", 0, 'plus'],
  ['founder', 'Founder', 'linear-gradient(120deg,#0a0e1c 0%,#2a1f0a 40%,#f1cf86 50%,#2a1f0a 60%,#0a0e1c 100%)', 0, 'founder']
].map(([id, n, css, lv, aw]) => ({ id, n, css, lv, aw }));

const MAX_XP = 40950;   // level 40: Grandmaster, the top title
const isAdmin = () => !!(window.NM_ADMIN && window.NM_ADMIN());
function ensure(s = S()) {
  if (s.xp && s.xp.k) { if (isAdmin() && s.xp.t < MAX_XP) { s.xp.t = MAX_XP; K.save(); } return s; }
  // first run: credit what you've already done, and grant earned awards quietly
  const k = {}; const t = fin(s).length * 30 + fin(s).filter(won).length * 15 + s.reviews.length * 20 + s.puz.hist.length * 8 + mastered(s) * 12 + Object.keys(s.op || {}).length * 25;
  s.xp = { t, k, bestDays: A.streak() }; s.awards = s.awards || {};
  for (const a of AWARDS) if (!s.awards[a.id] && a.t(s)) s.awards[a.id] = A.today();
  return s;
}
const unlocked = (s, b) => isAdmin() ? true : b.aw === 'plus' ? !!(A.paywall && A.paywall() && A.plus()) : b.aw ? !!s.awards[b.aw] : lvl(s.xp.t).L >= b.lv;
function pop(text, big) {
  let el = $('#xpPop'); if (!el) { el = document.createElement('div'); el.id = 'xpPop'; document.body.appendChild(el); }
  el.textContent = text; el.className = big ? 'big' : ''; void el.offsetWidth; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), big ? 3200 : 1400);
}
let queue = [];
function addXP(n, k) {
  const s = ensure(); const before = lvl(s.xp.t).L;
  s.xp.t += n; if (k) s.xp.k[k] = (s.xp.k[k] || 0) + 1;
  const dd = s.xp.days = s.xp.days || {}; dd[A.today()] = (dd[A.today()] || 0) + n; for (const d of Object.keys(dd).sort().slice(0, -60)) delete dd[d];
  s.xp.bestDays = Math.max(s.xp.bestDays || 0, A.streak());
  const fresh = AWARDS.filter(a => !s.awards[a.id] && a.t(s));
  for (const a of fresh) { s.awards[a.id] = A.today(); s.xp.t += 25 * a.tier; }
  const after = lvl(s.xp.t).L; K.save();
  const msgs = fresh.map(a => `Award unlocked: ${a.n}`);
  if (after > before) { const t = titleOf(after), nb = BANNERS.filter(b => !b.aw && b.lv > lvl(0).L && b.lv > before && b.lv <= after);
    msgs.unshift(`Level ${after}${t[0] === after ? ` · you’re now a ${t[1]}` : ''}${nb.length ? ` · new banner: ${nb.map(b => b.n).join(', ')}` : ''}`); }
  if (after > before) setTimeout(() => A.plusMoment && A.plusMoment(`Level ${after}. You’re improving.`), 7000);
  if (msgs.length) { queue.push(...msgs); if (queue.length === msgs.length) drain(); } else pop(`+${n} XP`);
  if (A.views.progress) A.views.progress.refresh();
}
function drain() { if (!queue.length) return; pop(queue[0], true); A.sound && A.sound('good'); A.confetti && A.confetti(60); setTimeout(() => { queue.shift(); drain(); }, 3400); }
A.addXP = addXP;
const tr = A.track; A.track = k => { tr(k); if (XP[k]) addXP(XP[k], k); };

/* ---------- profile card + awards (Progress page) ---------- */
A.profile = () => {
  const s = ensure(); const l = lvl(s.xp.t), t = titleOf(l.L), next = TITLES.find(x => x[0] > l.L);
  const ban = BANNERS.find(b => b.id === s.banner && unlocked(s, b)) || BANNERS[0];
  const nm = (s.name || '').split(',')[0].trim() || (window.NM_USER && window.NM_USER()) || 'You';
  const got = AWARDS.filter(a => s.awards[a.id]);
  const owned = BANNERS.filter(b => unlocked(s, b)).map(b => b.id); if (String(owned) !== String(s.bannersOwned || '')) { s.bannersOwned = owned; K.save(); }   // shown on your public profile
  return { s, l, t, next, ban, nm, got };
};
function render() {
  const host = $('#profile'); if (!host) return;
  const { s, l, t, next, ban, nm, got } = A.profile();
  host.innerHTML = `<div class="pcard" style="--ban:${ban.css.replace(/"/g, '&quot;')}">
      <div class="pban"></div>
      <div class="pmain">
        <div class="pav"><img src="${K.PIECE['w' + t[2]]}" alt=""><em>${l.L}</em></div>
        <div class="pwho"><b>${esc(nm)}${A.paywall && A.paywall() && A.plus() ? '<span class="pbadge">Plus</span>' : ''}</b><span>${t[1]} · level ${l.L}${next ? ` · ${next[1]} at level ${next[0]}` : ''}</span>
          <div class="xpbar"><i style="width:${(l.into / l.need * 100).toFixed(1)}%"></i></div><small>${l.into} / ${l.need} XP to level ${l.L + 1} · ${s.xp.t.toLocaleString()} XP total</small></div>
        <div class="pnums"><div><b>${s.elo ? s.elo.r : '–'}</b><small>Play</small></div><div><b>${Math.round(s.puz.r)}</b><small>Puzzles</small></div><div><b>${got.length}/${AWARDS.length}</b><small>Awards</small></div></div>
      </div>
      <div class="pacts">${window.NM_WEB ? '<button class="btn sec" id="profLink" type="button">Share profile</button>' : ''}<button class="btn sec" id="banBtn">Change banner</button></div>
      <div class="banpick" id="banPick" hidden>${BANNERS.filter(b => !['plus', 'founder'].includes(b.aw) || (A.paywall && A.paywall())).map(b => { const u = unlocked(s, b); return `<button class="bano${b.id === ban.id ? ' on' : ''}" data-ban="${b.id}" ${u ? '' : 'disabled'}><i style="background:${b.css.replace(/"/g, '&quot;')}"></i><span>${b.n}</span><small>${u ? (b.id === ban.id ? 'In use' : 'Unlocked') : b.aw === 'plus' ? 'NextMove Plus' : b.aw ? 'Award: ' + AWARDS.find(a => a.id === b.aw).n : 'Level ' + b.lv}</small></button>`; }).join('')}</div>
    </div>`;
  $('#awards').innerHTML = AWARDS.filter(a => a.id !== 'founder' || (A.paywall && A.paywall())).map(a => { const d = s.awards[a.id]; return `<div class="aw${d ? ' got' : ''}" style="--tc:${TIER[a.tier]}" title="${esc(a.d)}${d ? ' · earned ' + d : ''}"><span class="awi"><img src="${K.PIECE[(d ? 'w' : 'b') + a.p]}" alt=""></span><b>${esc(a.n)}</b><small>${esc(a.d)}</small></div>`; }).join('');
  $('#awNote').textContent = `${got.length} of ${AWARDS.length} earned`;
}
document.addEventListener('click', e => {
  if (e.target.closest('#banBtn')) { $('#banPick').hidden = !$('#banPick').hidden; return; }
  const b = e.target.closest('[data-ban]'); if (b && !b.disabled) { S().banner = b.dataset.ban; K.save(); render(); $('#banPick').hidden = false; }
});
const pv = A.views.progress; const pe = pv.enter, pr = pv.refresh;
pv.enter = () => { pe(); render(); A.renderFriends && A.renderFriends(); }; pv.refresh = () => { pr(); if (A.cur() === 'progress') render(); };
A.levelInfo = () => { const s = ensure(); const l = lvl(s.xp.t); return { ...l, title: titleOf(l.L)[1], total: s.xp.t }; };
}
