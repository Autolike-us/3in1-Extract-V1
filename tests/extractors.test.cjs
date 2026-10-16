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

  // ---- instagram: following list via the profile link + dialog (no API needed)
  await load('https://www.instagram.com/shop/', `<header><ul><li><a href="/shop/followers/">1 followers</a></li><li><a href="/shop/following/" id="fl">2 following</a></li></ul></header><div id="host"></div>
    <script>document.getElementById('fl').addEventListener('click',e=>{e.preventDefault();document.getElementById('host').innerHTML='<div role="dialog"><div style="overflow-y:auto;height:100px"><div><div><div><a href="/ann/"><img src="https://x/a.jpg"></a><a href="/ann/">ann</a><span>Ann Lee</span></div></div></div><div><div><div><a href="/bo/">bo</a><span>Bo</span></div></div></div></div></div>'});</script>`, ...F, 'content/instagram.js');
  await pg.evaluate(() => document.getElementById('fl').dispatchEvent(new Event('x')));
  const fl = await pg.evaluate(async () => {
    // inline scripts don't run under setContent route; wire the click handler here
    document.getElementById('fl').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('host').innerHTML = '<div role="dialog"><div style="overflow-y:auto;height:100px"><div><div><div><a href="/ann/"><img src="https://x/a.jpg"></a><a href="/ann/">ann</a><span>Ann Lee</span></div></div></div><div><div><div><a href="/bo/">bo</a><span>Bo</span></div></div></div></div></div>'; });
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
