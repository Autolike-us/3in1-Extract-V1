/* Aurora Extract — dashboard (full-tab UI). */
(function () {
  'use strict';
  const C = AuroraCatalog, X = AuroraExport;
  const $ = (s, el = document) => el.querySelector(s);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: async (k, d) => { try { const o = await chrome.storage.local.get(k); return o[k] === undefined ? d : o[k]; } catch (_) { return d; } },
    set: (o) => chrome.storage.local.set(o),
  };
  const send = (m) => new Promise((res) => chrome.runtime.sendMessage(m, (r) => res(r || {})));

  const S = { view: 'extract', platform: 'facebook', tabs: [], tabId: null, desc: null, kind: null, opts: { limit: 200, speed: 'normal', media: true }, runs: [], active: null, rows: [], page: 1, q: '', stripHidden: false };
  const SPEED = { gentle: 2200, normal: 1200, fast: 600 };

  /* ---------- utilities ---------- */
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600); }
  function setView(v) {
    S.view = v;
    for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'view-' + v;
    for (const b of document.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.view === v);
    if (v === 'audit') refreshAudit();
    if (v === 'results') { if (!S.userPicked && S.runs[0]) S.active = S.runs[0].id; loadRows().then(renderResults); }
    try { history.replaceState(null, '', '#' + v); } catch (_) {}
  }
  function theme(toggle) {
    const root = document.documentElement;
    let t = null;
    try { t = localStorage.getItem('aex-theme'); } catch (_) {}
    if (toggle) { const dark = root.dataset.theme === 'dark'; t = dark ? 'light' : 'dark'; try { localStorage.setItem('aex-theme', t); } catch (_) {} }
    if (t) root.dataset.theme = t;
  }
  const dl = (name, data, type) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const slug = (s) => String(s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'export';

  /* ---------- step 1: platforms ---------- */
  function renderPlatforms() {
    $('#platforms').innerHTML = Object.entries(C.platforms).map(([id, p]) => `
      <button class="plat" style="--c:${p.color}" data-p="${id}" aria-pressed="${S.platform === id}">
        <span class="ic">${p.glyph}</span><span><b>${p.name}</b><small>${p.blurb}</small></span>
        ${S.tabs.some((t) => t.platform === id) ? '<span class="found">● tab open</span>' : ''}
      </button>`).join('');
    $('#platforms').onclick = (e) => { const b = e.target.closest('.plat'); if (!b) return; S.platform = b.dataset.p; S.tabId = null; S.desc = null; pickDefaultTab(); render(); };
    const p = C.platforms[S.platform];
    $('#tiles').innerHTML = p.tiles.map((t) => `<div class="tile"><span class="e">${t[0]}</span><b>${h(t[1])}</b><p>${h(t[2])}</p>${t[3] ? `<small class="where">📍 ${h(t[3])}</small>` : ''}</div>`).join('');
  }

  /* ---------- step 2: tabs ---------- */
  async function scanTabs() {
    const out = [];
    for (const [id, p] of Object.entries(C.platforms)) {
      let tabs = [];
      try { tabs = await chrome.tabs.query({ url: p.match }); } catch (_) {}
      for (const t of tabs) out.push({ id: t.id, platform: id, title: t.title || '', url: t.url || '', active: t.active, last: t.lastAccessed || 0 });
    }
    out.sort((a, b) => b.last - a.last);
    S.tabs = out;
  }
  async function describe(tabId) {
    try { return await chrome.tabs.sendMessage(tabId, { aurora: true, type: 'describe' }); } catch (_) { return null; }
  }
  async function pickDefaultTab() {
    const mine = S.tabs.filter((t) => t.platform === S.platform);
    if (!mine.some((t) => t.id === S.tabId)) S.tabId = mine[0] ? mine[0].id : null;
    S.desc = S.tabId ? await describe(S.tabId) : null;
    S.kind = S.desc && S.desc.page ? S.desc.page.primary : null;
    renderTabs();
  }
  function renderTabs() {
    const p = C.platforms[S.platform];
    const mine = S.tabs.filter((t) => t.platform === S.platform);
    const host = $('#tabsArea');
    if (!mine.length) {
      host.innerHTML = `<div class="empty"><h3>Open ${p.name} in a normal tab</h3><p>Log in as usual, go to the page you want, then come back here. Or jump straight to:</p>
        <div class="chips">${p.open.map((o, i) => `<button class="chip" data-open="${i}">${h(o.label)}<small>${h(o.hint)}</small></button>`).join('')}</div></div>`;
      host.onclick = (e) => { const b = e.target.closest('[data-open]'); if (b) chrome.tabs.create({ url: p.open[+b.dataset.open].url }); };
      $('#optsArea').innerHTML = '';
      return;
    }
    host.innerHTML = `<div class="tabs">${mine.map((t) => `
      <button class="tabrow" data-t="${t.id}" aria-pressed="${t.id === S.tabId}">
        <span class="t"><b>${h(t.title || t.url)}</b><small>${h(t.url.replace(/^https?:\/\//, '').slice(0, 90))}</small></span>
        ${t.id === S.tabId && S.desc && S.desc.page ? `<span class="badge">${h(S.desc.page.label)}</span>` : ''}
      </button>`).join('')}</div>
      <div class="chips"><button class="chip" data-refresh>↻ Refresh tabs</button><button class="chip" data-new>＋ Open another ${p.name} page</button></div>`;
    host.onclick = async (e) => {
      const r = e.target.closest('.tabrow');
      if (r) { S.tabId = +r.dataset.t; S.desc = await describe(S.tabId); S.kind = S.desc && S.desc.page ? S.desc.page.primary : null; renderTabs(); return; }
      if (e.target.closest('[data-refresh]')) { await scanTabs(); await pickDefaultTab(); renderPlatforms(); }
      if (e.target.closest('[data-new]')) chrome.tabs.create({ url: p.open[0].url });
    };
    renderOpts();
  }

  /* ---------- options + start ---------- */
  function renderOpts() {
    const host = $('#optsArea');
    const page = S.desc && S.desc.page;
    if (!S.desc) { host.innerHTML = '<div class="warn">This tab hasn\'t loaded the extension yet — reload the page once, then press “Refresh tabs”.</div>'; return; }
    if (!page || !page.kinds.length) {
      host.innerHTML = `<div class="warn">Nothing to extract on this page yet. Open a profile, group, post, hashtag or Marketplace page and refresh.</div>`; return;
    }
    host.innerHTML = `
      <div class="step"><span>3</span> What should we collect from “${h(page.label)}”?</div>
      <div class="card">
        <div class="chips" style="margin-top:0" id="kinds">${page.kinds.filter((k) => k.id !== 'audit').map((k) => `<button class="chip ${k.id === S.kind ? 'on' : ''}" data-k="${k.id}" ${k.goto ? 'title="We\'ll open the right page in this tab for you"' : ''}>${h(k.label)}${k.goto ? ' <small>↗</small>' : ''}</button>`).join('')}</div>
        <div class="opts">
          <div><label for="oLimit">How many items (max)</label><input id="oLimit" type="number" min="1" max="50000" value="${S.opts.limit}"><div class="sub">We stop earlier if the page runs out.</div></div>
          <div><label>Speed</label><div class="seg" id="oSpeed">${['gentle', 'normal', 'fast'].map((s) => `<button data-s="${s}" class="${S.opts.speed === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div><div class="sub">Gentle is the kindest to your account.</div></div>
          <div><label>Media</label><label class="switch"><input id="oMedia" type="checkbox" ${S.opts.media ? 'checked' : ''}> Keep photo &amp; video links</label><div class="sub">Needed for the media ZIP download.</div></div>
        </div>
        <div class="actions"><button class="btn primary big" id="goBtn">▶ Start extracting</button><span class="note">You can stop any time — what's collected is kept.</span></div>
      </div>`;
    $('#kinds').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { S.kind = b.dataset.k; renderOpts(); } };
    $('#oSpeed').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { S.opts.speed = b.dataset.s; renderOpts(); } };
    if ($('#oLimit')) $('#oLimit').onchange = (e) => { S.opts.limit = Math.max(1, Math.min(50000, +e.target.value || 200)); };
    if ($('#oMedia')) $('#oMedia').onchange = (e) => { S.opts.media = e.target.checked; };
    $('#goBtn').onclick = startRun;
  }
  async function startRun() {
    const page = S.desc.page, kind = S.kind || page.primary;
    const kl = (page.kinds.find((k) => k.id === kind) || {}).label || kind;
    $('#goBtn').disabled = true;
    const kobj = page.kinds.find((k) => k.id === kind) || {};
    const res = await send({ type: 'startRun', tabId: S.tabId, kind, goto: kobj.goto, platform: S.platform, label: `${C.platforms[S.platform].name} · ${kl}`, opts: { limit: kind === 'audit' ? 30 : S.opts.limit, delayMs: SPEED[S.opts.speed], media: S.opts.media } });
    if (!res.ok) { toast(res.error || 'Could not start'); $('#goBtn').disabled = false; }
    else toast('Extraction started — you can keep browsing other tabs');
    await loadRuns(); renderLive();
  }


  /* ---------- health check page ---------- */
  async function refreshAudit() { await scanTabs(); await pickDefaultTab(); renderPlatforms(); renderAuditView(); }
  function renderAuditView() {
    const p = C.platforms[S.platform], mine = S.tabs.filter((t) => t.platform === S.platform);
    $('#auditPlats').innerHTML = Object.entries(C.platforms).map(([id, pp]) => `
      <button class="plat" style="--c:${pp.color}" data-ap="${id}" aria-pressed="${S.platform === id}">
        <span class="ic">${pp.glyph}</span><span><b>${pp.name}</b><small>${pp.blurb}</small></span>
        ${S.tabs.some((t) => t.platform === id) ? '<span class="found">● tab open</span>' : ''}
      </button>`).join('');
    $('#auditPlats').onclick = (e) => { const b = e.target.closest('[data-ap]'); if (!b) return; S.platform = b.dataset.ap; S.tabId = null; S.desc = null; pickDefaultTab().then(() => { renderPlatforms(); renderAuditView(); }); };
    const tabs = $('#auditTabs'), run = $('#auditRun');
    if (!mine.length) {
      tabs.innerHTML = `<div class="empty"><h3>Open ${p.name} in a normal tab</h3><p>Log in as usual and open the profile or page you want to check, then come back here. Or jump straight to:</p>
        <div class="chips">${p.open.slice(0, 1).map((o, i) => `<button class="chip" data-aopen="${i}">${h(o.label)}<small>${h(o.hint)}</small></button>`).join('')}</div></div>`;
      tabs.onclick = (e) => { if (e.target.closest('[data-aopen]')) chrome.tabs.create({ url: p.open[0].url }); };
      run.innerHTML = ''; return;
    }
    tabs.innerHTML = `<div class="tabs">${mine.map((t) => `
      <button class="tabrow" data-at="${t.id}" aria-pressed="${t.id === S.tabId}">
        <span class="t"><b>${h(t.title || t.url)}</b><small>${h(t.url.replace(/^https?:\/\//, '').slice(0, 90))}</small></span>
        ${t.id === S.tabId && S.desc && S.desc.page ? `<span class="badge">${h(S.desc.page.label)}</span>` : ''}
      </button>`).join('')}</div>
      <div class="chips"><button class="chip" data-arefresh>↻ Refresh tabs</button></div>`;
    tabs.onclick = async (e) => {
      const r = e.target.closest('[data-at]');
      if (r) { S.tabId = +r.dataset.at; S.desc = await describe(S.tabId); S.kind = S.desc && S.desc.page ? S.desc.page.primary : null; renderAuditView(); return; }
      if (e.target.closest('[data-arefresh]')) await refreshAudit();
    };
    const ok = S.desc && S.desc.page && S.desc.page.kinds.some((k) => k.id === 'audit');
    run.innerHTML = ok ? `
      <div class="card lrun"><div class="ring2"><b>?</b></div>
        <div style="flex:1;min-width:240px"><h3 style="margin:0 0 2px">${h(p.name)} · ${h(S.desc.page.label)}</h3><p style="margin:0;color:var(--muted)">Keep this tab in front while the check runs (about a minute).</p>
          <div class="seg" id="aSpeed" style="margin-top:12px;max-width:300px">${['gentle', 'normal', 'fast'].map((s) => `<button data-s="${s}" class="${S.opts.speed === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div></div>
        <button class="btn primary big" id="auditGo">✦ Run health check</button></div>`
      : `<div class="warn">${S.desc ? 'This page can\'t be scored. Open a <b>profile or page</b> (not a post, group or search) on ' + h(p.name) + ', then press “Refresh tabs”.' : 'This tab hasn\'t loaded the extension yet — reload the page once, then press “Refresh tabs”.'}</div>`;
    if (ok) {
      $('#aSpeed').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { S.opts.speed = b.dataset.s; renderAuditView(); } };
      $('#auditGo').onclick = startAudit;
    }
  }
  async function startAudit() {
    $('#auditGo').disabled = true;
    const res = await send({ type: 'startRun', tabId: S.tabId, kind: 'audit', platform: S.platform, label: `${C.platforms[S.platform].name} · Health check (Aurora Audit)`, opts: { limit: 30, delayMs: SPEED[S.opts.speed], media: true } });
    if (!res.ok) { toast(res.error || 'Could not start'); $('#auditGo').disabled = false; }
    else toast('Health check started — keep that tab in front');
    await loadRuns(); renderLive();
  }

  /* ---------- live card ---------- */
  function renderLive() { paintLive($('#liveCard')); paintLive($('#auditLive')); }
  function paintLive(el) {
    if (!el) return;
    const mine = (x) => (x.kind === 'audit') === (el.id === 'auditLive'); // health-check progress lives on its own page
    const r = S.runs.find((x) => mine(x) && (x.status === 'running' || x.status === 'paused')) || (S.justDone && S.runs.find((x) => x.id === S.justDone && mine(x)));
    if (!r) { el.hidden = true; return; }
    el.hidden = false;
    const live = r.status === 'running' || r.status === 'paused';
    el.className = 'card live' + (live ? '' : ' finished');
    const pct = Math.min(100, Math.round(((r.count || 0) / (r.opts.limit || 1)) * 100));
    el.innerHTML = `
      <div class="ring" style="--p:${pct}"><b>${(r.count || 0).toLocaleString()}</b></div>
      <div><h3>${live ? (r.status === 'paused' ? '⏸ Paused' : 'Collecting…') : r.status === 'error' ? '⚠️ Stopped with a problem' : '✅ Done'} <span class="note">${h(r.label)}</span></h3>
        <p>${h(r.error || r.note || (live ? 'Reading the page. Keep that tab in front — Chrome pauses hidden tabs and the site stops loading more.' : `${(r.count || 0).toLocaleString()} items saved.`))}</p>${r.warning && !live ? `<p class="warn" style="margin-top:10px">⚠️ ${h(r.warning)}</p>` : ''}<div class="bar"><i></i></div></div>
      <div class="actions" style="margin:0">
        ${live ? `<button class="btn" data-a="pause">${r.status === 'paused' ? '▶ Resume' : '⏸ Pause'}</button><button class="btn danger" data-a="stop">■ Stop</button>` : `<button class="btn primary" data-a="view">View results</button>${r.status === 'error' || !r.count ? '<button class="btn" data-a="report">🐞 Copy debug report</button><a class="btn" href="' + C.telegram + '" target="_blank" rel="noopener">💬 Telegram</a>' : ''}`}
      </div>`;
    el.onclick = async (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'stop') await send({ type: 'stopRun', runId: r.id });
      if (a.dataset.a === 'pause') await send({ type: 'pauseRun', runId: r.id, on: r.status !== 'paused' });
      if (a.dataset.a === 'report') reportCopy(r.id);
      if (a.dataset.a === 'view') { S.active = r.id; S.userPicked = true; await loadRows(); setView('results'); }
    };
  }

  /* ---------- results ---------- */
  async function loadRuns() {
    S.runs = await store.get('runs', []);
    const n = S.runs.length;
    $('#navCount').hidden = !n; $('#navCount').textContent = n;
    if (!S.active && S.runs[0]) S.active = S.runs[0].id;
  }
  async function loadRows() { S.rows = S.active ? await store.get('rows:' + S.active, []) : []; S.page = 1; }
  const stColor = { running: 'var(--accent)', paused: 'var(--warn)', done: 'var(--ok)', stopped: 'var(--warn)', error: 'var(--bad)' };
  function when(ts) { const d = new Date(ts); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }

  function renderResults() {
    const runsEl = $('#runs'), v = $('#viewer');
    if (!S.runs.length) {
      runsEl.innerHTML = '';
      v.innerHTML = '<div class="empty-state"><div class="e">🌱</div><h3>Nothing here yet</h3><p>Run your first extraction and it will show up here.</p><p style="margin-top:16px"><button class="btn primary" id="toExtract">Start extracting</button></p></div>';
      $('#toExtract').onclick = () => setView('extract'); return;
    }
    runsEl.innerHTML = S.runs.map((r) => `<button class="run ${r.id === S.active ? 'on' : ''}" data-r="${r.id}"><b><i class="pdot" style="background:${stColor[r.status] || 'var(--muted)'}"></i>${h(r.label)}</b><small>${(r.count || 0).toLocaleString()} items · ${when(r.startedAt)}</small></button>`).join('');
    runsEl.onclick = async (e) => { const b = e.target.closest('.run'); if (!b) return; S.userPicked = true; S.active = b.dataset.r; S.q = ''; await loadRows(); renderResults(); };
    renderViewer();
  }
  function visibleRows() {
    const q = S.q.trim().toLowerCase();
    if (!q) return S.rows;
    return S.rows.filter((r) => Object.values(r).some((v) => v != null && typeof v !== 'object' && String(v).toLowerCase().includes(q)) || (r.emails || r.emailsInText || []).join(' ').toLowerCase().includes(q));
  }
  function renderViewer() {
    const v = $('#viewer'), run = S.runs.find((r) => r.id === S.active);
    if (!run) return;
    if (run.kind === 'audit' && S.rows[0] && S.rows[0].audit) return renderAudit(v, run);
    const rows = visibleRows();
    const cols = X.columns(S.rows, C.preferred).filter((c) => !C.hidden.includes(c));
    const PAGE = 100, shown = rows.slice(0, S.page * PAGE);
    const mediaCount = S.rows.reduce((n, r) => n + ((r.media && r.media.length) || 0), 0);
    const emails = new Set(); for (const r of S.rows) for (const k of ['email', 'emails', 'emailsInText']) [].concat(r[k] || []).forEach((e) => e && emails.add(e));
    const hasThumb = S.rows.some((r) => r.media && r.media.some((m) => m.type === 'image'));
    const hasMedia = S.rows.some((r) => r.media && r.media.length);
    v.innerHTML = `
      <div class="vhead"><h2>${h(run.label)}</h2>
        <button class="btn" data-x="csv">CSV</button><button class="btn" data-x="xlsx">Excel</button><button class="btn" data-x="json">JSON</button><button class="btn" data-x="report" title="Copy a technical report for support">🐞 Debug</button>
        <button class="btn primary" data-x="media" ${mediaCount ? '' : 'disabled'}>⬇ Media ZIP${mediaCount ? ` (${mediaCount})` : ''}</button></div>
      <div class="vtools"><input type="search" id="q" placeholder="Search these results…" value="${h(S.q)}">
        ${emails.size ? `<button class="btn" data-x="emails">✉ Copy ${emails.size} email${emails.size > 1 ? 's' : ''}</button>` : ''}
        <span style="flex:1"></span><button class="btn danger" data-x="delete">Delete</button></div>
      ${run.warning ? `<div class="warn" style="margin:14px 22px 0">⚠️ ${h(run.warning)}</div>` : ''}
      ${rows.length ? `<div class="tablewrap"><table><thead><tr>${hasThumb ? '<th></th>' : ''}${hasMedia ? '<th>Media</th>' : ''}${cols.map((c) => `<th>${h(nice(c))}</th>`).join('')}</tr></thead><tbody>
        ${shown.map((r) => `<tr>${hasThumb ? `<td>${thumb(r)}</td>` : ''}${hasMedia ? `<td>${mediaCell(r)}</td>` : ''}${cols.map((c) => cellHtml(r[c], c)).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="vfoot"><span>Showing ${shown.length.toLocaleString()} of ${rows.length.toLocaleString()}</span>${shown.length < rows.length ? '<button class="btn" data-x="more">Show more</button>' : ''}</div>`
      : `<div class="empty-state"><div class="e">${run.status === 'running' ? '⏳' : '🔍'}</div><p>${run.status === 'running' ? 'Waiting for the first results…' : S.q ? 'No rows match your search.' : 'No data was found on that page.'}</p>${run.error ? `<p class="warn">${h(run.error)}</p>` : ''}${run.status !== 'running' ? '<p style="margin-top:14px"><button class="btn primary" data-x="report">🐞 Copy debug report</button></p><p class="note" style="margin-top:8px">Paste it in our <a href="' + C.telegram + '" target="_blank" rel="noopener">Telegram channel</a> and we\'ll fix the extractor for this page.</p>' : ''}</div>`}
      <div class="strip" id="strip" ${S.stripHidden || !rows.length ? 'hidden' : ''}><p>💡 Found the right people? <b>Aurora Studios</b> can like, follow and comment for you — hands-free, with human-like pacing. <a href="${C.site}?utm_source=extract&utm_medium=extension&utm_campaign=results_strip" target="_blank" rel="noopener">3-day free trial →</a></p><button class="x" data-x="hidestrip" aria-label="Dismiss">✕</button></div>`;
    $('#q').oninput = (e) => { S.q = e.target.value; S.page = 1; clearTimeout(renderViewer._t); renderViewer._t = setTimeout(() => { renderViewer(); const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
    v.onclick = (e) => { const b = e.target.closest('[data-x]'); if (b) act(b.dataset.x, run, rows); };
  }
  const nice = (c) => c.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\bUrl\b/i, 'URL').replace(/\bId\b/i, 'ID').replace(/^./, (x) => x.toUpperCase());
  const mediaCell = (r) => {
    const ms = r.media || [], v = ms.filter((m) => m.type === 'video'), im = ms.filter((m) => m.type === 'image');
    const parts = [];
    if (v.length) parts.push(`<a class="mchip vid" href="${h(v[0].url)}" target="_blank" rel="noopener noreferrer" title="Open the video file">▶ ${v.length} video</a>`);
    if (im.length) parts.push(`<span class="mchip">🖼 ${im.length} photo${im.length > 1 ? 's' : ''}</span>`);
    if (r.videoMissing) parts.push('<span class="mchip warn" title="The site did not expose the video file for this post">no video file</span>');
    return parts.join(' ') || '';
  };
  const thumb = (r) => { const m = (r.media || []).find((x) => x.type === 'image'); return m ? `<img loading="lazy" referrerpolicy="no-referrer" src="${h(m.url)}" alt="">` : ''; };
  function cellHtml(v, c) {
    if (v == null || v === '') return '<td></td>';
    if (Array.isArray(v)) v = v.join('; ');
    if (typeof v === 'object') v = JSON.stringify(v);
    if (typeof v === 'number') return `<td class="num">${v.toLocaleString()}</td>`;
    const s = String(v);
    if (/^https?:\/\//.test(s)) return `<td><a href="${h(s)}" target="_blank" rel="noopener noreferrer">${h(s.replace(/^https?:\/\/(www\.)?/, ''))}</a></td>`;
    return `<td title="${h(s)}">${h(s)}</td>`;
  }


  /* ---------- Aurora Audit report ---------- */
  const AUD_COLOR = (s) => (s >= 85 ? 'var(--ok)' : s >= 70 ? '#4ea8de' : s >= 55 ? 'var(--warn)' : 'var(--bad)');
  const DOT = { good: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' };
  function auditText(a, row) {
    const L = [`Aurora Audit — ${row.name || row.username || ''} (${a.platform})`, `Score ${a.score}/100 · Grade ${a.grade} — ${a.verdict}`, ''];
    for (const s of a.sections) L.push(`${s.label}: ${s.score == null ? 'not scored' : s.score + '/' + s.max}`);
    if (a.topFixes.length) { L.push('', 'Top fixes:'); a.topFixes.forEach((f, i) => L.push(`${i + 1}. ${f.label} — ${f.tip}`)); }
    return L.join('\n');
  }
  function renderAudit(v, run) {
    const row = S.rows[0], a = row.audit, c = AUD_COLOR(a.score), st = a.stats;
    const chip = (k, val) => (val == null || val === '' ? '' : `<span class="achip"><b>${h(String(val))}</b> ${h(k)}</span>`);
    v.innerHTML = `
      <div class="vhead"><h2>${h(run.label)}</h2>
        <button class="btn" data-x="copyaudit">Copy summary</button><button class="btn" data-x="csv">CSV</button><button class="btn" data-x="xlsx">Excel</button><button class="btn" data-x="json">JSON</button><button class="btn" data-x="report" title="Copy a technical report for support">🐞 Debug</button>
        <button class="btn danger" data-x="delete">Delete</button></div>
      <div class="audit">
        <div class="ahero">
          <div class="agauge" style="--p:${a.score};--c:${c}"><div><b>${a.score}</b><small>out of 100</small></div></div>
          <div class="ahead"><div class="agrade" style="background:${c}">${h(a.grade)}</div><h3>${h(row.name || row.username || 'This profile')}</h3><p>${h(a.verdict)}</p>
            <div class="achips">${chip('followers', st.followers != null ? st.followers.toLocaleString() : null)}${chip('posts read', st.postsAnalysed)}${chip('posts / week', st.postsPerWeek)}${chip('days since last post', st.daysSinceLastPost)}${chip('hashtags / post', st.avgHashtags)}${chip('% engagement', st.engagementRate)}</div></div>
        </div>
        ${a.notes.length ? `<div class="warn">ℹ️ ${a.notes.map(h).join('<br>')}</div>` : ''}
        ${a.topFixes.length ? `<h4 class="asub">Your top fixes</h4><ol class="afixes">${a.topFixes.map((f) => `<li><span class="adot" style="background:${DOT[f.level]}"></span><div><b>${h(f.label)}</b><span>${h(f.tip)}</span></div></li>`).join('')}</ol>` : '<div class="warn" style="background:rgba(18,165,148,.12);border-color:rgba(18,165,148,.35)">🎉 Nothing major to fix — keep it up.</div>'}
        <h4 class="asub">Score breakdown</h4>
        <div class="asections">${a.sections.map((s) => `
          <details class="asec" ${s.findings.some((f) => f.level !== 'good') ? 'open' : ''}><summary><span class="aname">${h(s.label)}</span>
            <span class="abar"><i style="width:${s.score == null ? 0 : Math.round((s.score / s.max) * 100)}%;background:${s.score == null ? 'var(--line)' : AUD_COLOR((s.score / s.max) * 100)}"></i></span>
            <span class="anum">${s.score == null ? 'not scored' : s.score + ' / ' + s.max}</span></summary>
            <ul>${s.findings.map((f) => `<li><span class="adot" style="background:${DOT[f.level]}"></span><div><b>${h(f.label)}</b><span>${h(f.detail)}</span>${f.tip ? `<em>→ ${h(f.tip)}</em>` : ''}</div></li>`).join('') || '<li class="note">No data available for this part.</li>'}</ul></details>`).join('')}
        </div>
        <p class="note" style="margin-top:18px">Scored on this computer from the profile and recent posts your own account can see. Benchmarks are rough guide values, not rules — every niche is different. No data left your browser.</p>
        <div class="strip"><p>💡 Know what to fix — now keep it consistent. <b>Aurora Studios</b> can schedule the likes, follows and comments that keep an account active. <a href="${C.site}?utm_source=extract&utm_medium=extension&utm_campaign=audit_report" target="_blank" rel="noopener">See Aurora Studios</a></p></div>
      </div>`;
    v.onclick = async (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'copyaudit') { try { await navigator.clipboard.writeText(auditText(a, row)); toast('Summary copied'); } catch (_) { toast('Could not copy'); } }
      else act(b.dataset.x, run, S.rows);
    };
  }

  /* ---------- exports ---------- */
  function exportRows(rows) { return rows.map((r) => { const o = { ...r }; o.mediaUrls = (r.media || []).map((m) => m.url); delete o.media; delete o.audit; return o; }); }
  async function act(a, run, rows) {
    const base = `aurora-${slug(run.label)}-${new Date().toISOString().slice(0, 10)}`;
    const flat = exportRows(rows);
    const pref = C.preferred;
    if (a === 'csv') { dl(base + '.csv', X.toCSV(flat, pref), 'text/csv;charset=utf-8'); afterExport(); }
    else if (a === 'json') { dl(base + '.json', X.toJSON(rows), 'application/json'); afterExport(); }
    else if (a === 'xlsx') { dl(base + '.xlsx', X.toXLSX(flat, pref), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); afterExport(); }
    else if (a === 'emails') {
      const set = new Set(); for (const r of rows) for (const k of ['email', 'emails', 'emailsInText']) [].concat(r[k] || []).forEach((e) => e && set.add(e));
      await navigator.clipboard.writeText(Array.from(set).join('\n')); toast(`Copied ${set.size} email${set.size > 1 ? 's' : ''}`);
    }
    else if (a === 'media') mediaZip(run, rows, base);
    else if (a === 'report') reportCopy(run.id);
    else if (a === 'more') { S.page++; renderViewer(); }
    else if (a === 'hidestrip') { S.stripHidden = true; $('#strip').hidden = true; }
    else if (a === 'delete') {
      if (!confirm('Delete this extraction and its data from this browser?')) return;
      await send({ type: 'deleteRun', runId: run.id }); S.active = null; await loadRuns(); await loadRows(); renderResults(); toast('Deleted');
    }
  }
  async function reportCopy(runId) { toast((await AuroraReport.copy({ runId })) ? 'Debug report copied — paste it in our Telegram channel' : 'Could not copy — use Help → Save as .txt'); }
  function afterExport() { toast('Download started ✓'); }

  /* ---------- media ZIP ---------- */
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  const safeName = (s) => String(s || 'misc').replace(/[^\w.@-]+/g, '_').slice(0, 60);
  async function mediaZip(run, rows, base) {
    const items = [];
    for (const r of rows) (r.media || []).forEach((m, i) => items.push({ r, m, i }));
    if (!items.length) return toast('No media in these rows');
    const btn = $('[data-x=media]'); btn.disabled = true;
    const files = [], index = [['file', 'type', 'source_row', 'url']], report = [];
    let done = 0, bytes = 0, part = 1;
    const tally = { video: 0, image: 0, failed: 0 };
    const reasons = {};
    const flush = async (final) => {
      if (!files.length && !final) return;
      const csv = index.map((row) => row.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
      const extra = [{ name: 'index.csv', data: '\ufeff' + csv }];
      if (final || part === 1) extra.push({ name: 'download-report.txt', data: `Aurora Extract media download report\n${new Date().toISOString()}\nvideos saved: ${tally.video}  photos saved: ${tally.image}  failed: ${tally.failed}\n\n${report.join('\n')}\n` });
      if (!files.length && !tally.failed) return;
      dl(`${base}-media-part${part}.zip`, AuroraZip.makeZip(files.concat(extra)), 'application/zip'); part++; files.length = 0; bytes = 0; index.length = 1;
    };
    const fail = (it, why) => { tally.failed++; reasons[why] = (reasons[why] || 0) + 1; report.push(`FAILED  ${it.m.type.padEnd(5)} ${why}  ${it.m.url.slice(0, 160)}`); };
    const queue = items.slice();
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        try {
          const res = await fetch(it.m.url, { credentials: /tiktok|facebook|fbcdn/.test(it.m.url) ? 'include' : 'omit' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
          const buf = new Uint8Array(await res.arrayBuffer());
          // a "video" must really be a video: an image, web page or empty body means the link is expired or blocked
          if (it.m.type === 'video' && (/^(image|text)\//.test(ct) || /json/.test(ct))) throw new Error(`expected video, server sent ${ct}`);
          if (buf.length < 200) throw new Error(`empty file (${buf.length} bytes)`);
          const ext = EXT[ct] || (it.m.type === 'video' ? 'mp4' : 'jpg');
          const who = safeName(it.r.author || it.r.username || it.r.name || it.r.title || run.label);
          const name = `${safeName(it.r.platform)}/${who}/${safeName(it.r.id || done)}_${it.i + 1}.${ext}`;
          files.push({ name, data: buf }); bytes += buf.length; tally[it.m.type === 'video' ? 'video' : 'image']++;
          index.push([name, it.m.type, it.r.url || it.r.profileUrl || '', it.m.url]);
          report.push(`ok      ${it.m.type.padEnd(5)} ${ct || '?'}  ${(buf.length / 1024).toFixed(0)} KB  ${name}`);
        } catch (e) { fail(it, e.message || String(e)); }
        done++; btn.textContent = `⬇ ${done}/${items.length}…`;
        if (bytes > 350 * 1024 * 1024) await flush(false);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    await flush(true);
    btn.disabled = false; btn.textContent = '⬇ Media ZIP';
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    toast(`Saved ${tally.video} video${tally.video === 1 ? '' : 's'} + ${tally.image} photo${tally.image === 1 ? '' : 's'}${tally.failed ? ` — ${tally.failed} failed (${top[0]}). See download-report.txt in the ZIP` : ' ✓'}`);
  }

  /* ---------- studios tab ---------- */
  function renderStudios() {
    $('#studiosGrid').innerHTML = C.studios.map((s) => `<div class="studio" style="--c:${s.color}"><h3>${s.name}</h3><p>${s.text}</p><p style="margin-top:14px"><a class="btn" href="${C.site}?utm_source=extract&utm_medium=extension&utm_campaign=studio_${s.id}" target="_blank" rel="noopener">Try it free →</a></p></div>`).join('');
  }

  /* ---------- boot ---------- */
  function render() { renderPlatforms(); renderTabs(); }
  async function init() {
    theme(false);
    $('#themeBtn').onclick = () => theme(true);
    $('#reportBtn').onclick = async () => toast((await AuroraReport.copy({})) ? 'Debug report copied — paste it in our Telegram channel' : 'Could not copy — use Help → Save as .txt');
    $('#helpReport').onclick = $('#reportBtn').onclick; $('#helpSave').onclick = () => AuroraReport.save({});
    $('#nav').onclick = (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); };
    renderStudios();
    await scanTabs(); await loadRuns(); await loadRows();
    // jump to the platform of the most recently used tab
    if (S.tabs[0]) S.platform = S.tabs[0].platform;
    await pickDefaultTab(); render(); renderLive();
    const v = (location.hash || '').replace('#', '');
    setView(['extract', 'audit', 'results', 'studios', 'help'].includes(v) ? v : 'extract');
    let t;
    chrome.storage.onChanged.addListener((ch) => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const wasRunning = S.runs.find((r) => r.status === 'running' || r.status === 'paused');
        await loadRuns();
        const nowRun = wasRunning && S.runs.find((r) => r.id === wasRunning.id);
        if (nowRun && nowRun.status !== 'running' && nowRun.status !== 'paused') { S.justDone = nowRun.id; S.active = nowRun.id; if (nowRun.status === 'done') toast(`Done — ${nowRun.count} items collected`); }
        await loadRows();
        renderLive(); if (S.view === 'results') renderResults();
      }, 350);
    });
    chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete') { clearTimeout(init._t); init._t = setTimeout(async () => { await scanTabs(); renderPlatforms(); if (S.view === 'extract') { await pickDefaultTab(); } }, 600); } });
  }
  init();
})();
