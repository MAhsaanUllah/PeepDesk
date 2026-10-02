const { connect, sleep, report } = require('./r32-lib');

(async () => {
  const c = await connect('canvas');
  const R = [];
  const t = (step, pass, detail) => R.push({ step, pass: !!pass, detail: String(detail) });

  const view = () =>
    c.evaluate(`
      const m = getComputedStyle(document.getElementById('world')).transform;
      const z = document.getElementById('zoom-label').textContent;
      return { tr: m === 'none' ? [0, 0] : m.slice(7).split(' ').slice(-2).map(parseFloat), zoom: z };
    `);
  const pos = (id) =>
    c.evaluate(`const el=document.querySelector('[data-node="${id}"]'); return [parseFloat(el.style.left), parseFloat(el.style.top)];`);

  // ---- drag across the link URL input must not move the node ----
  let s = await c.snap();
  const link = s.nodes.find((n) => n.cls.includes('link'));
  if (link) {
    const r = await c.rect(`[data-node="${link.id}"] .node-url`);
    const v0 = await view();
    const p0 = await pos(link.id);
    await c.drag(r.x + r.w * 0.25, r.y + r.h / 2, r.x + r.w * 0.75, r.y + r.h / 2, 5);
    const p1 = await pos(link.id);
    const v1 = await view();
    t('drag on link URL input does not move node', p0[0] === p1[0] && p0[1] === p1[1], `${p0} -> ${p1}`);
    t('drag on link URL input does not pan', Math.abs(v1.tr[0] - v0.tr[0]) < 1 && Math.abs(v1.tr[1] - v0.tr[1]) < 1, `${v0.tr} -> ${v1.tr}`);
    await c.combo.escape();
  } else t('drag on link URL input does not move node', false, 'no link node');

  // ---- drag across a contenteditable must not move the node ----
  s = await c.snap();
  const card = s.nodes.find((n) => n.cls.includes('card') && !n.cls.includes('link') && !n.cls.includes('todo'));
  if (card) {
    const ce = await c.evaluate(`
      const el = document.querySelector('[data-node="${card.id}"] [contenteditable]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    `);
    if (ce) {
      const p0 = await pos(card.id);
      await c.drag(ce.x - 30, ce.y, ce.x + 30, ce.y + 10, 5);
      const p1 = await pos(card.id);
      t('drag inside contenteditable does not move node', p0[0] === p1[0] && p0[1] === p1[1], `${p0} -> ${p1}`);
      await c.combo.escape();
    } else t('drag inside contenteditable does not move node', false, 'no contenteditable');
  } else t('drag inside contenteditable does not move node', false, 'no plain card');

  // ---- wheel over open font dropdown must not zoom ----
  const btn = await c.rect('#font-drop-btn');
  await c.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
  await sleep(150);
  const open1 = await c.evaluate(`return !document.getElementById('font-drop-panel').classList.contains('hidden');`);
  const v2 = await view();
  const panel = await c.rect('#font-drop-panel');
  await c.wheel(panel.x + panel.w / 2, panel.y + panel.h / 2, 120);
  await sleep(120);
  const v3 = await view();
  t('wheel over open font dropdown does not zoom', v2.zoom === v3.zoom && Math.abs(v3.tr[0] - v2.tr[0]) < 1, `${v2.zoom} -> ${v3.zoom}`);
  await c.combo.escape();

  // ---- wheel + drag over open context menu must not zoom/pan ----
  s = await c.snap();
  let rp = null, ctxId = null;
  for (const n of s.nodes) {
    rp = await c.evaluate(`
      const el = document.querySelector('[data-node="${n.id}"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.x + 30, y = r.y + 8;
      if (x < 4 || y < 60 || x > innerWidth - 4 || y > innerHeight - 4) return null;
      const hit = document.elementFromPoint(x, y);
      return hit && hit.closest('[data-node="${n.id}"]') && !hit.closest('input,textarea,select,[contenteditable],button') ? { x, y } : null;
    `);
    if (rp) { ctxId = n.id; break; }
  }
  if (rp) {
    await c.click(rp.x, rp.y, 'right');
    await sleep(150);
    const menuOpen = await c.evaluate(`return !document.getElementById('ctx-menu').classList.contains('hidden');`);
    t('context menu opened for wheel/drag test', menuOpen, String(menuOpen));
    const v4 = await view();
    const mr = await c.rect('#ctx-menu');
    await c.wheel(mr.x + mr.w / 2, mr.y + mr.h / 2, -120);
    await sleep(120);
    const v5 = await view();
    t('wheel over open context menu does not zoom', v4.zoom === v5.zoom, `${v4.zoom} -> ${v5.zoom}`);
    await c.drag(mr.x + mr.w / 2, mr.y + 10, mr.x + mr.w / 2 + 60, mr.y + 40, 5);
    const v6 = await view();
    t('drag over open context menu does not pan', Math.abs(v6.tr[0] - v5.tr[0]) < 1 && Math.abs(v6.tr[1] - v5.tr[1]) < 1, `${v5.tr} -> ${v6.tr}`);
    const stillOpen = await c.evaluate(`return !document.getElementById('ctx-menu').classList.contains('hidden');`);
    t('context menu survived wheel/drag (no stray close/act)', stillOpen, String(stillOpen));
    await c.combo.escape();
  } else t('context menu opened for wheel/drag test', false, 'no reachable node');

  report('E(§16 pointer/wheel regressions)', R, c.errors);
  c.close();
})().catch((e) => { console.log('SCRIPT E CRASH:', e.stack); process.exit(1); });
