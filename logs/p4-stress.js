// Phase 4 PASS3 long-session stress: runs ONLY against .stress-userdata (PEEPDESK_USERDATA isolated profile).
// Metrics here are diagnostic (CDP-driven UI), not the PASS2 baseline.
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { execSync } = require('child_process');
const { connect, sleep } = require('./r32-lib');

const UD = path.resolve('.stress-userdata');
const STATE = path.join(UD, 'nekoboard-state.json');
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

fs.mkdirSync(path.join(UD, 'media'), { recursive: true });
fs.writeFileSync(path.join(UD, 'media', 'stress.mp4'), Buffer.alloc(65536, 7));

function genItems(n) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const c = i % 10, r = Math.floor(i / 10);
    items.push({
      id: crypto.randomUUID(), type: 'thought',
      x: 10 + c * 80, y: 12 + r * 56, width: 74, height: 44,
      content: 'p' + i, createdAt: Date.now()
    });
  }
  return items;
}

function seed(items) {
  fs.writeFileSync(STATE, JSON.stringify({ items, timers: { lastHydration: Date.now(), lastBreak: Date.now() } }));
}

function reloadCanvas() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json/list', (r) => {
      let d = ''; r.on('data', (x) => (d += x)); r.on('end', () => {
        const t = JSON.parse(d).find((p) => p.url.includes('canvas'));
        if (!t) return reject(new Error('no canvas target'));
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Page.reload', params: { ignoreCache: true } })));
        ws.on('message', (m) => { if (JSON.parse(m).id === 1) { ws.close(); resolve(); } });
      });
    });
  });
}

function sample(label) {
  const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File logs/p4-procs.ps1 -Label "' + label + '"', { encoding: 'utf8' });
  const rows = {};
  let ws = 0, priv = 0, cpu = 0;
  for (const line of out.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/);
    if (m) {
      rows[m[2]] = (rows[m[2]] || 0) + Number(m[4]); // private MB per process type
      ws += Number(m[3]); priv += Number(m[4]); cpu += Number(m[5]);
    }
  }
  return { label, ws: +ws.toFixed(1), priv: +priv.toFixed(1), cpu: +cpu.toFixed(1), privBy: rows };
}

const heap = (c) => c.evaluate('return performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576*10)/10 : -1;');

async function mark(c, s) {
  const h = await heap(c);
  const mem = sample('M' + s.cycle + '-' + s.cp);
  console.log(JSON.stringify({ ...s, heapMB: h, mem }));
  return s;
}

