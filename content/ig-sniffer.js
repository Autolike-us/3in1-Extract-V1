/* Aurora Extract — runs inside the Instagram page (MAIN world, document_start). It only LISTENS to the JSON
   Instagram's own page already downloads (feeds, reels, graphql) and remembers each post's photo / video file
   addresses so the extractor can save real videos instead of thumbnails. Nothing is sent anywhere. */
(function () {
  'use strict';
  if (window.__auroraSniff) return;
  window.__auroraSniff = true;
  const store = {}; // code -> [{v, i}]

  function walk(o, out, d) {
    if (!o || typeof o !== 'object' || d > 14) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, out, d + 1); return; }
    if (typeof o.code === 'string' && (o.video_versions || o.image_versions2 || o.carousel_media)) out.push(o);
    for (const k in o) { const v = o[k]; if (v && typeof v === 'object') walk(v, out, d + 1); }
  }
  const first = (arr) => (arr && arr[0] && arr[0].url) || null;
  const cand = (m) => m && m.image_versions2 && first(m.image_versions2.candidates);
  function items(m) {
    if (m.carousel_media && m.carousel_media.length) return m.carousel_media.map((c) => ({ v: first(c.video_versions), i: cand(c) }));
    return [{ v: first(m.video_versions), i: cand(m) }];
  }
  function handle(text) {
    if (!text || text.length < 60 || !/"code"/.test(text)) return;
    const found = [];
    const tryParse = (t) => { try { walk(JSON.parse(t.replace(/^for \(;;\);/, '')), found, 0); return true; } catch (_) { return false; } };
    if (!tryParse(text)) text.split('\n').forEach((l) => l && l[0] === '{' && tryParse(l));
    const fresh = [];
    for (const m of found) {
      const it = items(m);
      const had = store[m.code];
      if (!had || (it.some((x) => x.v) && !had.some((x) => x.v))) { store[m.code] = it; fresh.push({ code: m.code, items: it }); }
    }
    if (fresh.length) document.dispatchEvent(new CustomEvent('aurora-ig-media', { detail: JSON.stringify(fresh) }));
  }

  const of = window.fetch;
  window.fetch = function () {
    const p = of.apply(this, arguments);
    try { p.then((r) => { if (r && r.ok && /instagram\.com/.test(r.url || '')) r.clone().text().then(handle).catch(() => {}); }).catch(() => {}); } catch (_) {}
    return p;
  };
  const xo = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => { try { if ((this.responseType === '' || this.responseType === 'text') && this.responseText) handle(this.responseText); } catch (_) {} });
    return xo.apply(this, arguments);
  };
  // the extractor asks for everything captured so far
  document.addEventListener('aurora-ig-replay', () => {
    const all = Object.keys(store).map((code) => ({ code, items: store[code] }));
    if (all.length) document.dispatchEvent(new CustomEvent('aurora-ig-media', { detail: JSON.stringify(all) }));
  });
})();
