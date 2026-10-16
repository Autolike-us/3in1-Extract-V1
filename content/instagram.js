/* Aurora Extract — Instagram extractors. Uses the same web endpoints the Instagram site itself calls
   with your signed-in session (only what your account can already see), with DOM fallbacks. */
(function () {
  'use strict';
  const A = globalThis.AuroraX;
  if (!A) return;
  const APP_ID = '936619743392459';
  const H = { 'x-ig-app-id': APP_ID, 'x-requested-with': 'XMLHttpRequest' };
  const NOT_USER = /^(p|reel|reels|tv|explore|accounts|direct|stories|about|developers|legal|web|challenge|oauth|emails|nametag|lite)$/i;

  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function shortcodeToId(sc) { let n = 0n; for (const ch of sc) n = n * 64n + BigInt(ALPHA.indexOf(ch)); return n.toString(); }

  function detect(u) {
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0] === 'explore' && seg[1] === 'tags') return { label: '#' + decodeURIComponent(seg[2] || ''), primary: 'hashtag', kinds: [{ id: 'hashtag', label: 'Hashtag posts' }] };
    if (['p', 'reel', 'tv'].includes(seg[0]) && seg[1]) return { label: 'Post / reel', primary: 'comments', kinds: [{ id: 'comments', label: 'Comments' }, { id: 'post', label: 'This post (with media)' }] };
    if (seg[0] && !NOT_USER.test(seg[0])) {
      const k = [{ id: 'profile', label: 'Profile & business contact' }, { id: 'posts', label: 'Posts & reels' }, { id: 'followers', label: 'Followers' }, { id: 'following', label: 'Following' }];
      return { label: '@' + seg[0], primary: 'profile', kinds: k };
    }
    return { label: 'Instagram', primary: null, kinds: [] };
  }
  const currentUser = () => (location.pathname.split('/').filter(Boolean)[0] || '').trim();

  /* ---------- mapping (pure, testable) ---------- */
  function bestImage(it) { const c = it && it.image_versions2 && it.image_versions2.candidates; return c && c[0] ? c[0].url : ''; }
  function mediaOf(it) {
    const out = [];
    const one = (m) => {
      if (m.video_versions && m.video_versions[0]) out.push({ type: 'video', url: m.video_versions[0].url });
      else if (bestImage(m)) out.push({ type: 'image', url: bestImage(m) });
    };
    if (it.carousel_media) it.carousel_media.forEach(one); else one(it);
    return A.dedupeMedia(out);
  }
  function mapPost(it) {
    const code = it.code || '';
    const caption = (it.caption && it.caption.text) || '';
    const tags = caption.match(/#[\p{L}\p{N}_]+/gu) || [];
    const mentions = caption.match(/@[\w.]+/g) || [];
    return {
      id: it.pk || it.id, url: code ? `https://www.instagram.com/${it.product_type === 'clips' ? 'reel' : 'p'}/${code}/` : '',
      type: it.product_type === 'clips' ? 'reel' : it.carousel_media ? 'carousel' : it.media_type === 2 ? 'video' : 'photo',
      author: it.user && it.user.username, caption, hashtags: tags, mentions,
      likes: it.like_count, comments: it.comment_count, plays: it.play_count || it.view_count || null,
      postedAt: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : '', location: it.location && it.location.name || '',
      media: mediaOf(it),
    };
  }
  function mapUserBrief(u) {
    return { id: u.pk || u.id, username: u.username, name: u.full_name, verified: !!u.is_verified, private: !!u.is_private, profileUrl: 'https://www.instagram.com/' + u.username + '/', avatar: u.profile_pic_url, media: u.profile_pic_url ? [{ type: 'image', url: u.profile_pic_url }] : [] };
  }
  function mapProfile(u) {
    const bio = u.biography || '';
    const c = A.contacts(bio);
    const email = u.public_email || u.business_email || '';
    const phone = u.public_phone_number ? `${u.public_phone_country_code ? '+' + u.public_phone_country_code + ' ' : ''}${u.public_phone_number}` : u.business_phone_number || '';
    return {
      id: u.id || u.pk, username: u.username, name: u.full_name, url: 'https://www.instagram.com/' + u.username + '/',
      bio, verified: !!u.is_verified, private: !!u.is_private, business: !!u.is_business_account || !!u.is_professional_account, category: u.category_name || u.category || '',
      followers: u.edge_followed_by ? u.edge_followed_by.count : u.follower_count, following: u.edge_follow ? u.edge_follow.count : u.following_count,
      posts: u.edge_owner_to_timeline_media ? u.edge_owner_to_timeline_media.count : u.media_count,
      email: email || c.emails[0] || '', phone: phone || c.phones[0] || '',
      website: u.external_url || (u.bio_links && u.bio_links[0] && u.bio_links[0].url) || '',
      address: u.business_address_json ? safeAddr(u.business_address_json) : '',
      avatar: u.profile_pic_url_hd || u.profile_pic_url,
      media: [u.profile_pic_url_hd || u.profile_pic_url].filter(Boolean).map((url) => ({ type: 'image', url })),
    };
  }
  function safeAddr(j) { try { const a = typeof j === 'string' ? JSON.parse(j) : j; return [a.street_address, a.city_name, a.zip_code].filter(Boolean).join(', '); } catch (_) { return ''; } }
  function mapComment(c, postUrl) {
    return { id: c.pk || c.id, author: c.user && c.user.username, authorName: c.user && c.user.full_name, text: c.text, likes: c.comment_like_count, replies: c.child_comment_count, postedAt: c.created_at ? new Date(c.created_at * 1000).toISOString() : '', postUrl };
  }

  /* ---------- tasks ---------- */
  async function fetchProfile(username) {
    const j = await A.getJSON(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, H);
    if (!j.data || !j.data.user) throw new Error('Profile not found or not visible to your account.');
    return j.data.user;
  }
  async function profile(ctx) { ctx.emit(mapProfile(await fetchProfile(currentUser()))); }

  async function paged(ctx, urlFn, pick, map, { startToken = '', tokenKey = 'next_max_id' } = {}) {
    let token = startToken;
    for (;;) {
      if (ctx.stopped() || ctx.count() >= ctx.limit) return;
      const j = await A.getJSON(urlFn(token), H);
      const items = pick(j) || [];
      ctx.emit(items.map(map));
      ctx.progress();
      token = j[tokenKey];
      if (!token || !items.length || j.more_available === false) return;
      await ctx.pause();
    }
  }
  async function posts(ctx) {
    const user = currentUser();
    await paged(ctx, (t) => `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(user)}/username/?count=12${t ? '&max_id=' + t : ''}`, (j) => j.items, mapPost);
  }
  async function userId() { return (await fetchProfile(currentUser())).id; }
  async function followers(ctx) { const id = await userId(); await paged(ctx, (t) => `https://www.instagram.com/api/v1/friendships/${id}/followers/?count=50${t ? '&max_id=' + t : ''}`, (j) => j.users, mapUserBrief); }
  async function following(ctx) { const id = await userId(); await paged(ctx, (t) => `https://www.instagram.com/api/v1/friendships/${id}/following/?count=50${t ? '&max_id=' + t : ''}`, (j) => j.users, mapUserBrief); }

  function mediaIdHere() { const m = location.pathname.match(/\/(?:p|reel|tv)\/([^/]+)/); return m ? { code: m[1], id: shortcodeToId(m[1]) } : null; }
  async function post(ctx) {
    const m = mediaIdHere();
    const j = await A.getJSON(`https://www.instagram.com/api/v1/media/${m.id}/info/`, H);
    ctx.emit(mapPost(j.items[0]));
  }
  async function comments(ctx) {
    const m = mediaIdHere();
    const url = `https://www.instagram.com/${location.pathname.split('/')[1]}/${m.code}/`;
    await paged(ctx, (t) => `https://www.instagram.com/api/v1/media/${m.id}/comments/?can_support_threading=true&permalink_enabled=false${t ? '&min_id=' + encodeURIComponent(t) : ''}`, (j) => j.comments, (c) => mapComment(c, url), { tokenKey: 'next_min_id' });
  }
  async function hashtag(ctx) {
    const tag = decodeURIComponent(location.pathname.split('/')[3] || '');
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      let added = 0;
      for (const a of A.qa('a[href*="/p/"], a[href*="/reel/"]')) {
        const url = A.abs(a.getAttribute('href')).split('?')[0];
        if (seen.has(url)) continue; seen.add(url);
        const img = A.q('img', a);
        added += ctx.emit({ id: url, url, hashtag: '#' + tag, caption: img ? img.alt : '', media: img ? [{ type: 'image', url: img.src }] : [] });
      }
      ctx.progress(); return added;
    });
  }

  A.register('instagram', {
    name: 'Instagram', hosts: /(^|\.)instagram\.com$/, detect,
    kinds: ['profile', 'posts', 'followers', 'following', 'comments', 'post', 'hashtag'],
    tasks: { profile, posts, followers, following, comments, post, hashtag },
    _test: { mapPost, mapProfile, mapComment, mapUserBrief, shortcodeToId, detect },
  });
})();
