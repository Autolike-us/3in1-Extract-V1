// Offline extractor tests: DOM fixtures + mapped API payloads, with a stubbed chrome.* API.
const { launch, read, check, done } = require('./_pw.cjs');

const FB_POSTS = `
<div role="feed">
 <div role="article"><h3><a href="https://www.facebook.com/acme.cafe">Acme Café</a></h3>
  <a href="https://www.facebook.com/acme.cafe/posts/111?__cft__[0]=x"><span>2h</span></a>
  <div data-ad-preview="message"><div dir="auto">Fresh croissants! Order: hello@acme.cafe or +1 (555) 123-4567</div></div>
  <div aria-label="Like: 12 people">12</div><span>5 comments</span><span>2 shares</span>
  <img src="https://scontent.fbcdn.net/v/pic1.jpg" width="600" height="400"></div>
 <div role="article"><h3><a href="https://www.facebook.com/bob">Bob</a></h3>
  <a href="https://www.facebook.com/groups/9/posts/222/"><span>1d</span></a>
  <div dir="auto">Anyone selling a used bike?</div></div>
</div>`;
const FB_MARKET = `
<a href="/marketplace/item/1001/?ref=x"><img src="https://scontent.fbcdn.net/m1.jpg"><div>$250</div><div>Road bike</div><div>Austin, TX</div></a>
<a href="/marketplace/item/1002/"><img src="https://scontent.fbcdn.net/m2.jpg"><div>Free</div><div>Old sofa</div><div>Dallas, TX</div></a>`;
const FB_MEMBERS = `
<div role="list"><div role="listitem"><a href="https://www.facebook.com/groups/9/user/555/">Ana Silva</a><div>Works at Foo</div><img src="https://scontent.fbcdn.net/a.jpg"></div>
<div role="listitem"><a href="https://www.facebook.com/groups/9/user/556/">Li Wei</a></div></div>`;
const TT_PROFILE = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: { user: { id: '7', uniqueId: 'chef', nickname: 'Chef', signature: 'Biz: chef@food.com | WhatsApp +44 7700 900123', verified: true, bioLink: { link: 'https://food.com' }, avatarLarger: 'https://p16.tiktokcdn.com/a.jpg' }, stats: { followerCount: 1200, followingCount: 5, heartCount: 99999, videoCount: 40 } } } } })}</script>`;
const TT_VIDEO = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { id: '99', desc: 'Pasta #food #italy', author: { uniqueId: 'chef' }, createTime: 1700000000, stats: { playCount: 1000, diggCount: 50, commentCount: 3, shareCount: 1, collectCount: 2 }, video: { duration: 12, cover: 'https://p16.tiktokcdn.com/c.jpg', downloadAddr: 'https://v16.tiktokcdn.com/v.mp4' }, music: { title: 'Song' } } } } } })}</script>`;
const TT_COMMENTS = `<div class="CommentItem"><span data-e2e="comment-username-1">fan1</span><p data-e2e="comment-level-1">Love it! mail me a@b.io</p><span data-e2e="comment-time-1">2d</span><span data-e2e="comment-like-count">1.2K</span></div>
<div class="CommentItem"><span data-e2e="comment-username-1">fan2</span><p data-e2e="comment-level-1">Recipe pls</p></div>`;

const stub = () => { window.chrome = { runtime: { sendMessage: () => {}, onMessage: { addListener() {} } } }; };
function mkCtx(limit = 100) { return `(()=>{const rows=[];const ctx={opts:{},limit:${limit},stopped:()=>false,count:()=>rows.length,pause:()=>new Promise(r=>setTimeout(r,5)),emit(r){for(const x of [].concat(r)){if(rows.length<${limit}&&!rows.some(y=>(y.id&&y.id===x.id)))rows.push(x)}return 1},progress(){}};return {ctx,rows}})()`; }

