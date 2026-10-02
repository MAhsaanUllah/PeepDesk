const WS = require('ws');
const http = require('http');

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        try { res(JSON.parse(d)); } catch (e) { rej(e); }
      });
    }).on('error', rej);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(pagePart = 'canvas') {
  const list = await getJSON('http://127.0.0.1:9223/json/list');
  const t = list.find((x) => x.type === 'page' && x.url.includes(pagePart));
  if (!t) throw new Error('no target for ' + pagePart);
  const ws = new WS(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r) => ws.on('open', r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.on('message', (buf) => {
    const j = JSON.parse(buf.toString());
    if (j.id !== undefined) {
      const p = pending.get(j.id);
      pending.delete(j.id);
      if (p) p(j.error ? { __error: j.error } : { __result: j.result });
    } else if (j.method === 'Runtime.exceptionThrown') {
      errors.push('EX: ' + JSON.stringify(j.params.exceptionDetails).slice(0, 300));
    } else if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') {
      errors.push('LOG: ' + j.params.entry.text.slice(0, 200));
    } else if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') {
      errors.push('CON: ' + JSON.stringify(j.params.args).slice(0, 200));
    }
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Log.enable');

  const evaluate = async (body) => {
    const r = await send('Runtime.evaluate', {
      expression: `(async()=>{${body}})()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (r.__error) throw new Error(JSON.stringify(r.__error));
    if (r.__result && r.__result.exceptionDetails) {
      throw new Error('PAGE-EX ' + JSON.stringify(r.__result.exceptionDetails).slice(0, 400));
    }
    return r.__result.result.value;
  };

  const mouse = (type, x, y, extra = {}) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`bad coord ${type} ${x},${y}`);
    return send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  };
  const click = async (x, y, button = 'left') => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, { button, buttons: button === 'left' ? 1 : 2, clickCount: 1 });
    await sleep(40);
    await mouse('mouseReleased', x, y, { button, buttons: 0, clickCount: 1 });
    await sleep(120);
  };
  const drag = async (x0, y0, x1, y1, steps = 6, opts = {}) => {
    await mouse('mouseMoved', x0, y0);
    await mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1, ...opts });
    for (let i = 1; i <= steps; i++) {
      await mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, { buttons: 1 });
      await sleep(25);
    }
    await mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 });
    await sleep(150);
  };
  const wheel = (x, y, deltaY) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  const key = async (k, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await sleep(80);
  };
  const combo = {
    undo: () => key('z', 'KeyZ', 90, 2),
    redoShift: () => key('z', 'KeyZ', 90, 2 | 8),
    redoY: () => key('y', 'KeyY', 89, 2),
    dup: () => key('d', 'KeyD', 68, 2),
    del: () => key('Delete', 'Delete', 46, 0),
    backspace: () => key('Backspace', 'Backspace', 8, 0),
    escape: () => key('Escape', 'Escape', 27, 0),
    arrowDown: () => key('ArrowDown', 'ArrowDown', 40, 0),
    enter: () => key('Enter', 'Enter', 13, 0)
  };

  const api = { ws, send, evaluate, mouse, click, drag, wheel, key, combo, errors, close: () => ws.close() };

  api.snap = () =>
    evaluate(`
      const w = document.getElementById('world');
      const out = [];
      Array.from(w.children).forEach((el, i) => {
        if (!el.dataset || !el.dataset.node) return;
        const nt = el.querySelector('.node-text');
        out.push({ i, id: el.dataset.node, cls: el.className, left: el.style.left, top: el.style.top,
          width: el.style.width, height: el.style.height, active: el.classList.contains('active'),
          done: el.classList.contains('done'), text: nt ? (nt.textContent || '').slice(0, 30) : null });
      });
      return { count: out.length, nodes: out, transform: getComputedStyle(w).transform };
    `);

  api.rect = (sel) =>
    evaluate(`
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    `);

  api.emptyPoint = () =>
    evaluate(`
      const b = document.getElementById('board');
      const r = b.getBoundingClientRect();
      for (let y = r.bottom - 90; y > r.top + 80; y -= 12) {
        for (let x = r.left + 20; x < r.right - 160; x += 12) {
          const t = document.elementFromPoint(x, y);
          if (t === b || t.id === 'world') return { x, y };
        }
      }
      return null;
    `);

  api.nodeHead = (id) =>
    evaluate(`
      const el = document.querySelector('[data-node="${id}"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + Math.min(40, r.width / 2), y: r.y + 12 };
    `);

  return api;
}

function report(name, results, errors) {
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.step} | ${r.detail}`);
  const fails = results.filter((r) => !r.pass).length;
  console.log(`SUMMARY ${name}: ${results.length - fails}/${results.length} passed`);
  if (errors.length) console.log('PAGE ERRORS:', JSON.stringify(errors.slice(0, 8), null, 1));
  else console.log('PAGE ERRORS: none');
}

module.exports = { connect, sleep, report };
