/* Aurora Extract — runs inside the Instagram page (MAIN world, document_start). It only LISTENS to the JSON
   Instagram's own page already downloads (feeds, reels, graphql) and remembers each post's photo / video file
   addresses so the extractor can save real videos instead of thumbnails. Nothing is sent anywhere. */
(function () {
  'use strict';
  if (window.__auroraSniff) return;
  window.__auroraSniff = true;
  const store = {}; // code -> [{v, i}]
  const stats = {}; // code -> post numbers + caption + date (for Aurora Audit)
  const profiles = {}; // username -> profile object as Instagram's page received it

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
  /** Post numbers (date, likes, comments, caption) and profile objects, from the same JSON. */
  function walkInfo(o, posts, profs, d) {
    if (!o || typeof o !== 'object' || d > 14) return;
    if (Array.isArray(o)) { for (const x of o) walkInfo(x, posts, profs, d + 1); return; }
    if (typeof o.code === 'string' && (o.taken_at || o.taken_at_timestamp) && ('like_count' in o || 'comment_count' in o || o.caption !== undefined)) posts.push(o);
    if (typeof o.username === 'string' && typeof o.biography === 'string') profs.push(o);
    for (const k in o) { const v = o[k]; if (v && typeof v === 'object') walkInfo(v, posts, profs, d + 1); }
  }
  const slim = (m) => {
    const cap = m.caption && typeof m.caption === 'object' ? m.caption.text : m.caption;
    const owner = (m.user && m.user.username) || (m.owner && m.owner.username) || '';
    return { code: m.code, pk: m.pk || m.id || '', taken_at: +(m.taken_at || m.taken_at_timestamp) || 0, like_count: m.like_count != null ? m.like_count : null, comment_count: m.comment_count != null ? m.comment_count : null,
      play_count: m.play_count || m.view_count || m.video_view_count || null, media_type: m.media_type || 0, product_type: m.product_type || '', carousel: !!(m.carousel_media && m.carousel_media.length), caption: String(cap || '').slice(0, 2200), user: owner };
  };
  function handle(text) {
    if (!text || text.length < 60 || !/"code"|"biography"/.test(text)) return;
    const found = [], posts = [], profs = [];
    const tryParse = (t) => { try { const j = JSON.parse(t.replace(/^for \(;;\);/, '')); walk(j, found, 0); walkInfo(j, posts, profs, 0); return true; } catch (_) { return false; } };
    if (!tryParse(text)) text.split('\n').forEach((l) => l && l[0] === '{' && tryParse(l));
    const fresh = [];
    for (const m of found) {
      const it = items(m);
      const had = store[m.code];
      if (!had || (it.some((x) => x.v) && !had.some((x) => x.v))) { store[m.code] = it; fresh.push({ code: m.code, items: it }); }
    }
    if (fresh.length) document.dispatchEvent(new CustomEvent('aurora-ig-media', { detail: JSON.stringify(fresh) }));
    const newStats = [];
    for (const p of posts) { const r = slim(p); if (!stats[r.code] || (r.like_count != null && stats[r.code].like_count == null)) { stats[r.code] = r; newStats.push(r); } }
    if (newStats.length) document.dispatchEvent(new CustomEvent('aurora-ig-stats', { detail: JSON.stringify(newStats) }));
    const newProf = {};
    for (const p of profs) { const k = p.username.toLowerCase(); if (!profiles[k] || Object.keys(p).length >= Object.keys(profiles[k]).length) { profiles[k] = p; newProf[k] = p; } }
    if (Object.keys(newProf).length) document.dispatchEvent(new CustomEvent('aurora-ig-profile', { detail: JSON.stringify(newProf) }));
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
    const st = Object.keys(stats).map((c) => stats[c]);
    if (st.length) document.dispatchEvent(new CustomEvent('aurora-ig-stats', { detail: JSON.stringify(st) }));
    if (Object.keys(profiles).length) document.dispatchEvent(new CustomEvent('aurora-ig-profile', { detail: JSON.stringify(profiles) }));
  });
})();
