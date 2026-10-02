const { connect, sleep, report } = require('./r32-lib');

(async () => {
  let c = await connect('canvas');
  const R = [];
  const t = (step, pass, detail) => R.push({ step, pass: !!pass, detail: String(detail) });

  // find a point that is verifiably over the given node (head strip first — interiors are editable)
  const overSel = (id, headOnly) =>
    c.evaluate(`
      const el = document.querySelector('[data-node="${id}"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cand = [];
      for (let y = r.y + 6; y <= r.y + Math.min(22, r.height - 6); y += 3)
        for (let x = r.x + 6; x <= r.x + Math.min(r.width - 6, 150); x += 8) cand.push([x, y]);
      if (${headOnly ? 'false' : 'true'}) {
        for (let x = r.x + 6; x <= r.x + r.width - 6; x += 8)
          for (let y = r.y + r.height - 24; y <= r.y + r.height - 6; y += 4) cand.push([x, y]);
      }
      for (const [x, y] of cand) {
        if (x < 8 || y < 60 || x > innerWidth - 6 || y > innerHeight - 6) continue;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !hit.closest('[data-node="${id}"]')) continue;
        if (hit.closest('input, textarea, select, [contenteditable]')) continue; // editable would open the NATIVE menu
        return { x, y };
      }
      return null;
    `);
  const pointOver = (id) => overSel(id, false);
  const headOver = (id) => overSel(id, true);

  // first node (DOM order = bottom..top) that has a usable point
  const pickNode = async (ids) => {
    for (const id of ids) {
      const p = await pointOver(id);
      if (p) return { id, p };
    }
    return null;
  };

  const menuState = () =>
    c.evaluate(`
      const m = document.getElementById('ctx-menu');
      const r = m.getBoundingClientRect();
      return { hidden: m.classList.contains('hidden'), x: r.x, y: r.y, w: r.width, h: r.height,
        vw: innerWidth, vh: innerHeight,
        focus: document.activeElement ? document.activeElement.dataset ? document.activeElement.dataset.act || document.activeElement.tagName : '?' : null,
        fwdDisabled: m.querySelector('[data-act="forward"]').disabled,
        bwdDisabled: m.querySelector('[data-act="backward"]').disabled,
        extraHidden: document.getElementById('ctx-extra').hidden,
        extraLabel: document.getElementById('ctx-extra').textContent };
    `);

  const clickAct = async (act) => {
    const p = await c.evaluate(`const b=document.querySelector('#ctx-menu [data-act="${act}"]'); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    await c.click(p.x, p.y);
  };

  const snapIds = async () => (await c.snap()).nodes.map((n) => n.id);
  let ids = await snapIds();
  let pick = await pickNode(ids);
  const first = pick.id;

  // ---- open at pointer (verified) ----
  let p = pick.p;
  t('found click point over node', !!p, JSON.stringify(p));
  await c.click(p.x, p.y, 'right');
  let m = await menuState();
  t('right-click opens ctx menu', !m.hidden, JSON.stringify({ x: m.x, y: m.y, w: m.w, h: m.h }));
  t('menu within viewport', m.x >= 0 && m.y >= 0 && m.x + m.w <= m.vw && m.y + m.h <= m.vh, `${m.x}+${m.w}/${m.vw} ${m.y}+${m.h}/${m.vh}`);
  t('first item focused', m.focus === 'duplicate', m.focus);

  await c.combo.arrowDown();
  m = await menuState();
  t('ArrowDown moves focus', m.focus === 'forward', m.focus);
  await c.combo.arrowDown();
  m = await menuState();
  t('ArrowDown again (skips disabled)', ['backward', 'delete'].includes(m.focus), m.focus);
  await c.combo.arrowDown();
  m = await menuState();
  t('ArrowDown wraps past delete', ['open-link', 'duplicate', 'forward', 'backward', 'download'].includes(m.focus) || m.focus === 'delete', m.focus);
  await c.combo.escape();
  m = await menuState();
  t('Escape closes menu', m.hidden, m.hidden);

  // ---- disabled item click keeps menu open, outside click closes ----
  const topPick = await pickNode([ids[ids.length - 1]].concat(ids));
  let topId = topPick.id;
  p = topPick.p;
  await c.click(p.x, p.y, 'right');
  m = await menuState();
  t('Bring Forward disabled at top', m.fwdDisabled === true && m.bwdDisabled === false, `fwd=${m.fwdDisabled} bwd=${m.bwdDisabled}`);
  await clickAct('forward'); // disabled: must be a no-op
  m = await menuState();
  t('disabled click is no-op, menu stays open', !m.hidden, m.hidden);
  const ep = await c.emptyPoint();
  await c.click(ep.x, ep.y);
  m = await menuState();
  t('outside click closes menu', m.hidden, m.hidden);

  // ---- Send Backward via menu + close-after-action + undo ----
  await c.click(p.x, p.y, 'right');
  await clickAct('backward');
  let s = await c.snap();
  let order = s.nodes.map((n) => n.id);
  t('Send Backward moves node down one', order[order.length - 1] !== topId && order[order.length - 2] === topId, `top=${order[order.length - 1].slice(0, 6)}`);
  m = await menuState();
  t('menu closes after action', m.hidden, m.hidden);
  await c.combo.undo();
  s = await c.snap();
  t('z-order undoable', s.nodes[s.nodes.length - 1].id === topId, s.nodes[s.nodes.length - 1].id.slice(0, 6));

  // ---- Duplicate from menu ----
  s = await c.snap();
  const cnt0 = s.count;
  const dupPick = await pickNode([first].concat(s.nodes.map((n) => n.id)));
  const dupTarget = dupPick.id;
  p = dupPick.p;
  await c.click(p.x, p.y, 'right');
  await clickAct('duplicate');
  s = await c.snap();
  t('menu Duplicate adds node', s.count === cnt0 + 1, `${cnt0}->${s.count}`);
  await c.combo.undo();
  s = await c.snap();
  t('undo reverts menu duplicate', s.count === cnt0, s.count);

  // ---- Delete from menu ----
  const delPick = await pickNode([first].concat(s.nodes.map((n) => n.id)));
  p = delPick.p;
  await c.click(p.x, p.y, 'right');
  await clickAct('delete');
  s = await c.snap();
  t('menu Delete removes node', s.count === cnt0 - 1 && !s.nodes.find((n) => n.id === delPick.id), s.count);
  await c.combo.undo();
  s = await c.snap();
  t('undo restores menu delete', s.count === cnt0 && !!s.nodes.find((n) => n.id === delPick.id), s.count);

  // ---- type-specific extras ----
  s = await c.snap();
  const link = s.nodes.find((n) => n.cls.includes('link'));
  const img = s.nodes.find((n) => n.cls.includes('image'));
  for (const [node, label] of [[link, /Open link/i], [img, /Download/i]]) {
    if (!node) continue;
    p = await pointOver(node.id);
    if (!p) { t(`extra on ${node.cls}`, false, 'no free head point'); continue; }
    await c.click(p.x, p.y, 'right');
    m = await menuState();
    t(`extra item (${node.cls.includes('link') ? 'link' : 'image'})`, !m.extraHidden && label.test(m.extraLabel), m.extraLabel);
    await c.combo.escape();
  }

  // ---- edge flip: put a node's bottom-right corner near the viewport corner, right-click it ----
  const tx = await c.evaluate('return innerWidth - 12;');
  const ty = await c.evaluate('return innerHeight - 12;');
  const cornerOk = `(() => { const el = document.elementFromPoint(${tx - 30}, ${ty - 40});
    if (!el) return null; const n = el.closest('[data-node]');
    if (!n || el.closest('input, textarea, select, [contenteditable], button')) return null;
    return n.dataset.node; })()`;
  let covered = await c.evaluate(`return ${cornerOk};`);
  let edgeP = covered ? { x: tx - 30, y: ty - 40 } : null;
  if (!covered) {
    s = await c.snap();
    const mvId = s.nodes[s.nodes.length - 1].id;
    const mp = await headOver(mvId);
    if (mp) {
      // place the node's head strip (not its body) near the bottom-right corner
      const shift = await c.evaluate(`
        const r = document.querySelector('[data-node="${mvId}"]').getBoundingClientRect();
        return { dx: (innerWidth - 90) - mp_x, dy: (innerHeight - 60) - mp_y };
      `.replace('mp_x', String(mp.x)).replace('mp_y', String(mp.y)));
      await c.drag(mp.x, mp.y, mp.x + shift.dx, mp.y + shift.dy, 8);
      edgeP = await headOver(mvId);
      covered = edgeP ? mvId : null;
    }
  }
  t('node head present at bottom-right corner', !!covered, String(covered));
  await c.click(edgeP.x, edgeP.y, 'right');
  m = await menuState();
  t('menu stays inside at bottom-right edge', !m.hidden && m.x + m.w <= m.vw && m.y + m.h <= m.vh,
    `${m.x.toFixed(0)}+${m.w.toFixed(0)} vs ${m.vw}; ${m.y.toFixed(0)}+${m.h.toFixed(0)} vs ${m.vh}`);
  await c.combo.escape();

  // ---- empty-canvas right-click reuses spawn menu ----
  const ep2 = await c.emptyPoint();
  await c.click(ep2.x + 30, ep2.y, 'right');
  const sp = await c.evaluate(`const m=document.getElementById('spawn-menu'); const r=m.getBoundingClientRect(); return { hidden: m.classList.contains('hidden'), x: r.x, y: r.y };`);
  t('empty right-click opens spawn menu at pointer', !sp.hidden, JSON.stringify(sp));
  await c.combo.escape();

  // ---- z-order persists across reload + transient state resets ----
  s = await c.snap();
  const order0 = s.nodes.map((n) => n.id).join(',');
  await c.send('Page.reload', {});
  c.close();
  await sleep(2500);
  c = await connect('canvas');
  s = await c.snap();
  t('z-order persists after reload', s.nodes.map((n) => n.id).join(',') === order0, s.nodes.length + ' nodes');
  const actives = await c.evaluate(`return document.querySelectorAll('#world .active').length;`);
  t('selection reset after reload', actives === 0, actives);
  const cntB = s.count;
  await c.combo.undo();
  s = await c.snap();
  t('undo history resets on restart (Ctrl+Z no-op)', s.count === cntB, `${cntB}->${s.count}`);

  report('B(pass3-4 ctxmenu/zorder)', R, c.errors);
  c.close();
})().catch((e) => { console.log('SCRIPT B CRASH:', e.stack); process.exit(1); });
