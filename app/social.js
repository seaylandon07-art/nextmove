/* NextMove — friends, public profile link, reporting and blocking. Web build only (needs an account). */
{
const { esc, $ } = K; const { S } = A;
const me = () => window.NM_USER && window.NM_USER();
const api = (p, o) => window.NM_API(p, o);
const ago = t => { if (!t) return 'not active yet'; const m = (Date.now() - t) / 6e4; if (m < 10) return 'active now'; if (m < 60) return `active ${Math.round(m)}m ago`; const h = m / 60; if (h < 24) return `active ${Math.round(h)}h ago`; const d = h / 24; return d < 2 ? 'active yesterday' : `active ${Math.round(d)} days ago`; };
let FR = null;
async function load() { try { FR = (await api('/friends')).friends; } catch (e) { FR = []; } render(); }
function render() {
  const host = $('#friends'); if (!host) return;
  if (!window.NM_WEB) { host.closest('.panel').hidden = true; return; }
  if (!me()) { host.innerHTML = `<p class="small mute">Sign in to add friends, see when they’re active and send them a game.</p><button class="btn sec" onclick="window.NM_ACCOUNT && window.NM_ACCOUNT()">Sign in</button>`; return; }
  if (!FR) { host.innerHTML = '<p class="small mute">Loading…</p>'; load(); return; }
  const order = { incoming: 0, friends: 1, sent: 2 };
  const list = FR.slice().sort((a, b) => order[a.status] - order[b.status] || (b.last || 0) - (a.last || 0));
  host.innerHTML = `<form class="fadd" id="fAdd"><input id="fName" type="text" placeholder="Add a friend by username" autocomplete="off" aria-label="Friend's username"><button class="btn" type="submit">Add</button></form>
    ${list.length ? list.map(f => `<div class="frow"><a class="fav" href="/u/${encodeURIComponent(f.username)}">${esc(f.username[0].toUpperCase())}</a><span><a href="/u/${encodeURIComponent(f.username)}"><b>${esc(f.username)}</b></a><small>${f.status === 'incoming' ? 'wants to be friends' : f.status === 'sent' ? 'request sent' : ago(f.last)}</small></span>
      <span class="row">${f.status === 'incoming' ? `<button class="btn" data-fa="accept" data-u="${esc(f.username)}">Accept</button>` : f.status === 'friends' ? `<button class="btn sec" data-fa="play" data-u="${esc(f.username)}">Play</button>` : ''}<button class="btn quiet" data-fa="remove" data-u="${esc(f.username)}" aria-label="Remove ${esc(f.username)}">${f.status === 'incoming' ? 'Decline' : 'Remove'}</button></span></div>`).join('') : '<p class="small mute" style="margin-top:10px">No friends yet. Add someone by their username, or share your profile link.</p>'}`;
  $('#fAdd').onsubmit = async e => { e.preventDefault(); const n = $('#fName').value.trim(); if (!n) return; try { const r = await api('/friends', { method: 'POST', body: JSON.stringify({ username: n }) }); A.toast(r.status === 'friends' ? `You and ${n} are now friends` : `Friend request sent to ${n}`); load(); } catch (er) { A.toast(er.message); } };
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-fa]'); if (!b) return; const u = b.dataset.u, a = b.dataset.fa;
  try {
    if (a === 'accept') { await api('/friends', { method: 'POST', body: JSON.stringify({ username: u }) }); A.toast(`You and ${u} are now friends`); load(); }
    else if (a === 'remove') { await api('/friends', { method: 'DELETE', body: JSON.stringify({ username: u }) }); load(); }
    else if (a === 'play') { A.playOnline(); setTimeout(() => { const h = $('#hostBtn'); h && h.click(); setTimeout(() => { A.toast(`Game created. Tap “Copy invite link” and send it to ${u}.`); }, 700); }, 300); }
  } catch (er) { A.toast(er.message); }
});
A.renderFriends = render;

/* ---------- profile link + privacy (on the Progress profile card) ---------- */
document.addEventListener('click', e => {
  if (e.target.closest('#profLink')) { const u = me(); if (!u) { window.NM_ACCOUNT && window.NM_ACCOUNT(); return; } const url = `${location.origin}/u/${encodeURIComponent(u)}`; (navigator.share && matchMedia('(pointer: coarse)').matches ? navigator.share({ title: `${u} on NextMove`, url }).catch(() => { }) : navigator.clipboard.writeText(url).then(() => A.toast('Profile link copied'), () => A.toast(url))); }
  if (e.target.closest('#profView')) { const u = me(); if (u) open(`/u/${encodeURIComponent(u)}`, '_blank'); else window.NM_ACCOUNT && window.NM_ACCOUNT(); }
});

/* ---------- report + block (after online games) ---------- */
A.blocked = () => (S().blocked = S().blocked || []);
A.reportPlayer = (username, gid) => {
  let el = $('#repDlg'); if (el) el.remove();
  el = document.createElement('div'); el.className = 'overlay'; el.id = 'repDlg';
  el.innerHTML = `<div class="dialog plusdlg" style="max-width:420px;padding-bottom:20px" role="dialog" aria-modal="true" aria-labelledby="repT"><h2 id="repT" style="margin:0 0 6px;font-size:20px">Report ${esc(username)}</h2><p class="small mute" style="margin:0 0 12px">Reports go to the NextMove team. We review every one.</p>
    <div class="seg" id="repWhy" style="flex-wrap:wrap"><button data-r="cheating" class="on">Cheating</button><button data-r="abuse">Abusive</button><button data-r="stalling">Stalling</button><button data-r="other">Other</button></div>
    <label class="f" style="margin-top:10px">Anything else? (optional)<textarea id="repNote" rows="3" maxlength="500"></textarea></label>
    <label class="chk" style="margin-top:8px"><input type="checkbox" id="repBlock" checked> Also block ${esc(username)} (you won’t be paired with them)</label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn quiet" data-rc>Cancel</button><button class="btn" id="repGo">Send report</button></div></div>`;
  document.body.appendChild(el);
  let why = 'cheating'; $('#repWhy').onclick = ev => { const b = ev.target.closest('[data-r]'); if (!b) return; why = b.dataset.r; [...$('#repWhy').children].forEach(x => x.classList.toggle('on', x === b)); };
  el.addEventListener('click', ev => { if (ev.target === el || ev.target.closest('[data-rc]')) el.remove(); });
  $('#repGo').onclick = async () => {
    const name = username.replace(/ \(\d+\)$/, '');
    if ($('#repBlock').checked && !A.blocked().includes(name)) { A.blocked().push(name); K.save(); }
    if (!me()) { el.remove(); A.toast('Blocked. Sign in to send reports.'); return; }
    try { await api('/report', { method: 'POST', body: JSON.stringify({ username: name, reason: why, note: $('#repNote').value, gid }) }); el.remove(); A.toast('Thanks. Your report was sent.'); } catch (er) { A.toast(er.message); }
  };
};
}
