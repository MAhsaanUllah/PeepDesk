const http = require('http');
const fs = require('fs');
const WS = require('ws');
const j = () => new Promise(r => { http.get('http://127.0.0.1:9223/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }); });
(async () => {
  const title = process.argv[2]; const out = process.argv[3];
  const t = (await j()).find(x => x.title === title);
  if (!t) { console.error('target not found'); process.exit(1); }
  const ws = new WS(t.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let id=0; const pend={};
  ws.on('message', m => { const o=JSON.parse(m); if (o.id && pend[o.id]) { pend[o.id](o); delete pend[o.id]; } });
  const send = (method,params) => new Promise(r => { const i=++id; pend[i]=r; ws.send(JSON.stringify({id:i,method,params})); });
  await send('Runtime.evaluate',{expression:'document.fonts.ready.then(()=>{})',returnByValue:true});
  await new Promise(r => setTimeout(r, 2500));
  const shot = await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(out, Buffer.from(shot.result.data,'base64'));
  console.log('saved', out, fs.statSync(out).size, 'bytes');
  ws.close();
})();
