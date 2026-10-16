/* Aurora Extract — Instagram extractors. Uses the same web endpoints the Instagram site itself calls
   with your signed-in session (only what your account can already see), with DOM fallbacks. */
(function () {
  'use strict';
  const A = globalThis.AuroraX;
  if (!A) return;
  const APP_ID = '936619743392459';
  const cookie = (n) => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1] || '';
  const H = { 'x-ig-app-id': APP_ID, 'x-requested-with': 'XMLHttpRequest', 'x-asbd-id': '129477', 'x-ig-www-claim': (() => { try { return sessionStorage.getItem('www-claim-v2') || '0'; } catch (_) { return '0'; } })() };
  const csrf = cookie('csrftoken'); if (csrf) H['x-csrftoken'] = csrf;

  /* media addresses captured by ig-sniffer.js from Instagram's own page traffic */
  const CAPTURED = {};
  document.addEventListener('aurora-ig-media', (e) => { try { for (const m of JSON.parse(e.detail)) CAPTURED[m.code] = m.items; } catch (_) {} });
  document.dispatchEvent(new CustomEvent('aurora-ig-replay'));
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
    const j = await A.getJSON(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, H, { retries: 1, wait: 8000 });
    if (!j.data || !j.data.user) throw new Error('Profile not found or not visible to your account.');
    return j.data.user;
  }

  /** Try the site's own API; if it fails (rate limit, login, changed endpoint) and nothing was saved yet, read the page instead. */
  async function withFallback(ctx, what, api, dom) {
    try { await api(); if (ctx.count() > 0 || ctx.stopped()) return; ctx.log('warn', what + ': API returned no rows — reading the page instead'); }
    catch (e) {
      if (ctx.count() > 0) { ctx.log('warn', what + ': stopped early', e.message); throw new Error(`Stopped after ${ctx.count()} rows — ${e.message}. Wait a few minutes before running again.`); }
      ctx.log('warn', what + ': API failed (' + e.message + ') — reading the page instead');
      ctx.progress('Site limit reached — reading the page instead…');
    }
    await dom();
  }

  const OGC = /([\d.,]+[KMB]?)\s+Followers?,\s+([\d.,]+[KMB]?)\s+Following,\s+([\d.,]+[KMB]?)\s+Posts?/i;
  async function profileDom(ctx) {
    const og = A.meta('og:description'), m = og.match(OGC), user = currentUser();
    const bio = A.txt(A.q('header section h1 ~ div, header section > div > span')) || '';
    const c = A.contacts(og + ' ' + bio + ' ' + A.txt(A.q('header')));
    ctx.emit({ id: user, username: user, name: (A.meta('og:title').match(/^(.*?)\s*\(@/) || [])[1] || '', url: location.href.split('?')[0], bio,
      followers: m ? A.parseCount(m[1]) : null, following: m ? A.parseCount(m[2]) : null, posts: m ? A.parseCount(m[3]) : null, email: c.emails[0] || '', phone: c.phones[0] || '',
      website: (A.q('header a[href*="l.instagram.com"]') || {}).textContent || '', avatar: (A.q('header img') || {}).src || '' });
  }
  async function profile(ctx) { await withFallback(ctx, 'profile', async () => ctx.emit(mapProfile(await fetchProfile(currentUser()))), () => profileDom(ctx)); }

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

  const unesc = (t) => t.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const fromItems = (items) => A.dedupeMedia([].concat(...items.map((x) => (x.v ? [{ type: 'video', url: x.v }] : x.i ? [{ type: 'image', url: x.i }] : []))));
  const codeOf = (u) => (u.match(/\/(?:p|reel|tv)\/([^/?]+)/) || [])[1];

  /** Real media for one post/reel. Tries, in order: what Instagram's own page already loaded, the media API,
   *  the embed page, then the post page itself. Returns { media, caption, via }. */
  async function enrichPost(url, ctx) {
    const code = codeOf(url), isReel = /\/(reel|tv)\//.test(url);
    const good = (m) => m.length && (!isReel || m.some((x) => x.type === 'video'));
    if (CAPTURED[code]) { const m = fromItems(CAPTURED[code]); if (good(m)) return { media: m, via: 'page-data' }; }
    try {
      const j = await A.getJSON(`https://www.instagram.com/api/v1/media/${shortcodeToId(code)}/info/`, H, { retries: 0 });
      const it = j.items && j.items[0];
      if (it) { const m = mediaOf(it); if (good(m)) return { media: m, caption: (it.caption && it.caption.text) || '', via: 'api' }; }
    } catch (e) { ctx.log('warn', 'media api: ' + e.message); }
    try {
      const html = await (await fetch(`https://www.instagram.com/${isReel ? 'reel' : 'p'}/${code}/embed/captioned/`, { credentials: 'include' })).text();
      const out = [];
      for (const m of html.matchAll(/"video_url":"([^"]+)"/g)) out.push({ type: 'video', url: unesc(m[1]) });
      for (const m of html.matchAll(/<video[^>]+src="([^"]+)"/g)) out.push({ type: 'video', url: unesc(m[1]) });
      if (!out.length) { for (const m of html.matchAll(/"display_url":"([^"]+)"/g)) out.push({ type: 'image', url: unesc(m[1]) }); const im = html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/); if (im) out.push({ type: 'image', url: unesc(im[1]) }); }
      const m = A.dedupeMedia(out); if (good(m)) return { media: m, via: 'embed' };
      ctx.log('warn', 'embed page had no ' + (isReel ? 'video' : 'media'), `len=${html.length}`);
    } catch (e) { ctx.log('warn', 'embed: ' + e.message); }
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    const html = await r.text();
    const out = [];
    for (const m of html.matchAll(/"video_versions":\[\{[^\]]*?"url":"([^"]+)"/g)) out.push({ type: 'video', url: unesc(m[1]) });
    const og = html.match(/property="og:video(?::secure_url)?" content="([^"]+)"/);
    if (!out.length && og) out.push({ type: 'video', url: unesc(og[1]) });
    if (!out.length) {
      for (const m of html.matchAll(/"display_url":"([^"]+)"/g)) out.push({ type: 'image', url: unesc(m[1]) });
      const oi = html.match(/property="og:image" content="([^"]+)"/);
      if (!out.length && oi) out.push({ type: 'image', url: unesc(oi[1]) });
    }
    const cap = html.match(/property="og:title" content="([^"]*)"/);
    return { media: A.dedupeMedia(out).slice(0, 12), caption: cap ? unesc(cap[1]) : '', via: 'page-html' };
  }

  async function gridDom(ctx, tag) {
    const seen = new Set();
    const wantMedia = ctx.opts.media !== false;
    let fails = 0, noVideo = 0;
    await A.scrollCollect(ctx, () => {
      const fresh = [];
      const scope = A.q('main') || document;
      for (const a of A.qa('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]', scope)) {
        if (a.closest('[role="dialog"], aside, nav')) continue; // suggestions, pop-ups, side menus are not this page's posts
        const url = A.abs(a.getAttribute('href')).split('?')[0];
        if (seen.has(url)) continue; seen.add(url);
        const img = A.q('img', a);
        fresh.push({ id: url, url, ...(tag ? { hashtag: '#' + tag } : { author: currentUser() }), type: /\/(reel|tv)\//.test(url) ? 'reel' : 'post', caption: img ? img.alt : '', thumb: img ? img.src : '', media: img ? [{ type: 'image', url: img.src }] : [] });
      }
      return fresh;
    }, { async: true, process: async (fresh) => {
      let added = 0;
      for (const row of fresh) {
        if (ctx.stopped() || ctx.count() >= ctx.limit) break;
        if (wantMedia && fails < 3) {
          try {
            const e = await enrichPost(row.url, ctx);
            if (e.media.length) row.media = e.media;
            if (e.caption && !row.caption) row.caption = e.caption;
            if (row.type === 'reel' && !e.media.some((m) => m.type === 'video')) { row.videoMissing = true; noVideo++; ctx.log('warn', 'no video file found for a reel (tried page data, API, embed, page)'); }
            else ctx.log('info', `media ok via ${e.via}`, e.media.map((m) => m.type).join(','));
            fails = 0;
          } catch (err) { fails++; ctx.log('warn', 'could not load post media: ' + err.message, fails >= 3 ? 'giving up on media for this run — thumbnails only' : ''); }
          await ctx.pause();
        }
        added += ctx.emit(row);
        ctx.progress();
      }
      return added;
    } });
    if (noVideo && ctx.setWarning) ctx.setWarning(`${noVideo} reel${noVideo > 1 ? 's' : ''} saved as a picture only — Instagram didn't expose the video file. Reload the profile, scroll down so the reels load, then run again (rows marked videoMissing).`);
  }
  async function posts(ctx) {
    const user = currentUser();
    await withFallback(ctx, 'posts', () => paged(ctx, (t) => `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(user)}/username/?count=12${t ? '&max_id=' + t : ''}`, (j) => j.items, mapPost), () => gridDom(ctx));
  }

  function idFromPage() {
    for (const sc of A.qa('script')) {
      const t = sc.textContent || '';
      if (t.length < 100) continue;
      const m = t.match(/"(?:profile_id|target_id)":"(\d{5,})"/);
      if (m) return m[1];
    }
    return null;
  }
  async function userId() { return idFromPage() || (await fetchProfile(currentUser())).id; }
  const RESERVED_HANDLE = /^(p|reel|reels|tv|explore|accounts|direct|stories|about|legal|web)$/i;
  function findListLink(which) {
    const re = new RegExp('/' + which + '/?$');
    return A.qa('a[href]').find((a) => re.test(a.getAttribute('href') || '')) || A.qa('header a, header li, main header *').find((e) => new RegExp('\\b' + which + '\\b', 'i').test(A.txt(e)) && A.txt(e).length < 30 && (e.tagName === 'A' || e.closest('a')));
  }
  async function listDom(ctx, which) {
    let dlg = A.q('[role="dialog"]');
    if (!dlg) {
      const link = findListLink(which);
      ctx.log('info', `${which}: link ${link ? 'found' : 'NOT found'}`, link ? '' : 'follow-ish hrefs: ' + A.qa('a[href*="follow"]').slice(0, 8).map((a) => a.getAttribute('href').replace(/^\/[^/]+/, '/<user>')).join(' , '));
      if (link) { (link.closest('a') || link).click(); for (let i = 0; i < 20 && !dlg; i++) { await A.sleep(300); dlg = A.q('[role="dialog"]'); } }
    }
    if (!dlg) throw new Error(`Couldn't open the ${which} list. Click "${which}" on the profile yourself so the list pops up, then press Start again.`);
    if (!new RegExp(which, 'i').test((dlg.innerText || '').slice(0, 200))) throw new Error(`A pop-up is open, but it isn't the ${which} list. Close it, then press Start again.`);
    ctx.log('info', `${which}: dialog open`);
    const box = A.qa('div', dlg).find((d) => d.scrollHeight > d.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(d).overflowY)) || undefined;
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      let added = 0;
      for (const a of A.qa('a[href^="/"]', dlg)) {
        const m = (a.getAttribute('href') || '').match(/^\/([\w.]+)\/?$/);
        if (!m || RESERVED_HANDLE.test(m[1]) || seen.has(m[1])) continue; seen.add(m[1]);
        const row = a.parentElement.parentElement.parentElement || a;
        const lines = (row.innerText || '').split('\n').map((x) => x.trim()).filter((x) => x && x !== m[1] && !/^(follow|following|remove|verified|message)$/i.test(x));
        added += ctx.emit({ id: m[1], username: m[1], name: lines[0] || '', profileUrl: 'https://www.instagram.com/' + m[1] + '/', avatar: (A.q('img', row) || {}).src || '' });
      }
      ctx.progress(); return added;
    }, { container: box, patience: 6 });
  }
  const listTask = (which) => async (ctx) => {
    try { await listDom(ctx, which); if (ctx.count() > 0 || ctx.stopped()) return; ctx.log('warn', which + ': dialog gave no rows — trying the API'); }
    catch (e) { if (ctx.count() > 0) throw e; ctx.log('warn', which + ': ' + e.message + ' — trying the API'); }
    try { const id = await userId(); await paged(ctx, (t) => `https://www.instagram.com/api/v1/friendships/${id}/${which}/?count=50${t ? '&max_id=' + t : ''}`, (j) => j.users, mapUserBrief); }
    catch (e) { throw new Error(`Couldn't read the ${which} list (${e.message}). Click "${which}" on the profile so the list pops up, then press Start again.`); }
  };

  function mediaIdHere() { const m = location.pathname.match(/\/(?:p|reel|tv)\/([^/]+)/); return m ? { code: m[1], id: shortcodeToId(m[1]) } : null; }
  async function post(ctx) {
    const m = mediaIdHere();
    await withFallback(ctx, 'post', async () => { const j = await A.getJSON(`https://www.instagram.com/api/v1/media/${m.id}/info/`, H); ctx.emit(mapPost(j.items[0])); }, async () => {
      const img = A.qa('article img').find((i) => i.width > 200);
      ctx.emit({ id: m.code, url: location.href.split('?')[0], caption: A.meta('og:title'), media: [A.meta('og:video') && { type: 'video', url: A.meta('og:video') }, A.meta('og:image') && { type: 'image', url: A.meta('og:image') }, img && { type: 'image', url: img.src }].filter(Boolean) });
    });
  }
  async function commentsDom(ctx) {
    const root = A.q('article') || A.q('main') || document;
    const seen = new Set();
    await A.scrollCollect(ctx, () => {
      for (const b of A.qa('button, [role="button"]', root)) if (/view (all )?\d* ?(more )?(replies|comments)|load more comments/i.test(A.txt(b))) { try { b.click(); } catch (_) {} }
      let added = 0;
      for (const li of A.qa('ul li, ul > div', root)) {
        const au = A.q('a[href^="/"][role="link"], h3 a, a[href^="/"]', li); const user = au ? (au.getAttribute('href').match(/^\/([\w.]+)\/?$/) || [])[1] : '';
        const text = A.qa('span[dir="auto"], span', li).map(A.txt).filter((t) => t && t !== user).sort((x, y) => y.length - x.length)[0] || '';
        if (!user || !text || seen.has(user + text)) continue; seen.add(user + text);
        added += ctx.emit({ id: user + ':' + text.slice(0, 40), author: user, text, postUrl: location.href.split('?')[0] });
      }
      ctx.progress(); return added;
    }, { patience: 6 });
  }
  async function comments(ctx) {
    const m = mediaIdHere();
    const url = `https://www.instagram.com/${location.pathname.split('/')[1]}/${m.code}/`;
    await withFallback(ctx, 'comments', () => paged(ctx, (t) => `https://www.instagram.com/api/v1/media/${m.id}/comments/?can_support_threading=true&permalink_enabled=false${t ? '&min_id=' + encodeURIComponent(t) : ''}`, (j) => j.comments, (c) => mapComment(c, url), { tokenKey: 'next_min_id' }), () => commentsDom(ctx));
  }
  async function hashtag(ctx) { await gridDom(ctx, decodeURIComponent(location.pathname.split('/')[3] || '')); }

  A.register('instagram', {
    name: 'Instagram', hosts: /(^|\.)instagram\.com$/, detect,
    kinds: ['profile', 'posts', 'followers', 'following', 'comments', 'post', 'hashtag'],
    tasks: { profile, posts, followers: listTask('followers'), following: listTask('following'), comments, post, hashtag },
    _test: { mapPost, mapProfile, mapComment, mapUserBrief, shortcodeToId, detect },
  });
})();
