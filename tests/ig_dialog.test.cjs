// Instagram followers/following: a pop-up whose title loads late is waited for, and a leftover different pop-up is closed first.
const { read, check, done } = require('./_pw.cjs'); const assert = require('node:assert/strict');
(async () => {
  const b = await require('/opt/node-tools/node_modules/playwright').chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--no-proxy-server']}); const pg = await b.newPage(); pg.on('pageerror', e => console.log('pageerror', e.message));
  const html = `<!doctype html><body><header><a href="/shop/followers/">12 followers</a></header><div id="root"></div>
  <script>
  // a leftover "following" pop-up that is slow to fill, then clicking Followers opens a pop-up whose title appears late
  window.openDlg=(title,delay)=>{const d=document.createElement('div');d.setAttribute('role','dialog');d.innerHTML='<div><svg aria-label="Close"></svg></div><div></div>';d.querySelector('svg').addEventListener('click',()=>d.remove());document.getElementById('root').append(d);setTimeout(()=>{d.querySelector('div:nth-child(2)').innerHTML='<h1>'+title+'</h1><div style="height:50px;overflow-y:auto"><a href="/anna/">anna</a><a href="/bob/">bob</a></div>';},delay);return d;};
  document.querySelector('header a').addEventListener('click',e=>{e.preventDefault();if(!document.querySelector('[role=dialog]'))openDlg('Followers',1200);});
  </script></body>`;
  const srv=require('http').createServer((q,r)=>{r.setHeader('content-type','text/html');r.end(html);}).listen(0,'127.0.0.1');await new Promise(r=>srv.on('listening',r));await pg.goto('http://127.0.0.1:'+srv.address().port+'/shop/');
  await pg.evaluate(() => { window.chrome = { runtime: { sendMessage() {}, onMessage: { addListener() {} } } }; });
  await pg.addScriptTag({ content: read('content/common.js') }); await pg.addScriptTag({ content: read('content/instagram.js') });
  const run = (setup) => pg.evaluate(async (setup) => { document.getElementById('root').innerHTML = ''; eval(setup); const rows = []; const ctx = { opts: {}, limit: 20, stopped: () => false, count: () => rows.length, pause: () => Promise.resolve(), log(l,m){window.__l=(window.__l||[]).concat(m);}, progress() {}, emit(r) { for (const x of [].concat(r)) rows.push(x.username); return 1; } }; window.fetch = async () => { throw new Error('offline'); }; try { await AuroraX.platforms.instagram.tasks.followers(ctx); } catch (e) { return 'ERR ' + e.message + ' | ' + (window.__l||[]).join(' ; '); } return rows.join()+' | '+(window.__l||[]).join(' ; '); }, setup);
  check('IG list: waits for a pop-up whose title loads late', (await run('0')).startsWith('anna,bob'));
  check('IG list: closes a leftover different pop-up, then opens the right list', (await run("openDlg('Following',100)")).startsWith('anna,bob'));
  done(); process.exit(0);
  await b.close();
})();
