/* Aurora Extract — TikTok video listener (MAIN world, document_start). TikTok's own page downloads each profile /
   hashtag / search video list as JSON; this only LISTENS to that data and remembers every video's file address
   so real videos can be saved. Nothing is sent anywhere. */
(function () {
  'use strict';
  if (window.__auroraTtSniff) return;
  window.__auroraTtSniff = true;
  const store = {};
  function walk(o, out, d) {
    if (!o || typeof o !== 'object' || d > 12) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, out, d + 1); return; }
    const v = o.video;
    if (v && typeof v === 'object' && (o.id || v.id) && (v.playAddr || v.downloadAddr || v.bitrateInfo)) out.push(o);
    for (const k in o) { const x = o[k]; if (x && typeof x === 'object') walk(x, out, d + 1); }
  }
  function slim(it) {
    const v = it.video || {};
    return { id: String(it.id || v.id), desc: it.desc, createTime: it.createTime, author: typeof it.author === 'string' ? it.author : (it.author && it.author.uniqueId) || '', stats: it.stats, music: it.music && { title: it.music.title },
      video: { duration: v.duration, cover: v.cover || v.originCover, downloadAddr: v.downloadAddr, playAddr: v.playAddr, bitrateInfo: (v.bitrateInfo || []).slice(0, 3).map((b) => ({ PlayAddr: { UrlList: ((b.PlayAddr && b.PlayAddr.UrlList) || []).slice(0, 2) } })) } };
  }
  function handle(text) {
    if (!text || text.length < 80 || !/"(playAddr|downloadAddr|bitrateInfo)"/.test(text)) return;
    let j; try { j = JSON.parse(text); } catch (_) { return; }
    const found = []; walk(j, found, 0);
    const fresh = [];
    for (const it of found) { const s = slim(it); if (!store[s.id] || (!store[s.id].video.downloadAddr && !store[s.id].video.playAddr)) { store[s.id] = s; fresh.push(s); } }
    if (fresh.length) document.dispatchEvent(new CustomEvent('aurora-tt-media', { detail: JSON.stringify(fresh) }));
  }
  const of = window.fetch;
  window.fetch = function () { const p = of.apply(this, arguments); try { p.then((r) => { if (r && r.ok && /tiktok\.com/.test(r.url || '')) r.clone().text().then(handle).catch(() => {}); }).catch(() => {}); } catch (_) {} return p; };
  const xo = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () { this.addEventListener('load', () => { try { if ((this.responseType === '' || this.responseType === 'text') && this.responseText) handle(this.responseText); } catch (_) {} }); return xo.apply(this, arguments); };
  document.addEventListener('aurora-tt-replay', () => { const all = Object.values(store); if (all.length) document.dispatchEvent(new CustomEvent('aurora-tt-media', { detail: JSON.stringify(all) })); });
})();
