const { execSync } = require('child_process');
const { connect, sleep } = require('./r32-lib');
const fs = require('fs'), path = require('path');
const STATE = path.resolve('.stress-userdata/nekoboard-state.json');
function sample(label){const out=execSync('powershell -NoProfile -ExecutionPolicy Bypass -File logs/p4-procs.ps1 -Label "'+label+'"',{encoding:'utf8'});let ws=0,priv=0,cpu=0;const rows={};for(const l of out.split(/\r?\n/)){const m=l.trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/);if(m){rows[m[2]]=(rows[m[2]]||0)+Number(m[4]);ws+=Number(m[3]);priv+=Number(m[4]);cpu+=Number(m[5]);}}return{label,ws:+ws.toFixed(1),priv:+priv.toFixed(1),cpu:+cpu.toFixed(1),privBy:rows};}
const heap=(c)=>c.evaluate('return performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:-1;');
async function main(){
  const c = await connect('canvas');
  // fresh 50-node board (clean state file; no reload needed if app currently stable)
  await sleep(950);
  const items=[];for(let i=0;i<50;i++){const col=i%10,r=Math.floor(i/10);items.push({id:crypto.randomUUID(),type:'thought',x:10+col*80,y:12+r*56,width:74,height:44,content:'p'+i,createdAt:Date.now()});}
  fs.writeFileSync(STATE, JSON.stringify({items,timers:{lastHydration:Date.now(),lastBreak:Date.now()}}));
  const http=require('http'),WebSocket=require('ws');
  await new Promise((res,rej)=>{http.get('http://127.0.0.1:9223/json/list',r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>{const t=JSON.parse(d).find(p=>p.url.includes('canvas'));const ws=new WebSocket(t.webSocketDebuggerUrl);ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'Page.reload',params:{ignoreCache:true}})));ws.on('message',m=>{if(JSON.parse(m).id===1){ws.close();res();}});});}).on('error',rej);});
  await sleep(2000);
  let snap = await c.snap();
  for (let i=0;i<25 && snap.count!==50;i++){ await sleep(600); snap = await c.snap(); }
  if (snap.count !== 50) throw new Error('seed count ' + snap.count);
  console.log('M5-pre', JSON.stringify(sample('M5-pre')));
  // media: image + video render check on THIS board
  await sleep(950);
  items.push({id:crypto.randomUUID(),type:'image',x:500,y:350,width:120,height:90,content:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',createdAt:Date.now()});
  items.push({id:crypto.randomUUID(),type:'video',x:650,y:350,width:200,height:140,content:'media:stress.mp4',createdAt:Date.now()});
  fs.writeFileSync(STATE, JSON.stringify({items,timers:{lastHydration:Date.now(),lastBreak:Date.now()}}));
  const reload2=()=>new Promise(res=>{http.get('http://127.0.0.1:9223/json/list',r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>{const t=JSON.parse(d).find(p=>p.url.includes('canvas'));const ws=new WebSocket(t.webSocketDebuggerUrl);ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'Page.reload',params:{ignoreCache:true}})));ws.on('message',m=>{if(JSON.parse(m).id===1){ws.close();res();}});});});});
  await reload2(); await sleep(2200); for(let i=0;i<25;i++){const n=await c.evaluate("return document.querySelectorAll(\"#world [data-node]\").length;"); if(n===52) break; await sleep(600);}
  const media = await c.evaluate('return {nodes:document.querySelectorAll("#world [data-node]").length, imgs:[...document.querySelectorAll("#world img")].filter(i=>i.src.startsWith("data:")).length, videos:document.querySelectorAll("#world video").length};');
  console.log('M5-media', JSON.stringify(media));
  // zoom in/out + reset
  const zl = await c.rect('#zoom-label'); if(!zl) throw new Error('no zoom label');
  await c.click(zl.x+zl.w/2, zl.y+zl.h/2);
  for(let i=0;i<5;i++) await c.wheel(450,350,-120); await sleep(150);
  for(let i=0;i<5;i++) await c.wheel(450,350,120); await sleep(150);
  console.log('M5-zoom-label', await c.evaluate('return document.getElementById("zoom-label").textContent;'));
  // hide -> restore
  await c.evaluate('window.canvasApi.hide(); return 1;'); await sleep(1500);
  console.log('hidden', JSON.stringify(sample('hidden')));
  await c.evaluate('window.canvasApi.hide(); return 1;'); await sleep(1500);
  console.log('restored', JSON.stringify(sample('restored')), (await c.snap()).count);
  // ---- cap live check: 100 unique small moves ----
  const first = (await c.snap()).nodes[0];
  for (let i=0;i<100;i++){
    const rt = await c.rect('[data-node="'+first.id+'"]');
    if(!rt) throw new Error('target node gone at '+i);
    await c.drag(rt.x+rt.w/2, rt.y+8, rt.x+rt.w/2+3, rt.y+8, 2);
  }
  let last = await c.evaluate('const e=document.querySelector("[data-node]");return e.style.left+"|"+e.style.top;');
  let depth=0;
  for(let i=0;i<130;i++){
    await c.combo.undo();
    const cur = await c.evaluate('const e=document.querySelector("[data-node]");return e.style.left+"|"+e.style.top;');
    if(cur===last){break;}
    last=cur;depth++;
  }
  console.log('CAP', JSON.stringify({undoDepthObserved:depth, cap:80, heapAfterCap: await heap(c)}));
  await sleep(5000);
  console.log('post-cap-settle', JSON.stringify(sample('settle')), 'heap', await heap(c));
  console.log('ERRORS', JSON.stringify(c.errors.slice(0,6)));
  c.close();
}
main().catch(e=>{console.error('FATAL',e.stack||e.message);process.exit(1);});
