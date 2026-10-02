const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const { connect, sleep } = require('./r32-lib');

const STATE = process.env.APPDATA + '/PeepDesk/peepdesk-state.json';

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

function reloadCanvas() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json/list', (r) => {
      let d = ''; r.on('data', (x) => (d += x)); r.on('end', () => {
        const t = JSON.parse(d).find((p) => p.url.includes('canvas'));
        if (!t) return reject(new Error('no canvas target'));
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        ws.on('open', () => {
          ws.send(JSON.stringify({ id: 1, method: 'Page.reload', params: { ignoreCache: true } }));
        });
        ws.on('message', (m) => { if (JSON.parse(m).id === 1) { ws.close(); resolve(); } });
      });
    });
  });
}

async function marqueeAll(c) {
  const ep = await c.emptyPoint();
  const x1 = ep.x > 450 ? 15 : 885;
  const y1 = ep.y > 350 ? 70 : 648;
  await c.mouse('mouseMoved', ep.x, ep.y);
  await c.mouse('mousePressed', ep.x, ep.y, { button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  await c.mouse('mouseMoved', (ep.x + x1) / 2, (ep.y + y1) / 2, { buttons: 1, modifiers: 8 });
  await c.mouse('mouseMoved', x1, y1, { buttons: 1, modifiers: 8 });
  const t0 = Date.now();
  await c.mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  for (let i = 0; i < 40; i++) {
    const sel = await c.evaluate(`return document.querySelectorAll('#world .active').length;`);
    if (sel > 0) return { sel, ms: Date.now() - t0 };
    await sleep(50);
  }
  return { sel: 0, ms: -1 };
}

(async () => {
  const rows = [];
  for (const n of [10, 50, 100]) {
    // let any pending 500ms debounced save land BEFORE we own the file
    await sleep(900);
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    st.items = genItems(n);
    fs.writeFileSync(STATE, JSON.stringify(st));
    await reloadCanvas();
    await sleep(2500);

    const c = await connect('canvas');
    const s = await c.snap();
    const count = s.nodes.length;

    // handler-cost hook (throttle-proof): capture stamps t, board bubble (added AFTER app handlers) measures
    await c.evaluate(`
      window.__d = { mvN: 0, mvMs: 0, upN: 0, upMs: 0, raf: 0, t0: performance.now() };
      window.addEventListener('pointermove', (e) => { e.__pt = performance.now(); }, true);
      board.addEventListener('pointermove', (e) => { window.__d.mvN++; window.__d.mvMs += performance.now() - e.__pt; });
      window.addEventListener('pointerup', (e) => { e.__pu = performance.now(); }, true);
      board.addEventListener('pointerup', (e) => { window.__d.upN++; window.__d.upMs += performance.now() - e.__pu; });
      (function l() { window.__d.raf++; requestAnimationFrame(l); })();
    `);

    const m = await marqueeAll(c);
    const fpsSel = await c.evaluate(`return window.__d.raf / ((performance.now() - window.__d.t0) / 1000);`);

    const anchor = s.nodes[0];
    const ap = await c.evaluate(`
      const el = document.querySelector('[data-node="${anchor.id}"]');
      const r = el.getBoundingClientRect();
      return { x: r.x + 20, y: r.y + 6 };
    `);
    await c.drag(ap.x, ap.y, ap.x + 120, ap.y + 60, 30); // group drag
    const g = await c.evaluate(`return { n: window.__d.mvN, avgMove: window.__d.mvMs / Math.max(1, window.__d.mvN), avgUp: window.__d.upMs / Math.max(1, window.__d.upN) };`);
    const distinctLefts = await c.evaluate(`return new Set(Array.from(document.querySelectorAll('#world [data-node]')).map(e => e.style.left)).size;`);

    const tU0 = Date.now();
    await c.combo.undo();
    let undoMs = -1;
    for (let i = 0; i < 40; i++) {
      const l = await c.evaluate(`return document.querySelector('[data-node="${anchor.id}"]').style.left;`);
      if (parseFloat(l) === 10) { undoMs = Date.now() - tU0; break; }
      await sleep(50);
    }

    const sp = await c.evaluate(`
      const el = document.querySelector('[data-node="${anchor.id}"]');
      const r = el.getBoundingClientRect();
      return { x: r.x + 20, y: r.y + 6 };
    `);
    await c.click(sp.x, sp.y); // single select
    await c.evaluate(`window.__d.mvN = 0; window.__d.mvMs = 0;`);
    await c.drag(sp.x, sp.y, sp.x + 90, sp.y, 30); // single-node drag
    const sd = await c.evaluate(`return window.__d.mvMs / Math.max(1, window.__d.mvN);`);
    await c.combo.undo();

    rows.push({ n, count, sel: m.sel, selMs: m.ms, fpsSel: +fpsSel.toFixed(1), groupMoveMs: +g.avgMove.toFixed(3), upMs: +g.avgUp.toFixed(2), distinctLefts, undoMs, singleMoveMs: +sd.toFixed(3) });
    console.log(`n=${String(n).padStart(3)}: loaded=${count} marquee=${m.sel} in ${m.ms}ms | fps(rAF)=${fpsSel.toFixed(1)} | group drag: ${g.avgMove.toFixed(3)}ms/move, up=${g.avgUp.toFixed(2)}ms | undo=${undoMs}ms | single drag: ${sd.toFixed(3)}ms/move | distinctLefts=${distinctLefts}`);
    c.close();
    await sleep(300);
  }
  console.log(JSON.stringify(rows));
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.log('PERF CRASH:', e.stack); process.exit(1); });
