const http = require('http');
const WebSocket = require('ws');
const { connect, sleep, report } = require('./r32-lib');

const SIZES = [
  [1920, 1080], [1440, 900], [1280, 800], [960, 640], [800, 600], [600, 500]
];

function openWs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json/list', (r) => {
      let d = ''; r.on('data', (x) => (d += x)); r.on('end', () => {
        const t = JSON.parse(d).find((p) => p.url.includes('canvas'));
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
      });
    });
  });
}

let mid = 10;
function send(ws, method, params) {
  return new Promise((resolve) => {
    const id = ++mid;
    ws.send(JSON.stringify({ id, method, params }));
    const h = (m) => { const j = JSON.parse(m); if (j.id === id) { ws.off('message', h); resolve(j); } };
    ws.on('message', h);
  });
}

(async () => {
  const c = await connect('canvas');
  const R = [];
  const t = (step, pass, detail) => R.push({ step, pass: !!pass, detail: String(detail) });
  const ws = await openWs();

  for (const [w, h] of SIZES) {
    await send(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false });
    await sleep(1000); // settle: ResizeObserver/resize handler + reflow

    const g = await c.evaluate(`
      const tb = document.getElementById('titlebar');
      const ovBtn = document.getElementById('overflow-btn');
      const vl = document.getElementById('zoom-label').getBoundingClientRect();
      const escapes = Array.from(tb.querySelectorAll('button, .drop, input'))
        .filter(el => getComputedStyle(el).display !== 'none')
        .filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; });
      return {
        vw: innerWidth, vh: innerHeight,
        fits: tb.scrollWidth <= tb.clientWidth + 1,
        overflowShown: !ovBtn.classList.contains('hidden'),
        zoomVisible: vl.width > 0 && vl.right <= innerWidth + 1 && vl.left >= -1,
        clipped: escapes.map(e => e.id || e.className).slice(0, 3)
      };
    `);
    t(`[${w}] viewport applied`, g.vw === w, `inner=${g.vw}x${g.vh}`);
    t(`[${w}] toolbar has no clipped controls`, g.fits || g.overflowShown, `fits=${g.fits} overflowShown=${g.overflowShown} clipped=${JSON.stringify(g.clipped)}`);
    t(`[${w}] zoom label inside viewport`, g.zoomVisible, String(g.zoomVisible));

    // right-click a node near the right edge → ctx menu must stay inside viewport
    const edge = await c.evaluate(`
      const els = Array.from(document.querySelectorAll('#world [data-node]'));
      let best = null;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const x = Math.min(r.x + 20, innerWidth - 12), y = Math.max(r.y + 6, 62);
        if (x < 4 || y > innerHeight - 4) continue;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !hit.closest('[data-node]')) continue;
        if (hit.closest('input,textarea,select,[contenteditable],button')) continue;
        if (!best || x > best.x) best = { x, y, id: hit.closest('[data-node]').dataset.node };
      }
      return best;
    `);
    if (edge) {
      await c.click(edge.x, edge.y, 'right');
      await sleep(150);
      const m = await c.evaluate(`
        const el = document.getElementById('ctx-menu');
        if (el.classList.contains('hidden')) return null;
        const r = el.getBoundingClientRect();
        return { in: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, w: Math.round(r.width), h: Math.round(r.height) };
      `);
      t(`[${w}] node ctx menu inside viewport`, !!m && m.in, m ? `${m.w}x${m.h}` : 'menu not open');
      await c.combo.escape();
    } else t(`[${w}] node ctx menu inside viewport`, false, 'no reachable node');

    // right-click an empty canvas corner → spawn menu clamped
    const sr = await c.evaluate(`
      const cands = [[innerWidth - 10, innerHeight - 10], [10, innerHeight - 10]];
      for (const [x, y] of cands) {
        const hit = document.elementFromPoint(x, y);
        if (hit === document.getElementById('board') || hit === document.getElementById('world')) return { x, y };
      }
      return null;
    `);
    if (sr) {
      await c.click(sr.x, sr.y, 'right');
      await sleep(150);
      const sp = await c.evaluate(`
        const el = document.getElementById('spawn-menu');
        if (el.classList.contains('hidden')) return null;
        const r = el.getBoundingClientRect();
        return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
      `);
      t(`[${w}] spawn menu clamped at corner`, sp === true, String(sp));
      await c.combo.escape();
    } else {
      t(`[${w}] spawn menu clamped at corner`, 'skip', 'corner not empty canvas');
    }

    // core interaction still works at this size: reset zoom, wheel zoom + shift marquee selects
    const zl = await c.rect('#zoom-label');
    await c.click(zl.x + zl.w / 2, zl.y + zl.h / 2); // back to 100%
    await sleep(300);
    await c.wheel(Math.round(w / 2), Math.round(h / 2), -100);
    const z = await c.evaluate(`return document.getElementById('zoom-label').textContent;`);
    const ep = await c.emptyPoint();
    if (ep) {
      const x1 = ep.x > w / 2 ? 15 : w - 15;
      const y1 = ep.y > h / 2 ? 70 : h - 12;
      await c.mouse('mouseMoved', ep.x, ep.y);
      await c.mouse('mousePressed', ep.x, ep.y, { button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
      await c.mouse('mouseMoved', x1, y1, { buttons: 1, modifiers: 8 });
      await c.mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
      await sleep(120);
      const sel = await c.evaluate(`return document.querySelectorAll('#world .active').length;`);
      t(`[${w}] marquee works at size`, sel >= 1, `zoom=${z} sel=${sel}`);
      await c.click(Math.round(w / 2), Math.round(h / 2)); // best-effort deselect
    } else t(`[${w}] marquee works at size`, false, 'no empty point found');
  }

  await send(ws, 'Emulation.clearDeviceMetricsOverride', {});
  await sleep(600);
  const back = await c.evaluate(`return { vw: innerWidth, ovf: !document.getElementById('overflow-btn').classList.contains('hidden') };`);
  t('native size restored, toolbar re-laid-out', back.vw !== 600, JSON.stringify(back));

  report('F(§23 responsive 1920→600)', R, c.errors);
  c.close();
  ws.close();
})().catch((e) => { console.log('SCRIPT F CRASH:', e.stack); process.exit(1); });
