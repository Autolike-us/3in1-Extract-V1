/* Aurora Extract — TikTok extractors. Reads the page's own embedded data (profile, video) and the visible
   lists (videos, comments, followers) with DOM fallbacks keyed on data-e2e attributes. */
(function () {
  'use strict';
  const A = globalThis.AuroraX;
  if (!A) return;

  function detect(u) {
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0] === 'tag' && seg[1]) return { label: '#' + decodeURIComponent(seg[1]), primary: 'hashtag', kinds: [{ id: 'hashtag', label: 'Hashtag videos' }] };
    if (seg[0] && seg[0].startsWith('@') && seg[1] === 'video') return { label: 'Video', primary: 'comments', kinds: [{ id: 'comments', label: 'All comments' }, { id: 'commenters', label: 'People who commented' }, { id: 'video', label: 'This video (with download)' }] };
    if (seg[0] && seg[0].startsWith('@')) return { label: seg[0], primary: 'profile', kinds: [{ id: 'profile', label: 'Profile & bio contact' }, { id: 'videos', label: 'Videos (with files)' }, { id: 'followers', label: 'Followers' }, { id: 'following', label: 'Following' }] };
    if (seg[0] === 'search' || seg[0] === 'explore' || seg[0] === 'discover') return { label: 'Search / discover', primary: 'videos', kinds: [{ id: 'videos', label: 'Videos on screen' }] };
    return { label: 'TikTok', primary: null, kinds: [] };
  }

  /* video records captured from TikTok's own list requests (tt-sniffer.js) */
  const CAPTURED = {};
  document.addEventListener('aurora-tt-media', (e) => { try { for (const it of JSON.parse(e.detail)) CAPTURED[it.id] = it; } catch (_) {} });
  document.dispatchEvent(new CustomEvent('aurora-tt-replay'));

  function state() {
    const j = A.scriptJSON('__UNIVERSAL_DATA_FOR_REHYDRATION__') || A.scriptJSON('SIGI_STATE') || {};
    return j.__DEFAULT_SCOPE__ || j;
  }

  /* ---------- mapping ---------- */
  function mapUser(ui) {
    const u = ui.user || {}, s = ui.stats || ui.statsV2 || {};
    const bio = u.signature || '';
    const c = A.contacts(bio);
    return {
      id: u.id, username: u.uniqueId, name: u.nickname, url: 'https://www.tiktok.com/@' + u.uniqueId, bio,
      verified: !!u.verified, private: !!u.privateAccount, business: !!(u.commerceUserInfo && u.commerceUserInfo.commerceUser),
      category: (u.commerceUserInfo && u.commerceUserInfo.category) || '',
      followers: +s.followerCount || null, following: +s.followingCount || null, likes: +s.heartCount || +s.heart || null, videos: +s.videoCount || null,
      email: c.emails[0] || '', phone: c.phones[0] || '', website: (u.bioLink && u.bioLink.link) || '', region: u.region || '',
      avatar: u.avatarLarger, media: u.avatarLarger ? [{ type: 'image', url: u.avatarLarger }] : [],
    };
  }
  function mapVideo(it) {
    const v = it.video || {}, st = it.stats || {};
    const url = v.downloadAddr || v.playAddr || (v.bitrateInfo && v.bitrateInfo[0] && v.bitrateInfo[0].PlayAddr && v.bitrateInfo[0].PlayAddr.UrlList[0]) || '';
    const desc = it.desc || '';
    const au = typeof it.author === 'string' ? it.author : (it.author && it.author.uniqueId) || '';
    return {
      id: it.id, url: au ? `https://www.tiktok.com/@${au}/video/${it.id}` : '', author: au,
      description: desc, hashtags: (desc.match(/#[\p{L}\p{N}_]+/gu) || []), music: it.music && it.music.title,
      plays: +st.playCount || null, likes: +st.diggCount || null, comments: +st.commentCount || null, shares: +st.shareCount || null, saves: +st.collectCount || null,
      postedAt: it.createTime ? new Date(it.createTime * 1000).toISOString() : '', duration: v.duration,
      media: [url && { type: 'video', url }, v.cover && { type: 'image', url: v.cover }].filter(Boolean),
    };
  }

  /* ---------- page data (TikTok is a single-page app: the embedded JSON goes stale after in-app navigation) ---------- */
  function parseState(html) {
    const m = html.match(/<script[^>]+id="(?:__UNIVERSAL_DATA_FOR_REHYDRATION__|SIGI_STATE)"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return { __none: 'no state script' };
    try { const j = JSON.parse(m[1]); return j.__DEFAULT_SCOPE__ || j; } catch (_) { return { __none: 'state not JSON' }; }
  }
  /** Embedded state if it matches what the URL says we're on, otherwise a fresh copy of this page. */
  async function freshState(ok, ctx) {
    let st = state();
    if (ok(st)) return st;
    ctx.log('info', 'embedded page data is stale (in-app navigation) — reloading page data');
    const r = await fetch(location.href.split('?')[0], { credentials: 'include' });
    st = parseState(await r.text());
    return st;
  }
  const handleHere = () => decodeURIComponent((location.pathname.match(/^\/@([^/]+)/) || [])[1] || '');
  const videoIdHere = () => (location.pathname.match(/\/video\/(\d+)/) || [])[1] || '';

  /* ---------- tasks ---------- */
  async function profile(ctx) {
    const h = handleHere().toLowerCase();
    const st = await freshState((x) => { const u = x['webapp.user-detail'] && x['webapp.user-detail'].userInfo && x['webapp.user-detail'].userInfo.user; return u && String(u.uniqueId).toLowerCase() === h; }, ctx);
    const d = st['webapp.user-detail'];
    if (d && d.userInfo && d.userInfo.user && String(d.userInfo.user.uniqueId).toLowerCase() === h) return void ctx.emit(mapUser(d.userInfo));
    ctx.log('warn', 'profile data not in page — reading the header instead');
    const name = A.txt(A.q('[data-e2e="user-title"]')), bio = A.txt(A.q('[data-e2e="user-bio"]'));
    const c = A.contacts(bio);
    ctx.emit({ id: location.pathname, username: name || h, name: A.txt(A.q('[data-e2e="user-subtitle"]')), url: location.href.split('?')[0], bio,
      followers: A.parseCount(A.txt(A.q('[data-e2e="followers-count"]'))), following: A.parseCount(A.txt(A.q('[data-e2e="following-count"]'))), likes: A.parseCount(A.txt(A.q('[data-e2e="likes-count"]'))),
      email: c.emails[0] || '', phone: c.phones[0] || '', website: A.txt(A.q('[data-e2e="user-link"]')) });
  }

  /** The grid that belongs to THIS page (profile videos / hashtag / search) — never the whole document, which also holds
   *  suggested videos, the activity inbox and side panels. */
  const GRIDS = ['[data-e2e="user-post-item-list"]', '[data-e2e="challenge-item-list"]', '[data-e2e="search_top-item-list"]', '[data-e2e="search-card-item-list"]', '[data-e2e="search_video-item-list"]', '[data-e2e="explore-item-list"]'];
  const ITEMS = '[data-e2e="user-post-item"], [data-e2e="challenge-item"], [data-e2e="search_top-item"], [data-e2e="search-card-item"], [data-e2e="search_video-item"], [data-e2e="explore-item"]';
  function findGrid() {
    for (const g of GRIDS) { const el = A.q(g); if (el) return { el, via: g }; }
    const item = A.q(ITEMS);
    if (item && item.parentElement) return { el: item.parentElement, via: 'item-parent' };
    return null;
  }
  const idFromHref = (h) => { const m = h.match(/\/@([^/?]+)\/video\/(\d+)/); return m ? { user: decodeURIComponent(m[1]), id: m[2] } : null; };

  /** Open a video's own page data and return the full record (real author, stats, downloadable file). */
  async function videoRecord(handle, id) {
    const r = await fetch(`https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${id}`, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    const st = parseState(html);
    let it = st['webapp.video-detail'] && st['webapp.video-detail'].itemInfo && st['webapp.video-detail'].itemInfo.itemStruct;
    if ((!it || String(it.id) !== String(id)) && st.ItemModule && st.ItemModule[id]) it = st.ItemModule[id];
    if (!it || String(it.id) !== String(id)) {
      const vd = st['webapp.video-detail'];
      throw new Error(`video data not found (html ${html.length}b, ${st.__none || 'scopes: ' + Object.keys(st).slice(0, 6).join('/')}${vd && vd.statusCode != null ? ', status ' + vd.statusCode : ''}${/captcha|verify/i.test(html.slice(0, 5000)) ? ', verification page' : ''})`);
    }
    return mapVideo(it);
  }

  async function videos(ctx) {
    const grid = findGrid();
    if (!grid) throw new Error("Couldn't find the video grid on this page. Open a profile's Videos tab, a hashtag page or search results, then try again.");
    ctx.log('info', 'video grid found via ' + grid.via, `items=${A.qa(ITEMS).length}`);
    const pageHandle = handleHere();
    const wantMedia = ctx.opts.media !== false;
    const seen = new Set();
    let fails = 0, noFile = 0;
    await A.scrollCollect(ctx, () => {
      const fresh = [];
      const g = findGrid() || grid;
      for (const a of A.qa('a[href*="/video/"]', g.el)) {
        const k = idFromHref(a.href); if (!k || seen.has(k.id)) continue; seen.add(k.id);
        const card = a.closest(ITEMS) || a.parentElement || a;
        const img = A.q('img', card), views = A.q('[data-e2e="video-views"]', card);
        const handle = /^\d+$/.test(k.user) && pageHandle ? pageHandle : k.user;
        fresh.push({ id: k.id, url: `https://www.tiktok.com/@${handle}/video/${k.id}`, author: handle, description: img ? img.alt : '', plays: views ? A.parseCount(A.txt(views)) : null, thumb: img ? img.src : '', media: img ? [{ type: 'image', url: img.src }] : [] });
      }
      return fresh;
    }, { async: true, process: async (fresh) => {
      let added = 0;
      for (const row of fresh) {
        if (ctx.stopped() || ctx.count() >= ctx.limit) break;
        if (wantMedia && (CAPTURED[row.id] || fails < 3)) {
          try {
            const rec = CAPTURED[row.id] ? mapVideo(CAPTURED[row.id]) : await videoRecord(row.author, row.id);
            Object.assign(row, { ...rec, id: row.id, url: rec.url || row.url, thumb: row.thumb });
            if (!rec.media.some((m) => m.type === 'video')) { noFile++; row.videoMissing = true; }
            else ctx.log('info', 'video file ok via ' + (CAPTURED[row.id] ? 'page data' : 'video page'));
            fails = 0;
          } catch (e) { fails++; noFile++; row.videoMissing = true; ctx.log('warn', 'could not load video data: ' + e.message, fails >= 3 ? 'giving up on video files for this run — thumbnails only' : ''); }
          if (!CAPTURED[row.id]) await ctx.pause();
        } else if (wantMedia) { noFile++; row.videoMissing = true; }
        added += ctx.emit(row);
        ctx.progress();
      }
      return added;
    } });
    if (noFile && ctx.setWarning) ctx.setWarning(`${noFile} video${noFile > 1 ? 's' : ''} saved as a cover picture only — TikTok didn't expose the file. Reload the profile page, scroll down once so the videos load, then run again.`);
  }

  async function video(ctx) {
    const id = videoIdHere();
    const st = await freshState((x) => { const it = x['webapp.video-detail'] && x['webapp.video-detail'].itemInfo && x['webapp.video-detail'].itemInfo.itemStruct; return it && String(it.id) === id; }, ctx);
    const it = st['webapp.video-detail'] && st['webapp.video-detail'].itemInfo && st['webapp.video-detail'].itemInfo.itemStruct;
    if (!it || String(it.id) !== id) throw new Error('Video data not found on this page — reload the page and try again.');
    ctx.emit(mapVideo(it));
  }

  async function comments(ctx) {
    const url = location.href.split('?')[0];
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      for (const b of A.qa('[data-e2e^="view-more"], [data-e2e="view-more-1"]')) { try { b.click(); } catch (_) {} }
      let added = 0;
      for (const el of A.qa('[data-e2e="comment-level-1"], [data-e2e="comment-level-2"]')) {
        const box = el.closest('[class*="CommentItem"]') || el.parentElement;
        const author = A.txt(A.q('[data-e2e^="comment-username"]', box)) || A.txt(A.q('a[href^="/@"]', box));
        const text = A.txt(el);
        const key = author + text;
        if (!text || seen.has(key)) continue; seen.add(key);
        const when = A.txt(A.q('[data-e2e^="comment-time"]', box));
        const likes = A.parseCount(A.txt(A.q('[data-e2e^="comment-like-count"]', box)));
        const ah = A.q('a[href^="/@"]', box); added += ctx.emit({ id: key, author, authorUrl: ah ? A.abs(ah.getAttribute('href')).split('?')[0] : '', text, likes, postedAt: when, reply: el.getAttribute('data-e2e') === 'comment-level-2', postUrl: url });
      }
      ctx.progress(); return added;
    }, { patience: 6 });
  }

  async function commenters(ctx) { await A.commenters(ctx, comments); }

  /** Followers / following: ONLY rows inside the profile's list popup. */
  async function followList(ctx, which) {
    const popup = () => A.q('[data-e2e="follow-info-popup"]');
    let pop = popup();
    if (!pop) {
      const cnt = A.q(`[data-e2e="${which}-count"]`);
      const target = cnt && (cnt.closest(`[data-e2e="${which}"]`) || cnt.closest('a, button, [role="button"]') || cnt.parentElement || cnt);
      ctx.log('info', `${which}: popup closed — ${target ? 'clicking the count' : 'count NOT found'}`);
      if (target) { target.click(); for (let i = 0; i < 20 && !pop; i++) { await A.sleep(300); pop = popup(); } }
    }
    if (!pop) throw new Error(`Couldn't open the ${which} list. Click "${which[0].toUpperCase() + which.slice(1)}" on the profile so the list pops up, then press Start again.`);
    const Which = which[0].toUpperCase() + which.slice(1);
    const tab = A.qa('[role="tab"], [data-e2e*="tab"], div, span, p', pop).find((e) => e.children.length < 3 && new RegExp('^' + Which + '\\b', 'i').test(A.txt(e)) && A.txt(e).length < 30 && e.getAttribute('aria-selected') !== 'true');
    if (tab && !A.qa('[aria-selected="true"]', pop).some((e) => new RegExp(which, 'i').test(A.txt(e)))) { tab.click(); await A.sleep(1200); }
    const box = A.qa('ul, div', pop).find((d) => d.scrollHeight > d.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(d).overflowY)) || undefined;
    ctx.log('info', `${which}: popup open`, `scrollable=${!!box} links=${A.qa('a[href^="/@"]', pop).length}`);
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      let added = 0;
      for (const a of A.qa('a[href^="/@"]', popup() || pop)) {
        const u = decodeURIComponent((a.getAttribute('href').match(/^\/@([^/?]+)/) || [])[1] || '');
        if (!u || seen.has(u)) continue; seen.add(u);
        const row = a.closest('li, [data-e2e="user-item"]') || a.parentElement.parentElement || a;
        const lines = (row.innerText || '').split('\n').map((x) => x.trim()).filter((x) => x && x !== u && !/^(follow|following|friends|remove|message)$/i.test(x));
        added += ctx.emit({ id: u, username: u, name: lines[0] || '', url: 'https://www.tiktok.com/@' + u, list: which, avatar: (A.q('img', row) || {}).src || '' });
      }
      ctx.progress(); return added;
    }, { container: box, patience: 6 });
  }

  A.register('tiktok', {
    name: 'TikTok', hosts: /(^|\.)tiktok\.com$/, detect,
    kinds: ['profile', 'videos', 'video', 'comments', 'commenters', 'followers', 'following', 'hashtag'],
    tasks: { profile, videos, video, comments, commenters, followers: (c) => followList(c, 'followers'), following: (c) => followList(c, 'following'), hashtag: videos },
    _test: { mapUser, mapVideo, detect },
  });
})();
