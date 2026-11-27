/* NextMove web build: accounts, cloud save and online rooms through the site's own API.
   Provides the same small interface the app uses inside Claude (claude.use('db' | 'user' | 'room')). */
(() => {
  window.NM_WEB = true; window.NM_USER = () => user && user.username;
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

  // offline app shell + install prompt
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { }));
  window.NM_INSTALL = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.NM_INSTALL = e; window.A && A.refreshInstall && A.refreshInstall(); });
  addEventListener('appinstalled', () => { window.NM_INSTALL = null; window.NM_TRACK && window.NM_TRACK('install'); window.A && A.refreshInstall && A.refreshInstall(); });
  window.NM_TRACK = k => { try { fetch('/api/ev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k }), keepalive: true }).catch(() => { }); } catch (e) { } };
  try { if (!sessionStorage.getItem('nm-v')) { sessionStorage.setItem('nm-v', '1'); window.NM_TRACK('visit'); } } catch (e) { }
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
  const head = t => `<div class="ph"><h2 id="acctTitle">${t}</h2><button class="btn quiet sp" data-close-acct aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>`;
  function codeHTML(code, first) {
    return `${head(first ? 'Save your recovery code' : 'Your new recovery code')}
      <section><p>${first ? 'Your account is ready. ' : ''}If you ever forget your password, this code is the only way back into your account. Save it somewhere safe, like a password manager or a screenshot.</p>
      <p class="code" style="font-size:30px;margin:14px 0;user-select:all">${esc(code)}</p>
      <div class="row"><button class="btn sec" id="rcCopy" type="button">Copy</button><button class="btn sec" id="rcSave" type="button">Download</button></div>
      <p class="small mute" style="margin-top:10px">${first ? '' : 'Your old code no longer works. '}Each code works once; after you use it you'll get a new one.</p></section>
      <section><label class="chk"><input type="checkbox" id="rcOk"> I've saved my recovery code</label><div class="row" style="margin-top:10px"><button class="btn" id="rcDone" disabled>Continue</button></div></section>`;
  }
  function dialogHTML() {
    if (user) return `${head('Account')}
      <section><p>Signed in as <b>${esc(user.username)}</b>.</p><p class="small mute" style="margin-top:6px">Your games, drills and ratings sync to every device you sign in on.</p></section>
      <section><h3>Recovery code</h3><p class="small mute">${user.hasRecovery ? 'You have a recovery code. Lost it? Make a new one; the old one stops working.' : 'You don’t have a recovery code yet. Without one, a forgotten password means a lost account.'}</p><div class="row" style="margin-top:8px"><button class="btn ${user.hasRecovery ? 'sec' : ''}" id="rcNew">${user.hasRecovery ? 'Make a new code' : 'Create my recovery code'}</button></div></section>
      <section><h3>Email (optional)</h3><form id="emForm" class="row" style="flex-wrap:nowrap"><input type="text" id="emIn" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(user.email || '')}"><button class="btn sec" type="submit">Save</button></form><p class="small mute" style="margin-top:6px">Only used to help you get back into your account. Password resets by email are coming; until then, use your recovery code.</p></section>
      <section class="row">${user.admin ? '<a class="btn sec" href="/stats.html">Site stats</a>' : ''}<a class="btn quiet" href="/privacy.html">Privacy</a><a class="btn quiet" href="/terms.html">Terms</a><button class="btn sec" id="acctOut" style="margin-left:auto">Sign out</button></section>`;
    return `<div class="ph"><h2 id="acctTitle">Sign in</h2><button class="btn quiet sp" data-close-acct aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>
      <section><p class="small mute">Sign in to keep your progress on every device and play friends online. Without an account, progress stays in this browser.</p></section>
      <section><form id="acctForm" style="display:flex;flex-direction:column;gap:10px">
        <label class="f">Username<input type="text" id="acctUser" autocomplete="username" maxlength="20" required></label>
        <label class="f">Password<input type="password" id="acctPass" autocomplete="current-password" minlength="8" required></label>
        <p class="small" id="acctErr" style="color:var(--no)" hidden></p>
        <div class="row"><button class="btn" type="submit" id="acctGo">Sign in</button><button class="btn quiet" type="button" id="acctSwap">Create an account instead</button></div>
        <button class="btn quiet" type="button" id="acctForgot" style="align-self:flex-start;padding:0">Forgot your password?</button>
        <p class="small mute" id="acctLegal" hidden>By creating an account you agree to the <a href="/terms.html" style="color:var(--acc2)">terms</a> and <a href="/privacy.html" style="color:var(--acc2)">privacy policy</a>.</p>
      </form></section>`;
  }
  function recoverHTML() {
    return `${head('Get back into your account')}
      <section><p class="small mute">Enter your username, the recovery code you saved when you made your account, and a new password.</p></section>
      <section><form id="recForm" style="display:flex;flex-direction:column;gap:10px">
        <label class="f">Username<input type="text" id="recUser" autocomplete="username" maxlength="20" required></label>
        <label class="f">Recovery code<input type="text" id="recCode" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-JKLM-NPQR" required></label>
        <label class="f">New password<input type="password" id="recPass" autocomplete="new-password" minlength="8" required></label>
        <p class="small" id="recErr" style="color:var(--no)" hidden></p>
        <div class="row"><button class="btn" type="submit" id="recGo">Reset password</button><button class="btn quiet" type="button" id="recBack">Back to sign in</button></div>
        <p class="small mute">No recovery code? Email <a href="mailto:hello@nextmove.gg" style="color:var(--acc2)">hello@nextmove.gg</a> from the address on your account, if you added one.</p>
      </form></section>`;
  }
  function showCode(el, code, first) {
    const box = el.querySelector('.sheetdlg'); box.innerHTML = codeHTML(code, first);
    box.querySelector('#rcCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(code).then(() => window.A && A.toast('Recovery code copied')); };
    box.querySelector('#rcSave').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`NextMove recovery code for ${user ? user.username : ''}\n\n${code}\n\nUse it at nextmove.gg → Sign in → Forgot your password?\n`], { type: 'text/plain' })); a.download = 'nextmove-recovery-code.txt'; a.click(); };
    box.querySelector('#rcOk').onchange = e => { box.querySelector('#rcDone').disabled = !e.target.checked; };
    box.querySelector('#rcDone').onclick = () => { el.hidden = true; };
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
    const rcNew = el.querySelector('#rcNew');
    if (rcNew) rcNew.onclick = async () => { rcNew.disabled = true; try { const d = await api('/recovery', { method: 'POST' }); user.hasRecovery = true; showCode(el, d.recoveryCode, false); } catch (e) { rcNew.disabled = false; window.A && A.toast(e.message); } };
    const em = el.querySelector('#emForm');
    if (em) em.onsubmit = async e => { e.preventDefault(); try { const d = await api('/email', { method: 'PUT', body: JSON.stringify({ email: el.querySelector('#emIn').value }) }); user.email = d.email; window.A && A.toast(d.email ? 'Email saved' : 'Email removed'); } catch (ex) { window.A && A.toast(ex.message); } };
    const forgot = el.querySelector('#acctForgot');
    if (forgot) forgot.onclick = () => {
      const box = el.querySelector('.sheetdlg'); box.innerHTML = recoverHTML();
      box.querySelector('#recUser').value = el.querySelector('#acctUser') ? el.querySelector('#acctUser').value : '';
      box.querySelector('#recBack').onclick = () => { box.innerHTML = dialogHTML(); bind(el); };
      box.querySelector('#recForm').onsubmit = async e => {
        e.preventDefault(); const err = box.querySelector('#recErr'); err.hidden = true; const go = box.querySelector('#recGo'); go.disabled = true;
        try {
          const d = await api('/recover', { method: 'POST', body: JSON.stringify({ username: box.querySelector('#recUser').value, code: box.querySelector('#recCode').value, password: box.querySelector('#recPass').value }) });
          setToken(d.token); user = d.user; user.hasRecovery = true; ready = Promise.resolve(user);
          await K.initSync(); if (window.A) A.refresh(); renderBadge();
          showCode(el, d.recoveryCode, false); window.A && A.toast(`Password reset. Welcome back, ${user.username}`);
        } catch (ex) { err.textContent = ex.message; err.hidden = false; go.disabled = false; }
      };
    };
    const form = el.querySelector('#acctForm'); if (!form) return;
    const swap = el.querySelector('#acctSwap');
    swap.onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; el.querySelector('#acctLegal').hidden = mode === 'login'; el.querySelector('#acctForgot').hidden = mode !== 'login'; el.querySelector('#acctTitle').textContent = mode === 'login' ? 'Sign in' : 'Create an account'; el.querySelector('#acctGo').textContent = mode === 'login' ? 'Sign in' : 'Create account'; swap.textContent = mode === 'login' ? 'Create an account instead' : 'I already have an account'; el.querySelector('#acctPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; };
    form.onsubmit = async e => {
      e.preventDefault();
      const err = el.querySelector('#acctErr'); err.hidden = true;
      const go = el.querySelector('#acctGo'); go.disabled = true;
      try {
        const d = await api(mode === 'login' ? '/login' : '/signup', { method: 'POST', body: JSON.stringify({ username: el.querySelector('#acctUser').value, password: el.querySelector('#acctPass').value }) });
        setToken(d.token); user = d.user; try { user = (await api('/me')).user; } catch (e2) { } ready = Promise.resolve(user);
        const s = K.S(); if (!s.name) { s.name = user.username; K.save(); }
        await K.initSync(); if (window.A) A.refresh();
        renderBadge();
        if (mode === 'signup' && d.recoveryCode) { user.hasRecovery = true; showCode(el, d.recoveryCode, true); return; }
        el.hidden = true; if (window.A) A.toast(`Welcome back, ${user.username}`);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
      go.disabled = false;
    };
  }
  function renderBadge() {
    const btn = document.getElementById('acctBtn'); if (!btn) return;
    btn.querySelector('span').textContent = 'Sign in'; btn.hidden = !!user;
    const me = document.getElementById('meCard'); if (me) me.hidden = !user;
  }
  // report uncaught errors (at most 5 per visit) so breakage shows up on the stats page
  let errN = 0; const report = (msg, src) => { if (errN++ >= 5) return; try { fetch('/api/err', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msg: String(msg), src: String(src || ''), path: location.hash }), keepalive: true }).catch(() => { }); } catch (e) { } };
  addEventListener('error', e => { if (e.message) report(e.message, `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`); });
  addEventListener('unhandledrejection', e => { const r = e.reason; report(r && (r.message || r), r && r.stack ? r.stack.split('\n')[1] : ''); });
  // hooks for NextMove Plus (plus.js)
  window.NM_ACCOUNT = () => openDialog();
  window.NM_PLAN = () => (user && user.plan) || 'free';
  window.NM_FOUNDER = () => !!(user && user.founder);
  window.NM_READY = () => ready;
  window.NM_API = api;
  window.NM_REFRESH_ME = async () => { try { user = (await api('/me')).user; } catch (e) { } renderBadge(); window.A && A.refresh && A.refresh(); return user; };
  window.addEventListener('load', async () => {
    const foot = document.querySelector('.sidefoot');
    if (foot) { const b = document.createElement('button'); b.className = 'linkbtn'; b.id = 'acctBtn'; b.innerHTML = '<svg class="i"><use href="#i-users"/></svg><span>Sign in</span>'; b.onclick = openDialog; foot.insertBefore(b, foot.querySelector('[data-open]')); }
    const me = document.getElementById('meCard'); if (me) { me.style.cursor = 'pointer'; me.onclick = openDialog; }
    await ready; renderBadge();
  });
})();
