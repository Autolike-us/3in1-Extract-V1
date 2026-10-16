// Loads the real unpacked extension in Chromium: service worker starts, dashboard + popup open, a run round-trips
// through the content script on a local page that pretends to be a Facebook Marketplace page.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const ROOT = path.join(__dirname, '..');
(async () => {
  const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'ax-')), { executablePath: exe, headless: false, args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--host-resolver-rules=MAP *.facebook.com 127.0.0.1'] });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  console.log('PASS service worker up', id);
  await ctx.route('https://www.facebook.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><title>Marketplace</title><body>
    <a href="/marketplace/item/1001/"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><div>$250</div><div>Road bike</div><div>Austin, TX</div></a>
    <a href="/marketplace/item/1002/"><div>$40</div><div>Lamp</div><div>Dallas, TX</div></a>` }));
  const page = await ctx.newPage(); await page.goto('https://www.facebook.com/marketplace/austin'); await page.waitForTimeout(800);
  const dash = await ctx.newPage(); await dash.goto(`chrome-extension://${id}/dashboard.html`); await dash.waitForTimeout(800);
  const t = await dash.textContent('#tabsArea');
  if (!/Marketplace/.test(t)) throw new Error('dashboard did not list the Marketplace tab: ' + t);
  console.log('PASS dashboard lists the open Facebook tab + detects page type');
  await dash.click('#goBtn'); await dash.waitForTimeout(500);
  await dash.waitForFunction(() => /Done/.test(document.querySelector('#liveCard')?.textContent || ''), null, { timeout: 30000 });
  console.log('PASS run finished:', (await dash.textContent('#liveCard')).replace(/\s+/g, ' ').slice(0, 90));
  await dash.click('nav [data-view=results]'); await dash.waitForTimeout(500);
  const rows = await dash.$$eval('tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')));
  if (rows.length !== 2 || !/Road bike/.test(rows[0])) throw new Error('rows: ' + JSON.stringify(rows));
  console.log('PASS results table has the 2 listings:', rows[0]);
  await ctx.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
