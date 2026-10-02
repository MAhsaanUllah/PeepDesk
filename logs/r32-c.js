const { connect, sleep, report } = require('./r32-lib');

(async () => {
  const c = await connect('canvas');
  const R = [];
  const t = (step, pass, detail) => R.push({ step, pass: !!pass, detail: String(detail) });

  const headOver = (id) =>
    c.evaluate(`
      const el = document.querySelector('[data-node="${id}"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      for (let y = r.y + 6; y <= r.y + Math.min(22, r.height - 6); y += 3) {
        for (let x = r.x + 6; x <= r.x + Math.min(r.width - 6, 150); x += 8) {
          if (x < 8 || y < 60 || x > innerWidth - 6 || y > innerHeight - 6) continue;
          const hit = document.elementFromPoint(x, y);
          if (!hit || !hit.closest('[data-node="${id}"]')) continue;
          if (hit.closest('input, textarea, select, [contenteditable], button')) continue;
          return { x, y };
        }
      }
      return null;
    `);

  const ctrlClick = async (x, y) => {
    await c.mouse('mouseMoved', x, y, { modifiers: 2 });
    await c.mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, modifiers: 2 });
    await sleep(40);
    await c.mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1, modifiers: 2 });
    await sleep(120);
  };

  const actives = () => c.evaluate(`return Array.from(document.querySelectorAll('#world .active')).map(e => e.dataset.node);`);

  let s = await c.snap();
  const pts = [];
  for (const n of s.nodes) {
    const p = await headOver(n.id);
    if (p) pts.push({ id: n.id, p, left: n.left, top: n.top });
    if (pts.length === 3) break;
  }
  t('found 3 clickable nodes', pts.length === 3, pts.length);

  // ---- PASS 5: ctrl+click multi-select ----
  await ctrlClick(pts[0].p.x, pts[0].p.y);
  await ctrlClick(pts[1].p.x, pts[1].p.y);
  await ctrlClick(pts[2].p.x, pts[2].p.y);
  let sel = await actives();
  t('ctrl+click builds 3-node selection', sel.length === 3 && [0, 1, 2].every((i) => sel.includes(pts[i].id)), sel.length + ' active');
  const fmtDisabled = await c.evaluate(`return document.getElementById('fmt-bold').disabled;`);
  t('formatting disabled for multi-select', fmtDisabled === true, fmtDisabled);
  // ctrl+click toggles off
  await ctrlClick(pts[2].p.x, pts[2].p.y);
  sel = await actives();
  t('ctrl+click toggles node off', sel.length === 2 && !sel.includes(pts[2].id), sel.length);
  await ctrlClick(pts[2].p.x, pts[2].p.y);

  // ---- PASS 6: group drag preserves spacing, ONE undo ----
  const grpSel = await actives();
  s = await c.snap();
  const pos0 = {};
  for (const n of s.nodes) if (grpSel.includes(n.id)) pos0[n.id] = { l: parseFloat(n.left), t: parseFloat(n.top) };
  let gp = null;
  let gpId = null;
  const idsG = Object.keys(pos0);
  for (const id of idsG) {
    gp = await headOver(id);
    if (gp) { gpId = id; break; }
  }
  t('found group drag anchor', !!gp, String(gpId));
  if (gp) {
  await c.drag(gp.x, gp.y, gp.x + 50, gp.y + 30, 6);
  s = await c.snap();
  let allMoved = true;
  let spacingOk = true;
  for (const id of idsG) {
    const n = s.nodes.find((x) => x.id === id);
    const dl = parseFloat(n.left) - pos0[id].l;
    const dt = parseFloat(n.top) - pos0[id].t;
    if (Math.abs(dl - 50) > 1 || Math.abs(dt - 30) > 1) allMoved = false;
  }
  const a = pos0[idsG[0]], b = pos0[idsG[1]];
  const na = s.nodes.find((x) => x.id === idsG[0]), nb = s.nodes.find((x) => x.id === idsG[1]);
  if (Math.abs(parseFloat(na.left) - parseFloat(nb.left) - (a.l - b.l)) > 0.5) spacingOk = false;
  t('group drag moved ALL 3 by +50/+30', allMoved, idsG.length + ' nodes checked');
  t('relative spacing preserved', spacingOk, 'pair delta unchanged');
  await c.combo.undo();
  s = await c.snap();
  let restored = true;
  for (const id of idsG) {
    const n = s.nodes.find((x) => x.id === id);
    if (Math.abs(parseFloat(n.left) - pos0[id].l) > 0.5 || Math.abs(parseFloat(n.top) - pos0[id].t) > 0.5) restored = false;
  }
  t('group drag undone by ONE Ctrl+Z', restored, 'positions back');
  }

  // ---- resize with multi-selection only touches grabbed node ----
  // elementFromPoint-verify the [data-resize] handle is actually reachable (corners may be covered at zoom)
  const cornerOver = (id) =>
    c.evaluate(`
      const el = document.querySelector('[data-node="${id}"]');
      const h = el && el.querySelector('[data-resize]');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (x < 2 || y < 60 || x > innerWidth - 2 || y > innerHeight - 2) return null;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !hit.closest('[data-resize]') || !hit.closest('[data-node="${id}"]')) return null;
      return { x, y };
    `);
  const before = await c.snap();
  let rid = null, rp = null;
  for (const id of idsG) {
    rp = await cornerOver(id);
    if (rp) { rid = id; break; }
  }
  if (rid) {
    const rBefore = before.nodes.find((n) => n.id === rid);
    const otherId = idsG.find((id) => id !== rid);
    await c.drag(rp.x, rp.y, rp.x + 30, rp.y + 20, 5);
    const after = await c.snap();
    const rNode = after.nodes.find((n) => n.id === rid);
    const oNode = after.nodes.find((n) => n.id === otherId);
    const oB = before.nodes.find((n) => n.id === otherId);
    t('resize grows only grabbed node', parseFloat(rNode.width) > parseFloat(rBefore.width) + 15, `${rBefore.width}->${rNode.width}`);
    t('other selected node untouched by resize', oNode.width === oB.width && oNode.height === oB.height, `${oNode.width}x${oNode.height}`);
    await c.combo.undo();
  } else {
    t('resize grows only grabbed node', false, 'no reachable resize handle among selected nodes');
    t('other selected node untouched by resize', false, 'skipped');
  }

  // ---- plain click clears to single, empty click clears all ----
  const ep = await c.emptyPoint();
  await c.click(ep.x, ep.y);
  sel = await actives();
  t('empty click clears selection', sel.length === 0, sel.length);

  // ---- PASS 7: normal empty drag = PAN ----
  const tr0 = await c.evaluate(`const m=getComputedStyle(document.getElementById('world')).transform; return m === 'none' ? [0,0] : m.slice(7).split(' ').slice(-2).map(parseFloat);`);
  await c.drag(ep.x, ep.y, ep.x + 80, ep.y, 6);
  const tr1 = await c.evaluate(`const m=getComputedStyle(document.getElementById('world')).transform; return m === 'none' ? [0,0] : m.slice(7).split(' ').slice(-2).map(parseFloat);`);
  t('normal empty drag pans (+80,0)', Math.abs(tr1[0] - tr0[0] - 80) < 2 && Math.abs(tr1[1] - tr0[1]) < 2, `${tr0} -> ${tr1}`);
  const selAfterPan = await actives();
  t('pan selects nothing', selAfterPan.length === 0, selAfterPan.length);

  // ---- shift+empty drag = MARQUEE ----
  const ep2 = await c.emptyPoint();
  const s2 = await c.snap();
  // choose a marquee that covers the whole middle band
  const x0 = ep2.x, y0 = Math.max(65, ep2.y - 120);
  const x1 = Math.min(890, x0 + 500), y1 = Math.min(645, y0 + 380);
  await c.mouse('mouseMoved', x0, y0);
  await c.mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  await c.mouse('mouseMoved', (x0 + x1) / 2, (y0 + y1) / 2, { buttons: 1, modifiers: 8 });
  await c.mouse('mouseMoved', x1, y1, { buttons: 1, modifiers: 8 });
  const marqueeVisible = await c.evaluate(`const m=document.getElementById('marquee'); return !m.classList.contains('hidden') && m.getBoundingClientRect().width > 50;`);
  t('marquee visible during shift-drag', marqueeVisible, marqueeVisible);
  await c.mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  await sleep(150);
  const marqueeHidden = await c.evaluate(`return document.getElementById('marquee').classList.contains('hidden');`);
  t('marquee hidden after release', marqueeHidden, marqueeHidden);
  sel = await actives();
  // expected: nodes whose screen rect intersects the marquee
  const expected = await c.evaluate(`
    const l = ${Math.min(x0, x1)}, tt = ${Math.min(y0, y1)}, r = ${Math.max(x0, x1)}, b = ${Math.max(y0, y1)};
    return Array.from(document.querySelectorAll('#world [data-node]'))
      .filter(el => { const q = el.getBoundingClientRect(); return q.left < r && q.right > l && q.top < b && q.bottom > tt; })
      .map(el => el.dataset.node);
  `);
  t('marquee selects exactly intersecting nodes', sel.length > 0 && sel.length === expected.length && sel.every((id) => expected.includes(id)), `got ${sel.length}, expected ${expected.length}`);
  const tr2 = await c.evaluate(`const m=getComputedStyle(document.getElementById('world')).transform; return m.slice(7).split(' ').slice(-2).map(parseFloat);`);
  t('shift-drag did NOT pan', Math.abs(tr2[0] - tr1[0]) < 2 && Math.abs(tr2[1] - tr1[1]) < 2, `${tr1} -> ${tr2}`);

  // ---- zoom to ~133% and repeat group drag + marquee ----
  const center = { x: 450, y: 350 };
  for (let i = 0; i < 3; i++) { await c.wheel(center.x, center.y, -100); await sleep(120); }
  const zoomTxt = await c.evaluate(`return document.getElementById('zoom-label').textContent;`);
  t('zoom ~133% via wheel', /13[0-9]%/.test(zoomTxt), zoomTxt);

  sel = await actives();
  t('selection survived zoom', sel.length > 0, sel.length);
  const s2b = await c.snap();
  const zpos = {};
  for (const n of s2b.nodes) if (sel.includes(n.id)) zpos[n.id] = { l: parseFloat(n.left), t: parseFloat(n.top) };
  const zids = Object.keys(zpos);
  if (zids.length >= 2) {
    let zg = null;
    for (const id of zids) { zg = await headOver(id); if (zg) break; }
    if (!zg) { t('group drag at 133%: world delta = screen/scale', false, 'no drag anchor visible'); }
    else {
    await c.drag(zg.x, zg.y, zg.x + 66, zg.y + 40, 6);
    const s3 = await c.snap();
    const scale = await c.evaluate(`const m=getComputedStyle(document.getElementById('world')).transform; return parseFloat(m.split('(')[1]);`);
    let ok = true;
    for (const id of zids) {
      const n = s3.nodes.find((x) => x.id === id);
      const dl = parseFloat(n.left) - zpos[id].l;
      if (Math.abs(dl - 66 / scale) > 2) ok = false;
    }
    t('group drag at 133%: world delta = screen/scale', ok, `scale=${scale.toFixed(3)} ids=${zids.length}`);
    await c.combo.undo();
    }
  } else {
    t('group drag at 133%: world delta = screen/scale', false, 'fewer than 2 nodes selected after zoom');
  }

  // marquee at zoom
  await c.click(center.x, center.y); // deselect (empty? may hit node) — then check
  const ep3 = await c.emptyPoint();
  await c.mouse('mouseMoved', ep3.x, ep3.y);
  await c.mouse('mousePressed', ep3.x, ep3.y, { button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  await c.mouse('mouseMoved', Math.min(880, ep3.x + 300), Math.max(70, ep3.y - 200), { buttons: 1, modifiers: 8 });
  await c.mouse('mouseReleased', Math.min(880, ep3.x + 300), Math.max(70, ep3.y - 200), { button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  await sleep(150);
  sel = await actives();
  t('marquee works at 133% zoom', sel.length >= 1, sel.length + ' selected');

  // ---- checkbox click toggles without dragging ----
  const zl = await c.rect('#zoom-label');
  await c.click(zl.x + zl.w / 2, zl.y + zl.h / 2); // back to 100% so the checkbox is on-screen
  await sleep(250);
  s = await c.snap();
  let todo = null, box = null;
  for (const n of s.nodes.filter((x) => x.cls.includes('todo'))) {
    const b = await c.rect(`[data-node="${n.id}"] [data-toggle]`);
    if (b && b.x > 4 && b.y > 60 && b.x + b.w < 896 && b.y + b.h < 644) { todo = n; box = b; break; }
  }
  if (todo) {
    const posBefore = { l: todo.left, t: todo.top };
    const trA = await c.evaluate(`const m=getComputedStyle(document.getElementById('world')).transform; return m.slice(7).split(' ').slice(-2).map(parseFloat);`);
    await c.click(box.x + box.w / 2, box.y + box.h / 2);
    const s4 = await c.snap();
    const tn = s4.nodes.find((n) => n.id === todo.id);
    const trB = await c.evaluate(`const m=getComputedStyle(document.getElementById('world')).transform; return m.slice(7).split(' ').slice(-2).map(parseFloat);`);
    t('checkbox toggles done state', tn.done !== todo.done, `done ${todo.done}->${tn.done}`);
    t('checkbox click caused no drag/pan', tn.left === posBefore.l && tn.top === posBefore.t && Math.abs(trA[0] - trB[0]) < 1, `pos ${tn.left},${tn.top}`);
    await c.combo.undo();
    const s5 = await c.snap();
    t('checkbox toggle undoable', s5.nodes.find((n) => n.id === todo.id).done === todo.done, 'restored');
  } else t('checkbox click toggles done state', false, 'no todo node');

  // ---- Escape clears selection ----
  s = await c.snap();
  let escP = null;
  for (const n of s.nodes) { escP = await headOver(n.id); if (escP) { var escId = n.id; break; } }
  if (escP) {
    await c.click(escP.x, escP.y);
    sel = await actives();
    await c.combo.escape();
    const selEsc = await actives();
    t('Escape clears selection (not editing)', sel.length >= 1 && selEsc.length === 0, `${sel.length}->${selEsc.length}`);
  } else t('Escape clears selection (not editing)', false, 'no clickable node');

  report('C(pass5-7 multi/drag/marquee)', R, c.errors);
  c.close();
})().catch((e) => { console.log('SCRIPT C CRASH:', e.stack); process.exit(1); });
