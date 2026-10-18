// Generates the Chrome Web Store screenshots (1280x800) from the real dashboard, using FICTIONAL sample data only.
//   node store/make-assets.cjs     -> store/assets/screenshot-*.png
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'assets');
const read = (n) => fs.readFileSync(path.join(ROOT, n), 'utf8');
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];

// ---- fictional data
const BIZ = [
  ['Sunrise Bakery', 'sunrisebakery_demo', 'Bakery', 18400], ['Harbor Coffee Co.', 'harborcoffee_demo', 'Coffee shop', 9210], ['Peak Fitness Studio', 'peakfitness_demo', 'Gym/Fitness', 25600],
  ['Willow & Oak Florist', 'willowoak_demo', 'Florist', 6320], ['Northside Bikes', 'northsidebikes_demo', 'Bicycle shop', 4875], ['Maple Street Dental', 'maplestdental_demo', 'Dentist', 3120],
  ['Lantern Books', 'lanternbooks_demo', 'Bookstore', 12780], ['Copper Kettle Tea', 'copperkettle_demo', 'Tea shop', 7040], ['Juniper Yoga', 'juniperyoga_demo', 'Yoga studio', 15330],
  ['Blue Door Pottery', 'bluedoorpottery_demo', 'Art studio', 5190], ['Greenleaf Grocers', 'greenleafgrocers_demo', 'Grocery', 8860], ['Atlas Print Shop', 'atlasprint_demo', 'Printing', 2410],
  ['Wildflower Photography', 'wildflowerphoto_demo', 'Photographer', 11940], ['Orchard Lane Cafe', 'orchardlane_demo', 'Cafe', 6780], ['Tidewater Surf School', 'tidewatersurf_demo', 'Sports school', 9990],
].map(([name, username, category, followers], i) => {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '');
  return { id: String(1000 + i), username, name, category, business: true, verified: i % 5 === 0, followers, following: 120 + i * 17, posts: 80 + i * 9, email: i % 4 === 3 ? '' : `hello@${slug}.example`, phone: i % 3 === 2 ? '' : `+1 555 01${String(10 + i).padStart(2, '0')}`, website: `https://www.${slug}.example`, url: `https://www.instagram.com/${username}/`, platform: 'instagram', kind: 'profile', bio: `${category} · family run · est. ${2008 + (i % 12)}`, media: [] };
});
const grad = (a, b, label) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='120' height='120' fill='url(#g)'/><circle cx='60' cy='56' r='24' fill='rgba(255,255,255,.35)'/></svg>`);
const PAL = [['#ffb199', '#ff0844'], ['#a1c4fd', '#c2e9fb'], ['#fbc2eb', '#a6c1ee'], ['#84fab0', '#8fd3f4'], ['#fddb92', '#d1fdff'], ['#cfd9df', '#e2ebf0'], ['#f6d365', '#fda085'], ['#a18cd1', '#fbc2eb']];
const VID = Array.from({ length: 12 }, (_, i) => ({ id: 'v' + i, author: 'sunrisebakery_demo', platform: 'tiktok', kind: 'videos', description: ['Sourdough shaping tips', 'Morning bake behind the scenes', 'Cinnamon rolls in 60 seconds', 'Meet the team', 'Saturday market haul', 'How we laminate croissants', 'Holiday menu preview', 'Customer favourites', 'Baking with kids', 'Cake decorating basics', 'Coffee pairing guide', 'Open kitchen day'][i], plays: 4200 + i * 1310, likes: 310 + i * 47, comments: 12 + i * 3, shares: 5 + i, postedAt: `2026-0${1 + (i % 9)}-1${i % 9}T10:00:00Z`, url: `https://www.tiktok.com/@sunrisebakery_demo/video/76000000000000${i}`, media: [{ type: 'video', url: 'https://example.invalid/v' + i + '.mp4' }, { type: 'image', url: grad(...PAL[i % PAL.length]) }] }));
const COMMENTERS = ['maya.k', 'tom_b', 'priya.s', 'luca.r', 'jordan.w', 'ana.m', 'sam_o', 'kim.l', 'dev.p', 'noor.h'].map((u, i) => ({ id: u, username: u, name: '', comments: [5, 4, 3, 3, 2, 2, 1, 1, 1, 1][i], likesOnComments: 40 - i * 3, firstComment: `${i + 1}d`, lastComment: `${i}h`, sample: ['Love this!', 'Where can I order?', 'Looks delicious', 'Do you ship?', 'Great tips, thanks', 'Saving this one', 'More recipes please', 'Opening hours?', 'Congrats!', 'Yum'][i], platform: 'instagram', kind: 'commenters', profileUrl: `https://www.instagram.com/${u}/` }));
const RUNS = [
  { id: 'a', platform: 'instagram', kind: 'profile', label: 'Instagram · Profiles & business contacts', opts: { limit: 200 }, status: 'done', count: BIZ.length, startedAt: Date.now() - 600e3 },
  { id: 'b', platform: 'tiktok', kind: 'videos', label: 'TikTok · Videos (with files)', opts: { limit: 12 }, status: 'done', count: VID.length, startedAt: Date.now() - 4000e3 },
  { id: 'c', platform: 'instagram', kind: 'commenters', label: 'Instagram · People who commented', opts: { limit: 200 }, status: 'done', count: COMMENTERS.length, startedAt: Date.now() - 9000e3 },
];
const stub = ([runs, rowsets, tabs, desc]) => {
  const store = { runs, debugLog: [] }; for (const k in rowsets) store['rows:' + k] = rowsets[k];
  window.chrome = {
    storage: { local: { get: async (k) => { const o = {}; [].concat(k || []).forEach((x) => { if (x in store) o[x] = store[x]; }); return o; }, set: async (o) => Object.assign(store, o), remove: async () => {} }, onChanged: { addListener() {} } },
    tabs: { query: async (q) => tabs.filter((t) => q.url && q.url.some((m) => t.url.includes(m.split('*.')[1].split('/')[0]))), sendMessage: async () => desc, create: async () => {}, reload() {}, onUpdated: { addListener() {} } },
    runtime: { getManifest: () => ({ name: 'Aurora Extract', version: '0.3.4' }), sendMessage: (m, cb) => (cb || (() => {}))({ ok: true }), getURL: (x) => x },
  };
};
const DESC = { platform: 'instagram', name: 'Instagram', page: { label: '@sunrisebakery_demo', primary: 'profile', kinds: [{ id: 'profile', label: 'Profile & business contact' }, { id: 'posts', label: 'Posts & reels' }, { id: 'followers', label: 'Followers' }, { id: 'following', label: 'Following' }] } };
const TABS = [{ id: 1, url: 'https://www.instagram.com/sunrisebakery_demo/', title: 'Sunrise Bakery (@sunrisebakery_demo) • Instagram photos and videos' }];

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const shot = async (name, { dark = false, view = 'extract', run, scroll, query } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    await pg.setContent(read('dashboard.html').replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*stylesheet[^>]*>/, '<style>' + read('style.css') + '</style>'));
    await pg.evaluate(stub, [RUNS, { a: BIZ, b: VID, c: COMMENTERS }, TABS, DESC]);
    if (dark) await pg.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    for (const f of ['core/zip.js', 'core/export.js', 'catalog.js', 'report.js', 'dashboard.js']) await pg.addScriptTag({ content: read(f) });
    await pg.waitForTimeout(500);
    if (view !== 'extract') await pg.click(`nav [data-view=${view}]`);
    if (run) { await pg.click(`.run[data-r=${run}]`); await pg.waitForTimeout(250); }
    if (query) { await pg.fill('#q', query); await pg.waitForTimeout(450); }
    if (scroll) await pg.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start' }), scroll);
    await pg.waitForTimeout(250);
    await pg.screenshot({ path: path.join(OUT, name) });
    await ctx.close();
  };
  await shot('screenshot-1-extract.png');
  await shot('screenshot-2-results.png', { view: 'results', run: 'a' });
  await shot('screenshot-3-videos-media.png', { view: 'results', run: 'b' });
  await shot('screenshot-4-capabilities-dark.png', { dark: true, scroll: '#tiles' });
  await shot('screenshot-5-commenters.png', { view: 'results', run: 'c' });
  await shot('screenshot-6-privacy.png', { view: 'help' });
  await browser.close();
  require('node:child_process').execFileSync('python3', ['-I', '-c', "import glob;from PIL import Image\nfor f in glob.glob(r'" + OUT + "/screenshot-*.png'):\n  Image.open(f).convert('RGB').resize((1280,800),Image.LANCZOS).save(f,optimize=True)"]);
  console.log(fs.readdirSync(OUT).filter((f) => f.startsWith('screenshot')).join('\n'));
})();
