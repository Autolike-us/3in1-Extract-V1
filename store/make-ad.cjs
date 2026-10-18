// ~70 s listing/ad video from real screenshots (fictional sample data) + title cards. node store/make-ad.cjs
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const A = path.join(__dirname, 'assets'), TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ad-'));
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const icon = b64(path.join(__dirname, '..', 'icons', 'icon128.png'));
const spark = (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path fill="${c}" d="M12 0c.9 6.7 4.3 11.1 12 12-7.7.9-11.1 5.3-12 12-.9-6.7-4.3-11.1-12-12C7.7 11.1 11.1 6.7 12 0z"/></svg>`;
const CSS = `*{box-sizing:border-box;margin:0}body{width:1920px;height:1080px;overflow:hidden;font-family:Inter,sans-serif;color:#0f2a2e;position:relative;
background:radial-gradient(1300px 700px at 8% 0%,#d9f7ef,transparent 60%),radial-gradient(1000px 700px at 100% 100%,#d4eefc,transparent 55%),#f4fbfa}
.g{background:linear-gradient(135deg,#047857,#0d9488 38%,#0891b2 70%,#22b8e8);-webkit-background-clip:text;color:transparent}
.abs{position:absolute}.chip{display:inline-flex;align-items:center;gap:10px;border-radius:999px;font-weight:700;background:#fff;box-shadow:0 4px 18px rgba(8,120,140,.16);color:#0b6b66;font-size:34px;padding:14px 30px}
.dot{width:16px;height:16px;border-radius:50%}
.tag{position:absolute;right:36px;bottom:26px;font:600 20px Inter;color:#6b8588}
.cap{position:absolute;left:0;right:0;top:46px;text-align:center;font-size:56px;font-weight:800;letter-spacing:-1.5px}
.shot{position:absolute;left:50%;top:150px;transform:translateX(-50%);width:1456px;height:910px;border-radius:26px;box-shadow:0 30px 70px rgba(8,100,120,.28),0 4px 12px rgba(8,100,120,.12);background:#fff center/cover}
.full{display:grid;place-items:center;text-align:center;height:1080px}
.ico{width:170px;height:170px;border-radius:48px;background:#fff;box-shadow:0 20px 50px rgba(8,120,140,.3);display:grid;place-items:center;margin:0 auto 34px}.ico img{width:130px}
h1{font-size:150px;letter-spacing:-5px;line-height:1.02}h2{font-size:96px;letter-spacing:-3px;line-height:1.08}p.s{font-size:44px;color:#3d5a5e;font-weight:500;margin-top:26px;line-height:1.35}
.cta{display:inline-block;margin-top:44px;background:linear-gradient(135deg,#047857,#0d9488 45%,#22b8e8);color:#fff;font-weight:800;font-size:54px;padding:26px 62px;border-radius:30px;box-shadow:0 18px 40px rgba(13,148,136,.4)}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:26px 30px;margin-top:50px}.card{background:#fff;border-radius:30px;box-shadow:0 20px 50px rgba(8,100,120,.16);padding:34px 40px;font-size:42px;font-weight:700;text-align:left;display:flex;gap:22px;align-items:center}
.card i{font-style:normal;font-size:58px}`;
const shot = (img, cap, dark) => `<div class="cap g">${cap}</div><div class="shot" style="background-image:url(${b64(path.join(A, img))})"></div><div class="tag">Demo with fictional sample data</div>`;
const S = [
  `<div class="full"><div><h2>Need contacts, posts or videos from<br><span class="g">Facebook, Instagram &amp; TikTok</span>?</h2><p class="s">…without copying them one by one.</p></div></div><div class="abs" style="left:150px;top:150px">${spark(90, '#22b8e8')}</div><div class="abs" style="right:200px;bottom:170px">${spark(120, '#0d9488')}</div>`,
  `<div class="full"><div><div class="ico"><img src="${icon}"></div><h1 class="g">Aurora Extract</h1><p class="s">The free 3-in-1 data extractor for your browser</p><div style="margin-top:44px;display:flex;gap:22px;justify-content:center"><span class="chip"><i class="dot" style="background:#1877f2"></i>Facebook</span><span class="chip"><i class="dot" style="background:#e1306c"></i>Instagram</span><span class="chip"><i class="dot" style="background:#111"></i>TikTok</span></div></div></div>`,
  shot('screenshot-1-extract.png', 'Pick a platform and open a page you can already see'),
  shot('screenshot-4-capabilities-dark.png', 'Profiles · posts · comments · followers · videos · Marketplace'),
  shot('screenshot-2-results.png', 'Clean tables — with business contacts when shown publicly'),
  shot('screenshot-5-commenters.png', 'One row per person who commented'),
  shot('screenshot-3-videos-media.png', 'Photos and videos saved as real files in a tidy ZIP'),
  `<div class="full"><div><h2>Export <span class="g">your way</span></h2><div class="grid" style="grid-template-columns:repeat(4,1fr)"><div class="card" style="justify-content:center">CSV</div><div class="card" style="justify-content:center">Excel</div><div class="card" style="justify-content:center">JSON</div><div class="card" style="justify-content:center">Media ZIP</div></div><p class="s">Search and filter first · copy all emails in one click</p></div></div>`,
  `<div class="full"><div><h2>Built to be <span class="g">easy</span></h2><div class="grid" style="width:1500px"><div class="card"><i>📈</i>Live progress and a Stop button</div><div class="card"><i>🐢</i>Gentle, Normal or Fast pacing</div><div class="card"><i>🌗</i>Light and dark themes</div><div class="card"><i>🧭</i>Recognises the page and offers the right options</div></div></div></div>`,
  shot('screenshot-6-privacy.png', 'Private by design — no account, no server, no tracking'),
  `<div class="full"><div><h2>Only what <span class="g">you</span> can already see</h2><p class="s" style="width:1400px">It reads pages your own logged-in account can see, at a human pace.<br>It does not bypass privacy settings. Use it responsibly and follow each platform's terms and your local laws.</p></div></div>`,
  `<div class="full"><div><div class="ico"><img src="${icon}"></div><h1 class="g">Aurora Extract</h1><p class="s">Free · Facebook, Instagram &amp; TikTok → CSV, Excel, JSON</p><div class="cta">Add it to Chrome — free</div><p class="s" style="font-size:36px">getaurorastudios.com/extract</p><p class="s" style="font-size:28px;margin-top:40px;color:#6b8588">Independent — not affiliated with Meta, Facebook, Instagram or TikTok</p></div></div>`,
];
(async () => {
  const br = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  for (let i = 0; i < S.length; i++) { await pg.setContent(`<!doctype html><meta charset=utf-8><style>${CSS}</style>${S[i]}`); await pg.waitForTimeout(250); await pg.screenshot({ path: path.join(TMP, `s${String(i).padStart(2, '0')}.png`) }); }
  await br.close();
  const L = 6.5, F = 0.5, n = S.length, fps = 30, fr = Math.round(L * fps);
  const args = ['-y', '-v', 'error'];
  for (let i = 0; i < n; i++) args.push('-i', path.join(TMP, `s${String(i).padStart(2, '0')}.png`));
  let fc = '';
  for (let i = 0; i < n; i++) fc += `[${i}:v]scale=2400:-1,zoompan=z='1+0.05*on/${fr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1920x1080:fps=${fps},setsar=1[v${i}];`;
  let last = 'v0';
  for (let i = 1; i < n; i++) { fc += `[${last}][v${i}]xfade=transition=fade:duration=${F}:offset=${(i * (L - F)).toFixed(2)}[x${i}];`; last = 'x' + i; }
  const out = path.join(A, 'aurora-extract-ad.mp4');
  args.push('-filter_complex', fc.replace(/;$/, ''), '-map', `[${last}]`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', String(fps), out);
  cp.execFileSync('ffmpeg', args, { stdio: 'inherit' });
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(out, cp.execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim() + 's');
})();
