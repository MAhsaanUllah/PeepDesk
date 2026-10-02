const http = require('http');
const WS = require('ws');
const j = () => new Promise(r => { http.get('http://127.0.0.1:9223/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }); });
(async () => {
  const t = (await j()).find(x => x.title.includes('Canvas'));
  const ws = new WS(t.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let id=0; const pend={};
  ws.on('message', m => { const o=JSON.parse(m); if (o.id && pend[o.id]) { pend[o.id](o); delete pend[o.id]; } });
  const send = (method,params) => new Promise(r => { const i=++id; pend[i]=r; ws.send(JSON.stringify({id:i,method,params})); });
  const ev = async expr => (await send('Runtime.evaluate',{expression:expr,returnByValue:true})).result.result.value;
  console.log('canvas visibility:', await ev('document.visibilityState'));
  ws.close();
})();
