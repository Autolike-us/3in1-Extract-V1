// Loads the real unpacked extension in Chromium: service worker starts, dashboard + popup open, a run round-trips
// through the content script on a local page that pretends to be a Facebook Marketplace page.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os'), https = require('node:https'), { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
// A local HTTPS server stands in for TikTok's video host: it refuses anything without the Referer a TikTok page would send.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axc-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=v16-webapp-prime.tiktok.com', '-keyout', tmp + '/k.pem', '-out', tmp + '/c.pem', '-days', '1'], { stdio: 'ignore' });
const seen = [];
const cdn = https.createServer({ key: fs.readFileSync(tmp + '/k.pem'), cert: fs.readFileSync(tmp + '/c.pem') }, (req, res) => {
  seen.push({ referer: req.headers.referer || '', origin: req.headers.origin || '' });
  if (req.headers.referer !== 'https://www.tiktok.com/' || req.headers.origin) { res.writeHead(403, { 'content-type': 'text/html' }); return res.end('forbidden'); }
  res.writeHead(200, { 'content-type': 'video/mp4', 'access-control-allow-origin': '*' }); res.end(Buffer.alloc(5000, 9));
});
(async () => {
  await new Promise((r) => cdn.listen(0, '127.0.0.1', r));
  const cdnPort = cdn.address().port;
  const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'ax-')), { executablePath: exe, headless: false, ignoreHTTPSErrors: true, args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, `--host-resolver-rules=MAP *.facebook.com 127.0.0.1, MAP v16-webapp-prime.tiktok.com 127.0.0.1:${cdnPort}`, '--ignore-certificate-errors', '--no-proxy-server'] });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  console.log('PASS service worker up', id);
  await ctx.route('https://www.facebook.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><title>Marketplace</title><body>
    <a href="/marketplace/item/1001/"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><div>$250</div><div>Road bike</div><div>Austin, TX</div></a>
    <a href="/marketplace/item/1002/"><div>$40</div><div>Lamp</div><div>Dallas, TX</div></a>` }));
  const page = await ctx.newPage(); await page.goto('https://www.facebook.com/marketplace/austin'); await page.waitForTimeout(800);
  const dash = await ctx.newPage(); await dash.goto(`chrome-extension://${id}/dashboard.html`); await dash.waitForTimeout(800); await dash.click('[data-tour=skip]');
  const t = await dash.textContent('#tabsArea');
  if (!/Marketplace/.test(t)) throw new Error('dashboard did not list the Marketplace tab: ' + t);
  console.log('PASS dashboard lists the open Facebook tab + detects page type');
  await dash.click('#goBtn'); await dash.waitForTimeout(500);
  await dash.waitForFunction(() => /Done/.test(document.querySelector('#liveCard')?.textContent || ''), null, { timeout: 30000 });
  console.log('PASS run finished:', (await dash.textContent('#liveCard')).replace(/\s+/g, ' ').slice(0, 90));
  const badge = await page.evaluate(() => { const b = document.getElementById('aurora-extract-badge'); return b && b.shadowRoot.textContent; });
  if (!/Done/.test(badge || '')) throw new Error('no on-page progress badge: ' + badge);
  console.log('PASS the page shows its own progress badge:', badge.replace(/\s+/g, ' ').slice(-60));
  await dash.click('nav [data-view=results]'); await dash.waitForTimeout(500);
  const rows = await dash.$$eval('tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')));
  if (rows.length !== 2 || !/Road bike/.test(rows[0])) throw new Error('rows: ' + JSON.stringify(rows));
  console.log('PASS results table has the 2 listings:', rows[0]);
  // ---- navigation shortcut: on a group FEED, choose "Group members" → the extension opens /members itself and extracts there
  await ctx.unroute('https://www.facebook.com/**');
  await ctx.route('https://www.facebook.com/**', (r) => {
    const u = new URL(r.request().url());
    const body = /\/members/.test(u.pathname)
      ? `<title>Members</title><div role="main"><div role="listitem"><a href="https://www.facebook.com/groups/9/user/555/">Ana Silva</a></div><div role="listitem"><a href="https://www.facebook.com/groups/9/user/556/">Li Wei</a></div></div>`
      : `<title>Austin Bikers</title><div role="main"><h1>Austin Bikers</h1><div role="article"><h3><a href="https://www.facebook.com/bob">Bob</a></h3><div dir="auto">hello</div></div></div>`;
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html>${body}` });
  });
  await page.goto('https://www.facebook.com/groups/9/'); await page.waitForTimeout(800);
  await dash.bringToFront(); await dash.click('nav [data-view=extract]');
  await dash.click('[data-refresh]'); await dash.waitForTimeout(800);
  await dash.click('.tabrow'); await dash.waitForTimeout(500);
  const chips = await dash.$$eval('#kinds .chip', (c) => c.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  if (!chips.some((c) => /Group members/.test(c))) throw new Error('no Group members chip on the group feed: ' + chips);
  console.log('PASS group feed offers:', chips.join(' | '));
  await dash.click('#kinds [data-k=group_members]'); await dash.click('#goBtn');
  await dash.waitForFunction(() => /Done[\s\S]*Group members/.test(document.querySelector('#liveCard')?.textContent || ''), null, { timeout: 60000 });
  const url = page.url();
  if (!/\/groups\/9\/members/.test(url)) throw new Error('tab was not navigated to the Members page: ' + url);
  await dash.click('nav [data-view=results]'); await dash.waitForTimeout(500);
  const gm = await dash.$$eval('tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')));
  if (gm.length !== 2 || !/Ana Silva/.test(gm[0])) throw new Error('members rows: ' + JSON.stringify(gm));
  console.log('PASS opened the Members tab by itself and extracted:', gm[0]);
  // ---- Aurora Audit through the real extension: profile page -> "Health check" -> report in the dashboard
  await ctx.unroute('https://www.facebook.com/**');
  await ctx.route('https://www.facebook.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><title>Acme Cafe</title><body><div role="main"><h1>Acme Café</h1><div>Acme Café is a neighbourhood coffee shop in Austin serving specialty coffee, fresh pastries and light lunches every day of the week. About · Posts · Photos · Videos · Reviews</div><a href="https://l.facebook.com/l.php?u=${encodeURIComponent('https://acme.example')}">acme.example</a><a href="mailto:hi@acme.example">mail</a><div>Page · Coffee shop</div><div>4.2K followers</div></div>
    <div role="feed">${[['2h', 'Fresh croissants today — who wants one?', 40], ['2d', 'Closed Monday.', 12], ['5d', 'New menu is out! Visit us.', 25], ['9d', 'Live music Friday, come along', 31]].map(([w, t, n], i) => `<div role="article"><h3><a href="https://www.facebook.com/acme.cafe">Acme Café</a></h3><a href="https://www.facebook.com/acme.cafe/posts/${200 + i}"><span>${w}</span></a><div dir="auto">${t}</div><div aria-label="Like: ${n} people">${n}</div></div>`).join('')}</div></body>` }));
  await page.goto('https://www.facebook.com/acme.cafe'); await page.waitForTimeout(800);
  await dash.bringToFront(); await dash.click('nav [data-view=extract]');
  await dash.click('[data-refresh]'); await dash.waitForTimeout(800);
  await dash.click('.tabrow'); await dash.waitForTimeout(500);
  await dash.click('nav [data-view=audit]'); await dash.waitForTimeout(600);
  await dash.click('[data-arefresh]'); await dash.waitForTimeout(800);
  await dash.click('#auditTabs .tabrow'); await dash.waitForTimeout(500);
  if (!(await dash.$('#auditGo'))) throw new Error('no Run health check button on the Health check page: ' + (await dash.textContent('#view-audit')).slice(0, 300));
  await dash.click('#auditGo');
  await dash.waitForFunction(() => /Done[\s\S]*Health check/.test(document.querySelector('#auditLive')?.textContent || ''), null, { timeout: 60000 });
  await dash.click('nav [data-view=results]'); await dash.waitForTimeout(500);
  await dash.click('.run:first-child'); await dash.waitForTimeout(400);
  const score = await dash.textContent('.agauge b').catch(() => null);
  if (!score || isNaN(+score)) throw new Error('no audit report: ' + (await dash.textContent('#viewer')).slice(0, 200));
  const nsec = await dash.$$eval('.asec', (a) => a.length);
  if (nsec !== 5) throw new Error('audit sections: ' + nsec);
  console.log('PASS Health check ran in the real extension and opened a report: score', score, 'with', nsec, 'sections');
  // ---- media download headers: the dashboard page can fetch a TikTok video host that demands a TikTok Referer
  const vres = await dash.evaluate(async () => { try { const r = await fetch('https://v16-webapp-prime.tiktok.com/video/tos/x.mp4', { credentials: 'include' }); return { ok: r.ok, status: r.status, type: r.headers.get('content-type'), len: (await r.arrayBuffer()).byteLength }; } catch (e) { return { error: String(e) }; } });
  if (!vres.ok || vres.type !== 'video/mp4' || vres.len !== 5000) throw new Error('TikTok video host fetch failed: ' + JSON.stringify(vres) + ' seen=' + JSON.stringify(seen));
  console.log('PASS the extension supplies the Referer a *.tiktok.com video host needs (status', vres.status + ',', vres.len, 'bytes)');
  await ctx.close(); cdn.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
