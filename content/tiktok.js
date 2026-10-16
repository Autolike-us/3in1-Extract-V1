/* Aurora Extract — TikTok extractors. Reads the page's own embedded data (profile, video) and the visible
   lists (videos, comments, followers) with DOM fallbacks keyed on data-e2e attributes. */
(function () {
  'use strict';
  const A = globalThis.AuroraX;
  if (!A) return;

  function detect(u) {
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0] === 'tag' && seg[1]) return { label: '#' + decodeURIComponent(seg[1]), primary: 'hashtag', kinds: [{ id: 'hashtag', label: 'Hashtag videos' }] };
    if (seg[0] && seg[0].startsWith('@') && seg[1] === 'video') return { label: 'Video', primary: 'comments', kinds: [{ id: 'comments', label: 'Comments' }, { id: 'video', label: 'This video (with download)' }] };
    if (seg[0] && seg[0].startsWith('@')) return { label: seg[0], primary: 'profile', kinds: [{ id: 'profile', label: 'Profile & bio contact' }, { id: 'videos', label: 'Videos' }, { id: 'followers', label: 'Followers / following list' }] };
    if (seg[0] === 'search' || seg[0] === 'explore' || seg[0] === 'discover') return { label: 'Search / discover', primary: 'videos', kinds: [{ id: 'videos', label: 'Videos on screen' }] };
    return { label: 'TikTok', primary: null, kinds: [] };
  }

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
    return {
      id: it.id, url: `https://www.tiktok.com/@${(it.author && it.author.uniqueId) || it.author}/video/${it.id}`, author: (it.author && it.author.uniqueId) || it.author,
      description: desc, hashtags: (desc.match(/#[\p{L}\p{N}_]+/gu) || []), music: it.music && it.music.title,
      plays: +st.playCount || null, likes: +st.diggCount || null, comments: +st.commentCount || null, shares: +st.shareCount || null, saves: +st.collectCount || null,
      postedAt: it.createTime ? new Date(it.createTime * 1000).toISOString() : '', duration: v.duration,
      media: [url && { type: 'video', url }, v.cover && { type: 'image', url: v.cover }].filter(Boolean),
    };
  }

  /* ---------- tasks ---------- */
  async function profile(ctx) {
    const d = state()['webapp.user-detail'];
    if (d && d.userInfo) return void ctx.emit(mapUser(d.userInfo));
    // DOM fallback
    const name = A.txt(A.q('[data-e2e="user-title"]')), bio = A.txt(A.q('[data-e2e="user-bio"]'));
    const c = A.contacts(bio);
    ctx.emit({ id: location.pathname, username: name, name: A.txt(A.q('[data-e2e="user-subtitle"]')), url: location.href.split('?')[0], bio,
      followers: A.parseCount(A.txt(A.q('[data-e2e="followers-count"]'))), following: A.parseCount(A.txt(A.q('[data-e2e="following-count"]'))), likes: A.parseCount(A.txt(A.q('[data-e2e="likes-count"]'))),
      email: c.emails[0] || '', phone: c.phones[0] || '', website: A.txt(A.q('[data-e2e="user-link"]')) });
  }

  async function videos(ctx) {
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      let added = 0;
      for (const a of A.qa('a[href*="/video/"]')) {
        const m = a.href.match(/@([^/]+)\/video\/(\d+)/);
        if (!m || seen.has(m[2])) continue; seen.add(m[2]);
        const card = a.closest('[data-e2e="user-post-item"], [data-e2e="search_top-item"], [data-e2e="challenge-item"], div') || a;
        const img = A.q('img', card);
        const views = A.q('[data-e2e="video-views"]', card);
        added += ctx.emit({ id: m[2], url: a.href.split('?')[0], author: m[1], description: img ? img.alt : '', plays: views ? A.parseCount(A.txt(views)) : null, cover: img ? img.src : '', media: img ? [{ type: 'image', url: img.src }] : [] });
      }
      ctx.progress(); return added;
    });
  }

  async function video(ctx) {
    const d = state()['webapp.video-detail'];
    const it = d && d.itemInfo && d.itemInfo.itemStruct;
    if (!it) throw new Error('Video data not found on this page — reload the page and try again.');
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
        added += ctx.emit({ id: key, author, text, likes, postedAt: when, reply: el.getAttribute('data-e2e') === 'comment-level-2', postUrl: url });
      }
      ctx.progress(); return added;
    }, { patience: 6 });
  }

  async function followers(ctx) {
    const seen = new Set();
    const box = () => A.q('[data-e2e="follow-info-popup"]') || document;
    await A.scrollCollect(ctx, () => {
      let added = 0;
      for (const a of A.qa('a[href^="/@"]', box())) {
        const u = (a.getAttribute('href').match(/^\/@([^/?]+)/) || [])[1];
        if (!u || seen.has(u)) continue; seen.add(u);
        const row = a.closest('li, [data-e2e="user-item"], div') || a;
        added += ctx.emit({ id: u, username: u, name: A.txt(A.q('[data-e2e="follow-info-popup"] p, p', row)), url: 'https://www.tiktok.com/@' + u, avatar: (A.q('img', row) || {}).src || '' });
      }
      ctx.progress('Open the Followers or Following list first.'); return added;
    }, { container: A.q('[data-e2e="follow-info-popup"] ul, [data-e2e="follow-info-popup"]') || undefined, patience: 6 });
  }

  A.register('tiktok', {
    name: 'TikTok', hosts: /(^|\.)tiktok\.com$/, detect,
    kinds: ['profile', 'videos', 'video', 'comments', 'followers', 'hashtag'],
    tasks: { profile, videos, video, comments, followers, hashtag: videos },
    _test: { mapUser, mapVideo, detect },
  });
})();