async function main() {
  const c = await connect('canvas');
  const pet = await connect('pet');
  const t0 = Date.now();

  // ---- idle CPU attribution: with pet animations running vs cancelled ----
  if (!process.env.SKIP_CPU) {
  const cpuA = sample('cpu-idle-A');
  await sleep(15000);
  const cpuB = sample('cpu-idle-B');
  await pet.evaluate('document.getAnimations().forEach(a=>a.cancel()); return 1;');
  await sleep(5000);
  const cpuC = sample('cpu-noanim-A');
  await sleep(15000);
  const cpuD = sample('cpu-noanim-B');
  console.log(JSON.stringify({
    what: 'cpu-attribution',
    deltaWithAnim: +(cpuB.cpu - cpuA.cpu).toFixed(2),
    deltaNoAnim: +(cpuD.cpu - cpuC.cpu).toFixed(2)
  }));
  await pet.evaluate('location.reload(); return 1;').catch(() => {});
  }

  // ---- stress cycles ----
  for (let cyc = 1; cyc <= Number(process.env.CYCLES || 3); cyc++) {
    const m0 = await mark(c, { cycle: cyc, cp: 'M0' });
    await sleep(950);
    seed(genItems(50));
    await reloadCanvas();
    await sleep(1600);
    const snap = await c.snap();
    if (snap.count !== 50) throw new Error('seed failed, count=' + snap.count);

    // move + resize
    const r0 = await c.rect('[data-node="' + snap.nodes[0].id + '"]');
    await c.drag(r0.x + r0.w / 2, r0.y + 10, r0.x + r0.w / 2 + 40, r0.y + 35);
    const r1 = await c.rect('[data-node="' + snap.nodes[1].id + '"]');
    await c.drag(r1.x + r1.w - 3, r1.y + r1.h - 3, r1.x + r1.w + 17, r1.y + r1.h + 17);
    await mark(c, { cycle: cyc, cp: 'M1-move-resize' });

    // multi-select via ctrl+marquee, then group drag
    const ep = await c.emptyPoint();
    await c.mouse('mouseMoved', ep.x, ep.y);
    await c.mouse('mousePressed', ep.x, ep.y, { button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
    await c.mouse('mouseMoved', 200, 300, { buttons: 1, modifiers: 8 });
    await c.mouse('mouseReleased', 15, 648, { button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
    await sleep(250);
    const selN = await c.evaluate('return document.querySelectorAll("#world .active").length;');
    await c.drag(60, 40, 90, 60);
    await sleep(150);
    await c.click(ep.x, ep.y);
    await mark(c, { cycle: cyc, cp: 'M2-select-groupdrag', selected: selN });

    // context menu: duplicate then delete; spawn menu open/close
    const rn = await c.rect('[data-node="' + (await c.snap()).nodes[2].id + '"]');
    await c.click(rn.x + rn.w / 2, rn.y + 8, 'right');
    await sleep(200);
    const dupPos = await c.evaluate(`
      const b=[...document.querySelectorAll('#ctx-menu *')].find(x=>/duplicate/i.test(x.textContent||''));
      if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    if (dupPos) await c.click(dupPos.x, dupPos.y);
    await sleep(200);
    const afterDup = (await c.snap()).count;
    const s2 = await c.snap();
    const rd = await c.rect('[data-node="' + s2.nodes[s2.nodes.length - 1].id + '"]');
    await c.click(rd.x + rd.w / 2, rd.y + 8, 'right');
    await sleep(200);
    const delPos = await c.evaluate(`
      const b=[...document.querySelectorAll('#ctx-menu *')].find(x=>/delete/i.test(x.textContent||''));
      if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    if (delPos) await c.click(delPos.x, delPos.y);
    await sleep(200);
    const ep2 = await c.emptyPoint();
    if (ep2) {
      await c.click(ep2.x, ep2.y, 'right'); // spawn menu (dblclick-free path if ctx offers add; else escape)
      await sleep(150);
      await c.combo.escape();
    }
    const afterDel = (await c.snap()).count;
    await mark(c, { cycle: cyc, cp: 'M3-menus', afterDup, afterDel });

    // undo x6 / redo x3
    for (let i = 0; i < 6; i++) { await c.combo.undo(); await sleep(90); }
    for (let i = 0; i < 3; i++) { await c.combo.redoShift(); await sleep(90); }
    await mark(c, { cycle: cyc, cp: 'M4-undo-redo' });

    // media: image + local video via reseed
    await sleep(950);
    const items = genItems(48);
    items.push({ id: crypto.randomUUID(), type: 'image', x: 500, y: 350, width: 120, height: 90, content: PNG, createdAt: Date.now() });
    items.push({ id: crypto.randomUUID(), type: 'video', x: 650, y: 350, width: 200, height: 140, content: 'media:stress.mp4', createdAt: Date.now() });
    seed(items);
    await reloadCanvas();
    await sleep(1600);
    const media = await c.evaluate(`
      return { imgs: [...document.querySelectorAll('#world img')].filter(i=>i.src.startsWith('data:')).length,
               videos: document.querySelectorAll('#world video').length };`);

    // pan/zoom
    const zl = await c.rect('#zoom-label');
    await c.click(zl.x + zl.w / 2, zl.y + zl.h / 2);
    for (let i = 0; i < 5; i++) await c.wheel(450, 350, -120);
    await sleep(200);
    for (let i = 0; i < 5; i++) await c.wheel(450, 350, 120);
    await sleep(200);
    await mark(c, { cycle: cyc, cp: 'M5-media-zoom', ...media });

    // hide -> restore
    await c.evaluate('window.canvasApi.hide(); return 1;');
    await sleep(1500);
    await c.evaluate('window.canvasApi.hide(); return 1;');
    await sleep(1300);
    const back = await c.snap();
    m0.restored = back.count;
    console.log(JSON.stringify({ what: 'restored', cycle: cyc, count: back.count }));
  }

  // ---- history cap live check ----
  // Each drag moves the node 3px right and re-reads its rect, so every pre-state is
  // unique (a deduped or missed drag would understate depth) and the node stays on-screen.
  let first = (await c.snap()).nodes[0];
  for (let i = 0; i < 100; i++) {
    const rt = await c.rect('[data-node="' + first.id + '"]');
    await c.drag(rt.x + rt.w / 2, rt.y + 8, rt.x + rt.w / 2 + 3, rt.y + 8, 2);
  }
  let last = JSON.stringify((await c.snap()).nodes[0].left + (await c.snap()).nodes[0].top);
  let depth = 0;
  for (let i = 0; i < 130; i++) {
    await c.combo.undo();
    const cur = await c.evaluate(`const e=document.querySelector('[data-node]'); return e.style.left+'|'+e.style.top;`);
    if (cur === last) break;
    last = cur;
    depth++;
  }
  console.log(JSON.stringify({ what: 'history-cap', undoDepthObserved: depth, cap: 80 }));
  const heapCap = await heap(c);
  await mark(c, { cycle: 0, cp: 'cap-heap', heapNote: heapCap });

  // ---- graceful quit should flush pending save (shutdown-flush check) ----
  await c.evaluate(`
    const e=document.querySelector('[data-node] [contenteditable], [data-node] .node-text');
    return !!e;`);
  console.log('STRESS-DONE pidcheck next. elapsed=' + Math.round((Date.now() - t0) / 1000) + 's');
  console.log('ERRORS ' + JSON.stringify(c.errors.concat(pet.errors).slice(0, 8)));
  c.close(); pet.close();
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
