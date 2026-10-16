/* Aurora Extract — toolbar popup: detect this tab and start with one click. */
(function () {
  'use strict';
  const C = AuroraCatalog;
  const $ = (s) => document.querySelector(s);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const send = (m) => new Promise((r) => chrome.runtime.sendMessage(m, (x) => r(x || {})));
  const open = (hash) => send({ type: 'openDashboard', hash }).then(() => window.close());
  $('#dash').onclick = (e) => { e.preventDefault(); open('#extract'); };
  $('#res').onclick = (e) => { e.preventDefault(); open('#results'); };
  $('#studios').onclick = (e) => { e.preventDefault(); open('#studios'); };

  async function main() {
    const box = $('#box');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const platform = tab && Object.keys(C.platforms).find((id) => new RegExp('^https://([^/]+\\.)?' + id + '\\.com/').test(tab.url || ''));
    if (!platform) {
      box.innerHTML = `<h2>Ready when you are</h2><p>Open Facebook, Instagram or TikTok in this window and click me again — I'll detect the page.</p><button class="btn primary full" id="go">Open dashboard</button>`;
      $('#go').onclick = () => open('#extract'); return;
    }
    const p = C.platforms[platform];
    let d = null;
    try { d = await chrome.tabs.sendMessage(tab.id, { aurora: true, type: 'describe' }); } catch (_) {}
    const badge = `<span class="plat-badge" style="background:${p.color}">${p.glyph}${p.name}</span>`;
    if (!d) { box.innerHTML = `${badge}<h2>Reload this tab once</h2><p>Aurora Extract needs the page to be (re)loaded after install.</p><button class="btn full" id="rl">Reload tab</button>`; $('#rl').onclick = () => { chrome.tabs.reload(tab.id); window.close(); }; return; }
    const page = d.page;
    if (!page || !page.kinds.length) { box.innerHTML = `${badge}<h2>Pick a page to extract</h2><p>Open a profile, group, post, hashtag or Marketplace page, then click again.</p><button class="btn full" id="go">Open dashboard</button>`; $('#go').onclick = () => open('#extract'); return; }
    box.innerHTML = `${badge}<h2>${h(page.label)}</h2><p>Detected — choose what to collect:</p>
      <select id="kind">${page.kinds.map((k) => `<option value="${k.id}" ${k.id === page.primary ? 'selected' : ''}>${h(k.label)}</option>`).join('')}</select>
      <button class="btn primary full" id="start">▶ Start extracting</button><p style="margin-top:8px;font-size:11px">Up to 200 items, normal speed. Change in the dashboard.</p>`;
    $('#start').onclick = async () => {
      const kind = $('#kind').value, kl = page.kinds.find((k) => k.id === kind).label;
      $('#start').disabled = true;
      const r = await send({ type: 'startRun', tabId: tab.id, kind, platform, label: `${p.name} · ${kl}`, opts: { limit: 200, delayMs: 1200, media: true } });
      if (r.ok) open('#extract'); else { $('#start').disabled = false; $('#start').textContent = r.error || 'Could not start'; }
    };
  }
  main();
})();