(async () => {
  const browser = await launch();
  const ctx0 = await browser.newContext(); const pg = await ctx0.newPage(); pg.on('pageerror', (e) => { throw e; });
  const load = async (url, html, ...files) => {
    await pg.route('**/*', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><title>t</title></head><body>${html}</body></html>` }));
    await pg.goto(url); await pg.evaluate(stub);
    for (const f of files) await pg.addScriptTag({ content: read(f) });
  };
  const run = (platform, kind) => pg.evaluate(async ([p, k, mk]) => { const { ctx, rows } = eval(mk); await AuroraX.platforms[p].tasks[k](ctx); return rows; }, [platform, kind, mkCtx()]);
  const F = ['content/common.js'];

  // ---- common helpers
  await load('https://www.facebook.com/x', '', ...F);
  const common = await pg.evaluate(() => ({
    c1: AuroraX.parseCount('1.2K'), c2: AuroraX.parseCount('3,4 M'), c3: AuroraX.parseCount('12,345'), c4: AuroraX.parseCount('abc'), c5: AuroraX.parseCount('2.5M followers'),
    ct: AuroraX.contacts('Mail Me@Shop.com or call +1 (555) 123-4567 / 12345'),
  }));
  check('parseCount handles K/M and thousands separators', common.c1 === 1200 && common.c2 === 3400000 && common.c3 === 12345 && common.c4 === null && common.c5 === 2500000);
  check('contacts finds emails and phone numbers only when plausible', common.ct.emails[0] === 'me@shop.com' && common.ct.phones.length === 1 && /555/.test(common.ct.phones[0]));

  // ---- detection (all platforms)
  await load('https://www.facebook.com/x', '', ...F, 'content/facebook.js');
  const fbd = (u) => pg.evaluate((u) => AuroraX.platforms.facebook.detect(new URL(u)), u);
  check('FB detects group members', (await fbd('https://www.facebook.com/groups/123/members/')).primary === 'group_members');
  check('FB detects group feed', (await fbd('https://www.facebook.com/groups/123/')).primary === 'posts');
  check('FB detects marketplace results + listing', (await fbd('https://www.facebook.com/marketplace/austin/search?q=bike')).primary === 'marketplace_list' && (await fbd('https://www.facebook.com/marketplace/item/1/')).primary === 'marketplace_item');
  check('FB detects a page/profile and not reserved paths', (await fbd('https://www.facebook.com/acme.cafe')).primary === 'page_info' && (await fbd('https://www.facebook.com/watch/')).primary === null);
  check('FB detects a post', (await fbd('https://www.facebook.com/acme/posts/123')).primary === 'comments');

  // ---- facebook posts
  await load('https://www.facebook.com/groups/9', FB_POSTS, ...F, 'content/facebook.js');
  const fp = await run('facebook', 'posts');
  check('FB posts: two posts parsed', fp.length === 2);
  check('FB posts: author, clean permalink, text, date', fp[0].author === 'Acme Café' && fp[0].url === 'https://www.facebook.com/acme.cafe/posts/111' && /croissants/.test(fp[0].text) && fp[0].postedAt === '2h');
  check('FB posts: public email/phone in text found', fp[0].emailsInText[0] === 'hello@acme.cafe' && fp[0].phonesInText.length === 1);
  check('FB posts: counts + media', fp[0].comments === 5 && fp[0].shares === 2 && fp[0].media.length === 1);
  check('FB posts: fallback to dir=auto text', fp[1].text === 'Anyone selling a used bike?');

  // ---- facebook profile timeline without role="article": permalink-card fallback
  await load('https://www.facebook.com/profile.php?id=1', `<div role="main">
    <div><div><a href="https://www.facebook.com/profile.php?id=1&story_fbid=111&__cft__[0]=x"><span>3h</span></a><div dir="auto">First post here</div><img src="https://scontent.fbcdn.net/p1.jpg" width="500" height="500"></div></div>
    <div><div><a href="https://www.facebook.com/profile.php?id=1&story_fbid=222"><span>1d</span></a><div dir="auto">Second post here</div></div></div>
    <div><div><a href="https://www.facebook.com/someone/videos/333/"><span>2d</span></a><div dir="auto">A video post</div></div></div></div>`, ...F, 'content/facebook.js');
  const pf = await run('facebook', 'posts');
  check('FB profile: falls back to permalink cards (3 posts, not 1)', pf.length === 3 && /First post/.test(pf[0].text) && /Second post/.test(pf[1].text) && /video post/.test(pf[2].text));

  // ---- marketplace + members
  await load('https://www.facebook.com/marketplace/austin', FB_MARKET, ...F, 'content/facebook.js');
  const mk = await run('facebook', 'marketplace_list');
  check('Marketplace: ids, prices, titles, locations', mk.length === 2 && mk[0].id === '1001' && mk[0].price === '$250' && mk[0].title === 'Road bike' && mk[0].location === 'Austin, TX' && mk[1].price === 'Free');
  await load('https://www.facebook.com/groups/9/members', FB_MEMBERS, ...F, 'content/facebook.js');
  const mem = await run('facebook', 'group_members');
  check('Group members: ids + names + profile url', mem.length === 2 && mem[0].id === '555' && mem[0].name === 'Ana Silva' && mem[0].profileUrl.endsWith('/555') && /Foo/.test(mem[0].about));

  // ---- instagram mapping
  await load('https://www.instagram.com/shop/', '', ...F, 'content/instagram.js');
  const ig = await pg.evaluate(() => {
    const T = AuroraX.platforms.instagram._test;
    return {
      sc: T.shortcodeToId('B'), sc2: T.shortcodeToId('CxYz'),
      prof: T.mapProfile({ id: '1', username: 'shop', full_name: 'Shop', biography: 'Orders: sales@shop.com', is_business_account: true, category_name: 'Retail', edge_followed_by: { count: 900 }, edge_follow: { count: 10 }, edge_owner_to_timeline_media: { count: 33 }, public_phone_number: '5551234567', public_phone_country_code: '1', external_url: 'https://shop.com', profile_pic_url_hd: 'https://x/a.jpg' }),
      post: T.mapPost({ pk: '9', code: 'ABC', media_type: 8, caption: { text: 'Hi #sale @friend' }, like_count: 5, comment_count: 2, taken_at: 1700000000, user: { username: 'shop' }, carousel_media: [{ image_versions2: { candidates: [{ url: 'https://x/1.jpg' }] } }, { video_versions: [{ url: 'https://x/2.mp4' }], image_versions2: { candidates: [{ url: 'https://x/2.jpg' }] } }] }),
      det: ['/shop/', '/p/ABC/', '/explore/tags/cats/', '/explore/'].map((p) => T.detect(new URL('https://www.instagram.com' + p)).primary),
    };
  });
  check('IG shortcode → media id (base64 alphabet)', ig.sc === '1' && ig.sc2 === String(2n*64n**3n + 49n*64n**2n + 24n*64n + 51n));
  check('IG profile: business contact, followers, website', ig.prof.email === 'sales@shop.com' && ig.prof.phone === '+1 5551234567' && ig.prof.followers === 900 && ig.prof.business && ig.prof.website === 'https://shop.com');
  check('IG post: carousel media (image + video), hashtags, mentions', ig.post.type === 'carousel' && ig.post.media.length === 2 && ig.post.media[1].type === 'video' && ig.post.hashtags[0] === '#sale' && ig.post.mentions[0] === '@friend');
  check('IG detection', ig.det.join() === 'profile,comments,hashtag,');

  // ---- tiktok
  await load('https://www.tiktok.com/@chef', TT_PROFILE, ...F, 'content/tiktok.js');
  const tp = (await run('tiktok', 'profile'))[0];
  check('TikTok profile: stats, bio email/phone, link', tp.username === 'chef' && tp.followers === 1200 && tp.email === 'chef@food.com' && /7700/.test(tp.phone) && tp.website === 'https://food.com' && tp.verified);
  await load('https://www.tiktok.com/@chef/video/99', TT_VIDEO, ...F, 'content/tiktok.js');
  const tv = (await run('tiktok', 'video'))[0];
  check('TikTok video: stats, hashtags, downloadable media', tv.plays === 1000 && tv.hashtags.join() === '#food,#italy' && tv.media[0].type === 'video' && /v\.mp4/.test(tv.media[0].url) && tv.url.endsWith('/@chef/video/99'));
  await load('https://www.tiktok.com/@chef/video/99', TT_COMMENTS, ...F, 'content/tiktok.js');
  const tc = await run('tiktok', 'comments');
  check('TikTok comments: author, text, likes (1.2K), time', tc.length === 2 && tc[0].author === 'fan1' && tc[0].likes === 1200 && tc[0].postedAt === '2d' && /Love it/.test(tc[0].text));

  // ---- tiktok: only THIS page's grid; real video files; popup-only followers; stale SPA data
  const ttState = (id, user) => `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { id, desc: 'v' + id + ' #tag', author: { uniqueId: user }, createTime: 1700000000, stats: { playCount: 10 }, video: { duration: 5, cover: 'https://c/' + id + '.jpg', downloadAddr: 'https://v16.tiktokcdn.com/' + id + '.mp4' } } } } } })}</script>`;
  await load('https://www.tiktok.com/@chef', `
    <div id="side"><a href="/@7189418113942979589/video/9001"><img alt="stranger" src="https://x/s.jpg"></a><a href="/@someone/video/9002"><img alt="stranger2" src="https://x/s2.jpg"></a></div>
    <div data-e2e="user-post-item-list">
      <div data-e2e="user-post-item"><a href="https://www.tiktok.com/@chef/video/111"><img alt="mine1" src="https://x/m1.jpg"></a><strong data-e2e="video-views">1.5K</strong></div>
      <div data-e2e="user-post-item"><a href="https://www.tiktok.com/@chef/video/222"><img alt="mine2" src="https://x/m2.jpg"></a></div>
    </div>`, ...F, 'content/tiktok.js');
  const tv2 = await pg.evaluate(async (mkStates) => {
    AuroraX.sleep = () => Promise.resolve();
    window.fetch = async (u) => { const id = (u.match(/video\/(\d+)/) || [])[1]; return { ok: true, text: async () => mkStates[id] || '<html></html>' }; };
    const rows = []; const ctx = { opts: { media: true }, limit: 50, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, setWarning() {}, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } };
    await AuroraX.platforms.tiktok.tasks.videos(ctx);
    return rows;
  }, { 111: ttState('111', 'chef'), 222: ttState('222', 'chef') });
  check('TikTok videos: ONLY the profile grid (side-panel strangers ignored)', tv2.length === 2 && tv2.every((r) => r.author === 'chef') && tv2[0].id === '111');
  check('TikTok videos: real downloadable mp4 + stats merged in (not just the cover)', tv2[0].media[0].type === 'video' && /111\.mp4/.test(tv2[0].media[0].url) && tv2[0].plays === 10 && /#tag/.test(tv2[0].description));

  await load('https://www.tiktok.com/@chef', `<div data-e2e="inbox-list"><a href="/@fan1">fan1</a><p>replied to your comment: nice</p></div>`, ...F, 'content/tiktok.js');
  const noGrid = await pg.evaluate(async () => { const rows = []; const ctx = { opts: {}, limit: 5, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, progress() {}, emit() {} }; try { await AuroraX.platforms.tiktok.tasks.videos(ctx); return 'no error'; } catch (e) { return e.message; } });
  check('TikTok videos: no grid on the page → clear error, never scrapes the whole page', /find the video grid/.test(noGrid));

  await load('https://www.tiktok.com/@chef', `
    <div data-e2e="inbox"><a href="/@fan1">fan1</a><p>replied to your comment: Soy black pero</p><a href="/@fan2">fan2</a><p>Dejablackaf Drole and 2 others</p></div>
    <h2><span data-e2e="followers"><strong data-e2e="followers-count">12</strong> Followers</span></h2><div id="host"></div>`, ...F, 'content/tiktok.js');
  const flw = await pg.evaluate(async () => {
    AuroraX.sleep = () => new Promise((r) => setTimeout(r, 5));
    document.querySelector('[data-e2e="followers"]').addEventListener('click', () => { document.getElementById('host').innerHTML = '<div data-e2e="follow-info-popup"><div role="tab" aria-selected="true">Followers 2</div><ul><li><a href="/@ann"><img src="https://x/a.jpg"></a><div><p>ann</p><p>Ann Lee</p></div></li><li><a href="/@bo"></a><div><p>bo</p><p>Bo B</p></div></li></ul></div>'; });
    const rows = []; const ctx = { opts: {}, limit: 50, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } };
    await AuroraX.platforms.tiktok.tasks.followers(ctx);
    return rows;
  });
  check('TikTok followers: opens the popup itself and reads ONLY its profiles (inbox comments ignored)', flw.length === 2 && flw[0].username === 'ann' && flw[0].name === 'Ann Lee' && flw[1].username === 'bo' && flw.every((r) => r.list === 'followers'));
  const noPop = await pg.evaluate(async () => { document.getElementById('host').innerHTML = ''; document.querySelector('[data-e2e="followers-count"]').remove(); const ctx = { opts: {}, limit: 5, stopped: () => false, count: () => 0, pause: () => Promise.resolve(), log() {}, progress() {}, emit() {} }; try { await AuroraX.platforms.tiktok.tasks.followers(ctx); return 'no error'; } catch (e) { return e.message; } });
  check('TikTok followers: popup unavailable → clear error, no junk rows', /Couldn't open the followers list/.test(noPop));

  await load('https://www.tiktok.com/@chef/video/222', ttState('111', 'chef'), ...F, 'content/tiktok.js');
  const stale = await pg.evaluate(async (fresh) => {
    window.fetch = async () => ({ ok: true, text: async () => fresh });
    const rows = []; const ctx = { opts: {}, limit: 5, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, progress() {}, emit(r) { rows.push(r); return 1; } };
    await AuroraX.platforms.tiktok.tasks.video(ctx); return rows;
  }, ttState('222', 'chef'));
  check('TikTok video: stale embedded data (SPA navigation) is refreshed, correct video returned', stale.length === 1 && stale[0].id === '222');

  // ---- instagram: grid ignores suggestions/side panels; dialog must be the right one
  await load('https://www.instagram.com/shop/', `<main><a href="/p/MINE1/"><img alt="m" src="https://x/1.jpg"></a><a href="/reel/MINE2/"><img alt="m" src="https://x/2.jpg"></a></main><aside><a href="/p/SUGG/"><img alt="s" src="https://x/3.jpg"></a></aside><div role="dialog"><a href="/p/POP/"></a></div>`, ...F, 'content/instagram.js');
  const igGrid = await pg.evaluate(async () => { const rows = []; const ctx = { opts: { media: false }, limit: 20, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } }; await AuroraX.platforms.instagram.tasks.hashtag(ctx); return rows.map((r) => r.url.split('/').filter(Boolean).pop()); });
  check('IG grid: only the main content (sidebar suggestions and pop-ups ignored)', igGrid.join() === 'MINE1,MINE2');
  await load('https://www.instagram.com/shop/', `<a href="/shop/followers/">x</a><div role="dialog"><h1>Notifications</h1><a href="/zed/">zed</a></div>`, ...F, 'content/instagram.js');
  const wrongDlg = await pg.evaluate(async () => { const ctx = { opts: {}, limit: 5, stopped: () => false, count: () => 0, pause: () => Promise.resolve(), log() {}, progress() {}, emit() {} }; window.fetch = async () => { throw new Error('offline'); }; try { await AuroraX.platforms.instagram.tasks.followers(ctx); return 'no error'; } catch (e) { return e.message; } });
  check('IG followers: a different pop-up is never scraped as the list', /Couldn't read the followers list/.test(wrongDlg));

  // ---- new capabilities: detection, navigation shortcuts, people lists, commenters, reactors, group info
  await load('https://www.facebook.com/groups/9', '', ...F, 'content/facebook.js');
  const dets = await pg.evaluate(() => { const d = (u) => AuroraX.platforms.facebook.detect(new URL(u)); return { feed: d('https://www.facebook.com/groups/9/'), prof: d('https://www.facebook.com/acme.cafe'), pid: d('https://www.facebook.com/profile.php?id=55'), fr: d('https://www.facebook.com/acme.cafe/friends'), post: d('https://www.facebook.com/acme/posts/123'), mem: d('https://www.facebook.com/groups/9/members') }; });
  const ids = (d) => d.kinds.map((k) => k.id).join();
  check('FB group feed offers Group members (↗ opens the Members tab) + Group info + posts', ids(dets.feed) === 'posts,group_members,group_info,comments' && dets.feed.kinds[1].goto === 'https://www.facebook.com/groups/9/members');
  check('FB profile offers friends / followers / following lists with goto links', ids(dets.prof) === 'page_info,posts,people_friends,people_followers,people_following' && dets.prof.kinds[3].goto === 'https://www.facebook.com/acme.cafe/followers');
  check('FB profile.php?id= builds sk= links', dets.pid.kinds.find((k) => k.id === 'people_friends').goto === 'https://www.facebook.com/profile.php?id=55&sk=friends');
  check('FB friends page → people list; post page → comments, commenters, reactors', dets.fr.primary === 'people' && ids(dets.post) === 'comments,commenters,reactors,posts' && dets.mem.primary === 'group_members');

  await load('https://www.facebook.com/acme.cafe/friends', `<div role="main"><a href="https://www.facebook.com/acme.cafe/photos">Photos</a><a href="https://www.facebook.com/acme.cafe/friends">Friends</a>
    <div role="listitem"><a href="https://www.facebook.com/ana.silva"><img src="https://scontent.fbcdn.net/a.jpg"></a><a href="https://www.facebook.com/ana.silva">Ana Silva</a><div>Lives in Austin</div><a href="#">Add friend</a></div>
    <div role="listitem"><a href="https://www.facebook.com/profile.php?id=777">Li Wei</a></div></div><div><a href="https://www.facebook.com/sidebar.person">Sidebar Person</a></div>`, ...F, 'content/facebook.js');
  const ppl = await run('facebook', 'people');
  check('FB people list: names + profile links, no tabs/buttons/sidebar', ppl.length === 2 && ppl[0].name === 'Ana Silva' && ppl[0].profileUrl === 'https://www.facebook.com/ana.silva' && /Austin/.test(ppl[0].about) && ppl[1].profileUrl.endsWith('id=777') && ppl[0].list === 'friends');

  await load('https://www.facebook.com/acme/posts/123', `<div role="main"><span role="button" aria-label="See who reacted to this" id="rx">12</span></div><div id="host"></div>`, ...F, 'content/facebook.js');
  const rxn = await pg.evaluate(async () => {
    AuroraX.sleep = () => new Promise((r) => setTimeout(r, 5));
    document.getElementById('rx').addEventListener('click', () => { document.getElementById('host').innerHTML = '<div role="dialog"><div style="overflow-y:auto;height:80px"><div role="listitem"><a href="https://www.facebook.com/p.one">Pat One</a></div><div role="listitem"><a href="https://www.facebook.com/p.two">Pat Two</a></div></div></div>'; });
    const rows = []; const ctx = { opts: {}, limit: 20, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } };
    await AuroraX.platforms.facebook.tasks.reactors(ctx); return rows;
  });
  check('FB reactors: opens the reactions dialog and lists the people', rxn.length === 2 && rxn[0].name === 'Pat One' && rxn[0].list === 'reactions');

  await load('https://www.facebook.com/groups/9', `<div role="main"><h1>Austin Bikers</h1><div>Private group · 12,345 members</div></div><meta property="og:description" content="For riders">`, ...F, 'content/facebook.js');
  const gi = (await run('facebook', 'group_info'))[0];
  check('FB group info: name, member count, privacy', gi.name === 'Austin Bikers' && gi.members === 12345 && /Private group/i.test(gi.privacy));

  await load('https://www.tiktok.com/@chef/video/99', TT_COMMENTS + '<div class="CommentItem"><span data-e2e="comment-username-1">fan1</span><p data-e2e="comment-level-1">Second from fan1</p></div>', ...F, 'content/tiktok.js');
  const cm = await run('tiktok', 'commenters');
  check('TikTok commenters: one row per person with comment count, likes, sample (sorted)', cm.length === 2 && cm[0].username === 'fan1' && cm[0].comments === 2 && cm[0].likesOnComments === 1200 && /Love it/.test(cm[0].sample) && cm[1].comments === 1);

  await load('https://www.instagram.com/p/ABC/', '', ...F, 'content/instagram.js');
  const lk = await pg.evaluate(async () => {
    window.fetch = async (u) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(/likers/.test(u) ? { users: [{ pk: '1', username: 'u1', full_name: 'U One' }, { pk: '2', username: 'u2', is_verified: true }] } : { comments: [{ pk: 'c1', text: 'a', user: { username: 'zed', full_name: 'Zed' } }, { pk: 'c2', text: 'b', user: { username: 'zed' } }, { pk: 'c3', text: 'c', user: { username: 'amy' } }] }) });
    const mk = () => { const rows = []; return { rows, ctx: { opts: {}, limit: 50, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } } }; };
    const a = mk(); await AuroraX.platforms.instagram.tasks.likers(a.ctx);
    const b = mk(); await AuroraX.platforms.instagram.tasks.commenters(b.ctx);
    return { likers: a.rows, commenters: b.rows };
  });
  check('IG likers via API: users with profile links', lk.likers.length === 2 && lk.likers[1].verified === true && lk.likers[0].profileUrl.endsWith('/u1/'));
  check('IG commenters: aggregated per user with profile link', lk.commenters.length === 2 && lk.commenters[0].username === 'zed' && lk.commenters[0].comments === 2 && lk.commenters[0].profileUrl === 'https://www.instagram.com/zed/');

  // ---- facebook: feed that only grows when an INNER container scrolls (window doesn't) + video posts
  await load('https://www.facebook.com/profile.php?id=1', `<style>html,body{overflow:hidden;height:100%;margin:0}#sc{height:500px;overflow-y:auto}</style><div id="sc"><div role="main" id="feed"></div></div>
    <script id="d" type="application/json">{"__bbox":{"result":{"data":{"video":{"id":"5550001","playable_url":"https:\\/\\/video.fbcdn.net\\/sd.mp4?x=1\\u0026y=2","browser_native_hd_url":"https:\\/\\/video.fbcdn.net\\/hd.mp4?x=1\\u0026y=2"}}}}}</script>`, ...F, 'content/facebook.js');
  const scr = await pg.evaluate(async () => {
    AuroraX.sleep = () => new Promise((r) => setTimeout(r, 5));
    const feed = document.getElementById('feed'), sc = document.getElementById('sc'); let n = 0;
    const add = () => { for (let i = 0; i < 3 && n < 12; i++, n++) { const d = document.createElement('div'); d.setAttribute('role', 'article'); d.style.height = '300px'; d.innerHTML = n === 1 ? `<h3><a href="https://www.facebook.com/x">X</a></h3><a href="https://www.facebook.com/x/videos/5550001/"><span>1d</span></a><div dir="auto">video post ${n}</div><video></video>` : `<h3><a href="https://www.facebook.com/x">X</a></h3><a href="https://www.facebook.com/x/posts/${1000 + n}"><span>2h</span></a><div dir="auto">post number ${n}</div>`; feed.appendChild(d); } };
    add(); sc.addEventListener('scroll', () => { if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 700) add(); });
    const rows = []; let warning = ''; const logs = [];
    const ctx = { opts: {}, limit: 10, stopped: () => false, count: () => rows.length, pause: () => new Promise((r) => setTimeout(r, 15)), log: (l, m) => logs.push(m), setWarning: (w) => { warning = w; }, progress() {}, emit(r) { for (const x of [].concat(r)) if (rows.length < 10) rows.push(x); return 1; } };
    AuroraX.log = ctx.log;
    await AuroraX.platforms.facebook.tasks.posts(ctx);
    return { rows, logs, warning };
  });
  check('FB posts: finds the inner scroll container and reaches the limit (10, not 3)', scr.rows.length === 10);
  const vp = scr.rows.find((r) => /video post/.test(r.text));
  check('FB video post: real video file from page data (HD preferred, URL unescaped)', vp && vp.media[0].type === 'video' && vp.media[0].url === 'https://video.fbcdn.net/hd.mp4?x=1&y=2' && !vp.videoMissing);

  await load('https://www.facebook.com/x', '', ...F);
  await pg.evaluate(() => { const body = JSON.stringify({ data: { node: { __typename: 'Video', id: '777000111', browser_native_sd_url: 'https://v/sd.mp4', browser_native_hd_url: 'https://v/hd.mp4' } }, pad: 'x'.repeat(40) }); window.fetch = async () => ({ ok: true, url: 'https://www.facebook.com/api/graphql/', clone() { return { text: async () => body }; } }); });
  await pg.addScriptTag({ content: read('content/fb-sniffer.js') });
  const fbs = await pg.evaluate(async () => {
    const got = []; document.addEventListener('aurora-fb-media', (e) => got.push(...JSON.parse(e.detail)));
    await fetch('https://www.facebook.com/api/graphql/'); await new Promise((r) => setTimeout(r, 50));
    return got;
  });
  check('fb-sniffer reports each video id with its best (HD) file', fbs.length === 1 && fbs[0].id === '777000111' && fbs[0].url === 'https://v/hd.mp4');

  // ---- tiktok: sniffer + captured records give real files without any page fetch
  await load('https://www.tiktok.com/@chef', '', ...F);
  await pg.evaluate(() => { const body = JSON.stringify({ itemList: [{ id: '111', desc: 'a #x', author: { uniqueId: 'chef' }, createTime: 1700000000, stats: { playCount: 5 }, video: { duration: 9, cover: 'https://c/1.jpg', playAddr: 'https://v16.tiktokcdn.com/111.mp4', downloadAddr: '' } }, { id: '222', desc: 'b', author: { uniqueId: 'chef' }, video: { cover: 'https://c/2.jpg', bitrateInfo: [{ PlayAddr: { UrlList: ['https://v16.tiktokcdn.com/222.mp4'] } }] } }] }); window.fetch = async () => ({ ok: true, url: 'https://www.tiktok.com/api/post/item_list/', clone() { return { text: async () => body }; } }); });
  await pg.addScriptTag({ content: read('content/tt-sniffer.js') });
  const tts = await pg.evaluate(async () => {
    const got = []; document.addEventListener('aurora-tt-media', (e) => got.push(...JSON.parse(e.detail)));
    await fetch('https://www.tiktok.com/api/post/item_list/'); await new Promise((r) => setTimeout(r, 50));
    return got;
  });
  check('tt-sniffer captures every video in a list response', tts.length === 2 && tts[1].video.bitrateInfo[0].PlayAddr.UrlList[0].includes('222.mp4'));

  await load('https://www.tiktok.com/@chef', `<div data-e2e="user-post-item-list"><div data-e2e="user-post-item"><a href="https://www.tiktok.com/@chef/video/111"><img alt="a" src="https://x/1.jpg"></a></div><div data-e2e="user-post-item"><a href="https://www.tiktok.com/@chef/video/222"><img alt="b" src="https://x/2.jpg"></a></div></div>`, ...F, 'content/tiktok.js');
  const ttc = await pg.evaluate(async (items) => {
    AuroraX.sleep = () => Promise.resolve();
    document.dispatchEvent(new CustomEvent('aurora-tt-media', { detail: JSON.stringify(items) }));
    window.fetch = async () => { throw new Error('page fetch must not be needed'); };
    const rows = []; const ctx = { opts: { media: true }, limit: 5, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, setWarning() {}, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } };
    await AuroraX.platforms.tiktok.tasks.videos(ctx); return rows;
  }, tts);
  check('TikTok videos: real .mp4 from captured page data (no fetch), stats merged', ttc.length === 2 && ttc[0].media[0].type === 'video' && /111\.mp4/.test(ttc[0].media[0].url) && ttc[0].plays === 5 && /222\.mp4/.test(ttc[1].media[0].url));
  const diag = await pg.evaluate(async () => { document.dispatchEvent(new CustomEvent('x')); const logs = []; window.fetch = async () => ({ ok: true, text: async () => '<html><body>verify you are human captcha</body></html>' }); const rows = []; const ctx = { opts: { media: true }, limit: 5, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log: (l, m) => logs.push(m), setWarning(w) { logs.push('WARN ' + w); }, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } };
    document.body.innerHTML = '<div data-e2e="user-post-item-list"><div data-e2e="user-post-item"><a href="https://www.tiktok.com/@chef/video/999"><img alt="z" src="https://x/z.jpg"></a></div></div>';
    await AuroraX.platforms.tiktok.tasks.videos(ctx); return { logs, rows }; });
  check('TikTok videos: when no file is available it says why (page size, scopes, verification) and flags the row', /video data not found \(html \d+b/.test(diag.logs.join(' ')) && /verification page/.test(diag.logs.join(' ')) && diag.rows[0].videoMissing === true && diag.logs.some((l) => /^WARN .*cover picture only/.test(l)));

  // ---- instagram: API failure → page-reading fallback, reels resolve to real video files
  await load('https://www.instagram.com/shop/', `<a href="/p/AAA/"><img alt="Photo by shop" src="https://x/thumb1.jpg"></a><a href="/reel/BBB/"><img alt="Reel" src="https://x/thumb2.jpg"></a>`, ...F, 'content/instagram.js');
  const fb = await pg.evaluate(async () => {
    AuroraX.sleep = () => Promise.resolve();
    const logs = []; AuroraX.log = (l, m, d) => logs.push(l + ':' + m + ':' + (d || ''));
    const hdr = { get: () => null };
    window.fetch = async (u) => {
      if (/\/api\/v1\//.test(u)) return { ok: false, status: 429, headers: hdr, json: async () => ({}) };
      if (/reel\/BBB/.test(u)) return { ok: true, text: async () => '..."video_versions":[{"type":101,"url":"https:\\/\\/v.cdn\\/reel.mp4?a=1\\u0026b=2","width":720}],"display_url":"https:\\/\\/x\\/full.jpg"...' };
      return { ok: true, text: async () => '"display_url":"https:\\/\\/x\\/full1.jpg","display_url":"https:\\/\\/x\\/full2.jpg"' };
    };
    const rows = []; const ctx = { opts: { media: true }, limit: 50, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log: AuroraX.log, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } };
    await AuroraX.platforms.instagram.tasks.posts(ctx);
    return { rows, logs };
  });
  check('IG posts: 429 is retried then falls back to reading the grid', fb.rows.length === 2 && fb.logs.some((l) => /HTTP 429/.test(l)) && fb.logs.some((l) => /reading the page instead/.test(l)));
  check('IG reel resolves to the real .mp4 (not the thumbnail), unescaped', fb.rows[1].media[0].type === 'video' && fb.rows[1].media[0].url === 'https://v.cdn/reel.mp4?a=1&b=2');
  check('IG photo resolves to full-size images (carousel aware)', fb.rows[0].media.length === 2 && fb.rows[0].media[0].url === 'https://x/full1.jpg');

  // ---- instagram: video addresses captured from Instagram's own page traffic
  await load('https://www.instagram.com/shop/', `<a href="/reel/RRR/"><img alt="r" src="https://x/t.jpg"></a><a href="/reel/NNN/"><img alt="n" src="https://x/t2.jpg"></a>`, ...F, 'content/instagram.js');
  const cap = await pg.evaluate(async () => {
    AuroraX.sleep = () => Promise.resolve();
    document.dispatchEvent(new CustomEvent('aurora-ig-media', { detail: JSON.stringify([{ code: 'RRR', items: [{ v: 'https://v.cdn/captured.mp4', i: 'https://x/c.jpg' }] }]) }));
    const logs = []; AuroraX.log = (l, m, d) => logs.push(m);
    window.fetch = async (u) => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>nothing here</html>', json: async () => ({}) });
    const rows = []; let warning = ''; const ctx = { opts: { media: true }, limit: 50, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log: AuroraX.log, setWarning: (w) => { warning = w; }, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } };
    await AuroraX.platforms.instagram.tasks.hashtag(ctx);
    return { rows, warning, logs };
  });
  check('IG reel video comes from captured page data (no extra request)', cap.rows[0].media[0].type === 'video' && cap.rows[0].media[0].url === 'https://v.cdn/captured.mp4');
  check('IG reel with no video anywhere is flagged + warning shown', cap.rows[1].videoMissing === true && /saved as a picture only/.test(cap.warning));

  // ---- ig-sniffer (MAIN world): listens to Instagram's own JSON and reports video/photo addresses
  await load('https://www.instagram.com/shop/', '', ...F);
  await pg.evaluate(() => {
    const body = JSON.stringify({ data: { xdt_feed: { edges: [{ node: { code: 'AAA', video_versions: [{ url: 'https://v/a.mp4' }], image_versions2: { candidates: [{ url: 'https://i/a.jpg' }] } } }, { node: { code: 'CCC', carousel_media: [{ image_versions2: { candidates: [{ url: 'https://i/c1.jpg' }] } }, { video_versions: [{ url: 'https://v/c2.mp4' }], image_versions2: { candidates: [{ url: 'https://i/c2.jpg' }] } }] } }] } }, pad: 'x'.repeat(80) });
    window.fetch = async () => ({ ok: true, url: 'https://www.instagram.com/graphql/query', clone() { return { text: async () => body }; } });
  });
  await pg.addScriptTag({ content: read('content/ig-sniffer.js') });
  const sn3 = await pg.evaluate(async () => {
    const got = []; document.addEventListener('aurora-ig-media', (e) => got.push(...JSON.parse(e.detail)));
    await fetch('https://www.instagram.com/graphql/query'); await new Promise((r) => setTimeout(r, 50));
    const first = got.slice();
    got.length = 0; document.dispatchEvent(new CustomEvent('aurora-ig-replay'));
    return { first, replay: got };
  });
  check('ig-sniffer captures reel video + carousel items from page JSON', sn3.first.length === 2 && sn3.first[0].items[0].v === 'https://v/a.mp4' && sn3.first[1].items[1].v === 'https://v/c2.mp4');
  check('ig-sniffer replays everything captured on request', sn3.replay.length === 2);

  // ---- instagram: following list via the profile link + dialog (no API needed)
  await load('https://www.instagram.com/shop/', `<header><ul><li><a href="/shop/followers/">1 followers</a></li><li><a href="/shop/following/" id="fl">2 following</a></li></ul></header><div id="host"></div>
    <script>document.getElementById('fl').addEventListener('click',e=>{e.preventDefault();document.getElementById('host').innerHTML='<div role="dialog"><h1>Following</h1><div style="overflow-y:auto;height:100px"><div><div><div><a href="/ann/"><img src="https://x/a.jpg"></a><a href="/ann/">ann</a><span>Ann Lee</span></div></div></div><div><div><div><a href="/bo/">bo</a><span>Bo</span></div></div></div></div></div>'});</script>`, ...F, 'content/instagram.js');
  await pg.evaluate(() => document.getElementById('fl').dispatchEvent(new Event('x')));
  const fl = await pg.evaluate(async () => {
    // inline scripts don't run under setContent route; wire the click handler here
    document.getElementById('fl').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('host').innerHTML = '<div role="dialog"><h1>Following</h1><div style="overflow-y:auto;height:100px"><div><div><div><a href="/ann/"><img src="https://x/a.jpg"></a><a href="/ann/">ann</a><span>Ann Lee</span></div></div></div><div><div><div><a href="/bo/">bo</a><span>Bo</span></div></div></div></div></div>'; });
    const rows = []; const ctx = { opts: {}, limit: 50, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log() {}, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x); return 1; } };
    window.fetch = async () => { throw new Error('API must not be needed'); };
    await AuroraX.platforms.instagram.tasks.following(ctx);
    return rows;
  });
  check('IG following: clicks the link, reads the dialog, no API call', fl.length === 2 && fl[0].username === 'ann' && fl[1].username === 'bo');
  const sn = await pg.evaluate(() => AuroraX.snapshot());
  check('page probe is structure-only (counts, no text)', typeof sn.counts['role=dialog'] === 'number' && !JSON.stringify(sn).includes('Ann Lee'));

  await browser.close(); done();
})().catch((e) => { console.error(e); process.exit(1); });
