/* NextMove web build: accounts, cloud save and online rooms through the site's own API.
   Provides the same small interface the app uses inside Claude (claude.use('db' | 'user' | 'room')). */
(() => {
  const TOKEN_KEY = 'nm-token';
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { }
  let user = null;

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = res.status; throw e; }
    return data;
  }
  function setToken(t) { token = t; try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { } }
  async function loadMe() {
    if (!token) return null;
    try { user = (await api('/me')).user; }
    catch (e) { if (e.status === 401) setToken(null); user = null; }
    return user;
  }
  let ready = loadMe();

  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => { const d = await api('/state'); return d.json ? { json: d.json } : null; },
        set: async v => { let t = Date.now(); try { t = JSON.parse(v.json).t || t; } catch (e) { } return api('/state', { method: 'PUT', body: JSON.stringify({ json: v.json, t }) }); }
      })
    })
  };
  const userApi = { id: async () => { await ready; return user ? user.id : null; } };

  // Online game room over WebSocket, reconnecting on drops.
  const room = {
    join(name) {
      let ws = null, onPeers = null, closed = false, presence = null; const subs = {}; const queue = [];
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + encodeURIComponent(name);
      const open = () => {
        ws = new WebSocket(url);
        ws.onopen = () => { if (presence) ws.send(JSON.stringify({ t: 'presence', p: presence })); queue.splice(0).forEach(m => ws.send(m)); };
        ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } if (m.t === 'peers' && onPeers) onPeers(m.peers); if (m.t === 'emit' && subs[m.topic]) subs[m.topic](m.data); };
        ws.onclose = () => { if (!closed) setTimeout(open, 1500); };
      };
      open();
      const ping = setInterval(() => { if (ws && ws.readyState === 1) ws.send('{"t":"ping"}'); }, 25000);
      return {
        presence(p) { presence = p; if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'presence', p })); },
        onPeers(f) { onPeers = f; },
        emit(topic, data) { const s = JSON.stringify({ t: 'emit', topic, data }); if (ws.readyState === 1) ws.send(s); else queue.push(s); },
        on(topic, f) { subs[topic] = f; },
        leave() { closed = true; clearInterval(ping); try { ws.close(); } catch (e) { } }
      };
    }
  };

  window.claude = {
    use: async name => {
      if (name === 'db') { await ready; return user ? db : null; }
      if (name === 'user') return userApi;
      if (name === 'room') return room;
      return null;
    }
  };

  /* ---------- account dialog ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function dialogHTML() {
    if (user) return `<div class="ph"><h2>Account</h2><button class="btn quiet sp" data-close-acct aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>
      <section><p>Signed in as <b>${esc(user.username)}</b>.</p><p class="small mute" style="margin-top:6px">Your games, drills and ratings sync to every device you sign in on.</p></section>
      <section class="row"><button class="btn sec" id="acctOut">Sign out</button></section>`;
    return `<div class="ph"><h2 id="acctTitle">Sign in</h2><button class="btn quiet sp" data-close-acct aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>
      <section><p class="small mute">Sign in to keep your progress on every device and play friends online. Without an account, progress stays in this browser.</p></section>
      <section><form id="acctForm" style="display:flex;flex-direction:column;gap:10px">
        <label class="f">Username<input type="text" id="acctUser" autocomplete="username" maxlength="20" required></label>
        <label class="f">Password<input type="password" id="acctPass" autocomplete="current-password" minlength="8" required></label>
        <p class="small" id="acctErr" style="color:var(--no)" hidden></p>
        <div class="row"><button class="btn" type="submit" id="acctGo">Sign in</button><button class="btn quiet" type="button" id="acctSwap">Create an account instead</button></div>
      </form></section>`;
  }
  let mode = 'login';
  function openDialog() {
    let el = document.getElementById('account');
    if (!el) { el = document.createElement('div'); el.className = 'overlay'; el.id = 'account'; el.innerHTML = '<div class="sheetdlg" role="dialog" aria-label="Account"></div>'; document.body.appendChild(el); el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close-acct]')) el.hidden = true; }); }
    mode = 'login'; el.querySelector('.sheetdlg').innerHTML = dialogHTML(); el.hidden = false; bind(el);
  }
  function bind(el) {
    const out = el.querySelector('#acctOut');
    if (out) out.onclick = async () => { try { await api('/logout', { method: 'POST' }); } catch (e) { } setToken(null); location.reload(); };
    const form = el.querySelector('#acctForm'); if (!form) return;
    const swap = el.querySelector('#acctSwap');
    swap.onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; el.querySelector('#acctTitle').textContent = mode === 'login' ? 'Sign in' : 'Create an account'; el.querySelector('#acctGo').textContent = mode === 'login' ? 'Sign in' : 'Create account'; swap.textContent = mode === 'login' ? 'Create an account instead' : 'I already have an account'; el.querySelector('#acctPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; };
    form.onsubmit = async e => {
      e.preventDefault();
      const err = el.querySelector('#acctErr'); err.hidden = true;
      const go = el.querySelector('#acctGo'); go.disabled = true;
      try {
        const d = await api(mode === 'login' ? '/login' : '/signup', { method: 'POST', body: JSON.stringify({ username: el.querySelector('#acctUser').value, password: el.querySelector('#acctPass').value }) });
        setToken(d.token); user = d.user; ready = Promise.resolve(user);
        const s = K.S(); if (!s.name) { s.name = user.username; K.save(); }
        await K.initSync(); if (window.A) A.refresh();
        el.hidden = true; renderBadge(); if (window.A) A.toast(mode === 'login' ? `Welcome back, ${user.username}` : `Account created — you're signed in`);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
      go.disabled = false;
    };
  }
  function renderBadge() {
    const btn = document.getElementById('acctBtn'); if (!btn) return;
    btn.querySelector('span').textContent = user ? user.username : 'Sign in';
  }
  window.addEventListener('load', async () => {
    const foot = document.querySelector('.sidefoot');
    if (foot) { const b = document.createElement('button'); b.className = 'linkbtn'; b.id = 'acctBtn'; b.innerHTML = '<svg class="i"><use href="#i-users"/></svg><span>Sign in</span>'; b.onclick = openDialog; foot.insertBefore(b, foot.querySelector('[data-open]')); }
    const top = document.querySelector('.topbar .sp');
    if (top) { const b = document.createElement('button'); b.className = 'btn quiet'; b.setAttribute('aria-label', 'Account'); b.innerHTML = '<svg class="i"><use href="#i-users"/></svg>'; b.onclick = openDialog; top.after(b); }
    const me = document.getElementById('meCard'); if (me) { me.style.cursor = 'pointer'; me.onclick = openDialog; }
    await ready; renderBadge();
  });
})();
