const { connect, sleep, report } = require('./r32-lib');

(async () => {
  const c = await connect('canvas');
  const R = [];
  const t = (step, pass, detail) => R.push({ step, pass: !!pass, detail: String(detail) });

  const byId = (snap, id) => snap.nodes.find((n) => n.id === id);

  // ---- PASS 1: create/undo/redo ----
  const s0 = await c.snap();
  const tb = await c.rect('#tb-thought');
  await c.click(tb.x + tb.w / 2, tb.y + tb.h / 2);
  const s1 = await c.snap();
  const created = s1.nodes.find((n) => !s0.nodes.some((o) => o.id === n.id));
  t('create thought via toolbar', s1.count === s0.count + 1 && !!created, `count ${s0.count}->${s1.count}`);

  // blur (empty click) so canvas-level shortcuts are not swallowed by the fresh editor
  const ep = await c.emptyPoint();
  await c.click(ep.x, ep.y);
  await c.combo.undo();
  const s2 = await c.snap();
  t('Ctrl+Z removes created node', s2.count === s0.count && !byId(s2, created.id), `count ${s2.count}`);

  await c.combo.redoShift();
  const s3 = await c.snap();
  t('Ctrl+Shift+Z re-creates node', s3.count === s0.count + 1 && !!byId(s3, created.id), `count ${s3.count}`);

  await c.combo.undo();
  await c.combo.redoY();
  const s4 = await c.snap();
  t('Ctrl+Z then Ctrl+Y (alt redo)', s4.count === s0.count + 1 && !!byId(s4, created.id), `count ${s4.count}`);

  // ---- drag = ONE undo op ----
  const head = await c.nodeHead(created.id);
  const before = await c.snap();
  const bNode = byId(before, created.id);
  await c.drag(head.x, head.y, head.x + 60, head.y + 40, 6);
  const afterDrag = await c.snap();
  const aNode = byId(afterDrag, created.id);
  const dx = parseFloat(aNode.left) - parseFloat(bNode.left);
  const dy = parseFloat(aNode.top) - parseFloat(bNode.top);
  t('drag moves node ~+60/+40', Math.abs(dx - 60) < 2 && Math.abs(dy - 40) < 2, `dx=${dx} dy=${dy}`);
  await c.combo.undo();
  const uDrag = await c.snap();
  const uNode = byId(uDrag, created.id);
  t('one Ctrl+Z restores full drag', uNode.left === bNode.left && uNode.top === bNode.top, `${uNode.left},${uNode.top} vs ${bNode.left},${bNode.top}`);
  await c.combo.redoShift();
  const rDrag = await c.snap();
  const rNode = byId(rDrag, created.id);
  t('Ctrl+Shift+Z replays drag', rNode.left === aNode.left && rNode.top === aNode.top, `${rNode.left},${rNode.top}`);

  // ---- resize = ONE undo op ----
  const nr = await c.rect(`[data-node="${created.id}"]`);
  await c.drag(nr.x + nr.w - 4, nr.y + nr.h - 4, nr.x + nr.w + 26, nr.y + nr.h + 20, 5);
  const afterRe = await c.snap();
  const reNode = byId(afterRe, created.id);
  t('resize grows w/h', parseFloat(reNode.width) > parseFloat(aNode.width) + 20 && parseFloat(reNode.height) > parseFloat(aNode.height) + 10,
    `${aNode.width}x${aNode.height} -> ${reNode.width}x${reNode.height}`);
  await c.combo.undo();
  const uRe = await c.snap();
  const uReNode = byId(uRe, created.id);
  t('Ctrl+Z restores size', uReNode.width === aNode.width && uReNode.height === aNode.height, `${uReNode.width}x${uReNode.height}`);

  // ---- content edit via DOM+InputEvent (OS-typing blocked for background windows) ----
  await c.evaluate(`
    const el = document.querySelector('[data-node="${created.id}"] .node-text');
    el.focus();
    el.textContent = 'ZZEDITEDZZ';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'ZZEDITEDZZ' }));
    el.blur();
    return true;
  `);
  const afterEdit = await c.snap();
  t('edit persists to state', byId(afterEdit, created.id).text === 'ZZEDITEDZZ', byId(afterEdit, created.id).text);
  await c.combo.undo();
  const uEdit = await c.snap();
  t('Ctrl+Z reverts edit', byId(uEdit, created.id).text !== 'ZZEDITEDZZ', JSON.stringify(byId(uEdit, created.id).text));

  // ---- PASS 2: duplicate ----
  const ep2 = await c.emptyPoint();
  await c.click(ep2.x, ep2.y);
  const h2 = await c.nodeHead(created.id);
  await c.click(h2.x, h2.y); // select without focusing editor
  const ids0 = (await c.snap()).nodes.map((n) => n.id);
  await c.combo.dup();
  const s5 = await c.snap();
  const clones = s5.nodes.filter((n) => !ids0.includes(n.id));
  const cn = clones[0];
  const orig = byId(s5, created.id);
  t('Ctrl+D duplicates (count +1)', clones.length === 1, `count ${s5.count}`);
  t('duplicate has NEW id + offset +24/+24', cn && cn.id !== created.id &&
    parseFloat(cn.left) === parseFloat(orig.left) + 24 && parseFloat(cn.top) === parseFloat(orig.top) + 24,
    cn ? `${cn.left},${cn.top} vs orig ${orig.left},${orig.top}` : 'no clone');
  t('duplicate is selected', cn && cn.active, cn ? cn.active : '');
  await c.combo.undo();
  const s6 = await c.snap();
  t('Ctrl+Z undoes duplicate as ONE op', s6.count === s5.count - 1 && !byId(s6, cn.id), `count ${s6.count}`);
  await c.combo.redoShift();
  const s7 = await c.snap();
  t('Ctrl+Shift+Z redoes duplicate', s7.count === s6.count + 1 && !!s7.nodes.find((n) => n.id === cn.id), `count ${s7.count}`);

  // ---- Delete key ----
  const ep3 = await c.emptyPoint();
  await c.click(ep3.x, ep3.y);
  const h3 = await c.nodeHead(cn.id);
  await c.click(h3.x, h3.y);
  await c.combo.del();
  const s8 = await c.snap();
  t('Delete key removes selected', s8.count === s7.count - 1 && !byId(s8, cn.id), `count ${s8.count}`);
  await c.combo.undo();
  const s9 = await c.snap();
  t('Ctrl+Z restores deleted node', s9.count === s8.count + 1 && !!byId(s9, cn.id), `count ${s9.count}`);

  // ---- editing safety: Backspace inside text must NOT delete the node ----
  await c.evaluate(`
    const el = document.querySelector('[data-node="${cn.id}"] .node-text');
    el.focus();
    el.textContent = 'abc';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'abc' }));
    return true;
  `);
  await c.combo.backspace();
  await c.combo.del();
  const s10 = await c.snap();
  t('Backspace/Delete while editing keeps node', s10.count === s9.count && !!byId(s10, cn.id), `count ${s10.count}`);
  await c.evaluate(`document.activeElement && document.activeElement.blur(); return true;`);

  // ---- Escape clears selection ----
  const ep4 = await c.emptyPoint();
  await c.click(ep4.x, ep4.y);
  const h4 = await c.nodeHead(cn.id);
  await c.click(h4.x, h4.y);
  const selNow = await c.snap();
  await c.combo.escape();
  const afterEsc = await c.snap();
  t('click selects, Escape clears', byId(selNow, cn.id).active && !byId(afterEsc, cn.id).active, `${byId(selNow, cn.id).active}/${byId(afterEsc, cn.id).active}`);

  // ---- trash button undoable ----
  const h5 = await c.nodeHead(cn.id);
  await c.click(h5.x, h5.y);
  const trash = await c.rect(`[data-node="${cn.id}"] [data-delete]`);
  await c.click(trash.x + trash.w / 2, trash.y + trash.h / 2);
  const s11 = await c.snap();
  t('trash button deletes', !byId(s11, cn.id), `count ${s11.count}`);
  await c.combo.undo();
  const s12 = await c.snap();
  t('Ctrl+Z restores trash-deleted node', !!byId(s12, cn.id), `count ${s12.count}`);

  report('A(pass1-2 history/delete/duplicate)', R, c.errors);
  c.close();
})().catch((e) => { console.log('SCRIPT A CRASH:', e.message); process.exit(1); });
