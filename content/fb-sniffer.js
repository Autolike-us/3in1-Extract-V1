/* Aurora Extract — Facebook video-address listener (MAIN world, document_start). It only LISTENS to the data
   Facebook's own page downloads and remembers each video's file address so real videos can be saved. Nothing is sent anywhere. */
(function () {
  'use strict';
  if (window.__auroraFbSniff) return;
  window.__auroraFbSniff = true;
  const store = {};
  const RANK = { hd_src_no_ratelimit: 6, hd_src: 5, browser_native_hd_url: 5, playable_url_quality_hd: 4, sd_src_no_ratelimit: 3, browser_native_sd_url: 3, sd_src: 2, progressive_url: 2, playable_url: 1 };
  const RE = /"(browser_native_hd_url|browser_native_sd_url|playable_url_quality_hd|playable_url|hd_src_no_ratelimit|hd_src|sd_src_no_ratelimit|sd_src|progressive_url)":"((?:[^"\\]|\\.)+)"/g;
  const unesc = (u) => { try { return JSON.parse('"' + u + '"'); } catch (_) { return u.replace(/\\\//g, '/').replace(/\\u0026/g, '&'); } };
  function handle(text) {
    if (!text || text.indexOf('playable_url') < 0 && text.indexOf('browser_native') < 0 && text.indexOf('_src') < 0 && text.indexOf('progressive_url') < 0) return;
    const best = {};
    RE.lastIndex = 0; let m;
    while ((m = RE.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 900), m.index);
      const ids = Array.from(before.matchAll(/"(?:id|video_id)":"(\d{6,})"/g));
      if (!ids.length) continue;
      const id = ids[ids.length - 1][1], q = RANK[m[1]], url = unesc(m[2]);
      if ((!store[id] || store[id].q < q) && (!best[id] || best[id].q < q)) best[id] = { id, url, q };
    }
    const fresh = Object.values(best);
    for (const v of fresh) store[v.id] = v;
    if (fresh.length) document.dispatchEvent(new CustomEvent('aurora-fb-media', { detail: JSON.stringify(fresh) }));
  }
  const of = window.fetch;
  window.fetch = function () { const p = of.apply(this, arguments); try { p.then((r) => { if (r && r.ok && /facebook\.com/.test(r.url || '')) r.clone().text().then(handle).catch(() => {}); }).catch(() => {}); } catch (_) {} return p; };
  const xo = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () { this.addEventListener('load', () => { try { if ((this.responseType === '' || this.responseType === 'text') && this.responseText) handle(this.responseText); } catch (_) {} }); return xo.apply(this, arguments); };
  document.addEventListener('aurora-fb-replay', () => { const all = Object.values(store); if (all.length) document.dispatchEvent(new CustomEvent('aurora-fb-media', { detail: JSON.stringify(all) })); });
})();
