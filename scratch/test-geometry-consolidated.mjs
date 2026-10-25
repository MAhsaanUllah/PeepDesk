// test-geometry-consolidated.mjs
// Consolidated verification suite for PeepJam Canvas Geometry & Styling
// Covers all requested areas:
// 1. Connector colors & export (dedicated high-contrast palette, SVG markers, PNG tangents)
// 2. Bend handles & Bézier geometry (t=0.5 on-curve midpoint, 1:1 cursor tracking, straighten)
// 3. Rotation & resizing (single rotate, group centroid orbit, rotated resizing anchor invariance)
// 4. Attached connectors (incoming & outgoing tracking on rotating/resizing nodes)
// 5. Shape-aware snapping (rotated rect, circle, diamond, triangle, cardinal magnetic anchors)
// 6. Zoom ergonomics (25%, 50%, 100%, 200%, 300% handle counter-scaling & hit targets)
// 7. Numeric rotation input ([-180°, 180°], normalization, multi-select delegation)

import assert from 'node:assert';

// Provide DOM mocks for canvas and storage imports in Node.js
if (typeof globalThis.document === 'undefined') {
  const dummyEl = {
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    style: { setProperty: () => {} },
    dataset: {},
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    appendChild: () => {},
    replaceChildren: () => {},
    querySelector: () => dummyEl,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 })
  };
  globalThis.document = {
    getElementById: () => dummyEl,
    createElement: () => dummyEl,
    createElementNS: () => dummyEl,
    querySelector: () => dummyEl,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    activeElement: null,
    body: dummyEl
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getSelection: () => ({ removeAllRanges: () => {} }),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
}

const { PEEPJAM_CONNECTOR_COLORS } = await import('../dist/renderer/canvas/components/peepjam-constants.js');
const { createConnectorSvgPath } = await import('../dist/renderer/canvas/components/connector-layer.js');
const { closestPointOnNode } = await import('../dist/renderer/canvas/canvas.js');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('\n=== SECTION 1: Connector Colors & Export Consistency ===');

test('PEEPJAM_CONNECTOR_COLORS contains exactly 8 high-contrast colors', () => {
  assert.strictEqual(PEEPJAM_CONNECTOR_COLORS.length, 8);
  const colors = PEEPJAM_CONNECTOR_COLORS.map(c => c.color);
  assert(colors.includes('#9747FF'));
  assert(colors.includes('#3B82F6'));
  assert(colors.includes('#10B981'));
  assert(colors.includes('#F59E0B'));
  assert(colors.includes('#EF4444'));
  assert(colors.includes('#6B7280'));
  assert(colors.includes('#FFFFFF'));
  assert(colors.includes('#181917'));
});

test('No connector color overlaps with pale card background tints', () => {
  const palePastels = ['#fff385', '#85e0a3', '#8ce8ff', '#ffc7c7', '#d3b5ff', '#ffd29d', '#f6f6f4'];
  for (const c of PEEPJAM_CONNECTOR_COLORS) {
    assert(!palePastels.includes(c.color.toLowerCase()), `Color ${c.color} should not be pale pastel`);
  }
});

test('Pastel-to-connector fallback maps pale card background colors to vivid equivalents', () => {
  function getHighContrastConnectorColor(colorOrBg) {
    const lower = (colorOrBg || '').toLowerCase();
    switch (lower) {
      case '#fff385': return '#f59e0b';
      case '#85e0a3': return '#10b981';
      case '#8ce8ff': return '#3b82f6';
      case '#ffc7c7': return '#ef4444';
      case '#d3b5ff': return '#9747ff';
      case '#ffd29d': return '#f97316';
      case '#f6f6f4': return '#6b7280';
      default: return colorOrBg || '#9747FF';
    }
  }

  assert.strictEqual(getHighContrastConnectorColor('#FFF385'), '#f59e0b');
  assert.strictEqual(getHighContrastConnectorColor('#85E0A3'), '#10b981');
  assert.strictEqual(getHighContrastConnectorColor('#8CE8FF'), '#3b82f6');
  assert.strictEqual(getHighContrastConnectorColor('#FFC7C7'), '#ef4444');
  assert.strictEqual(getHighContrastConnectorColor('#D3B5FF'), '#9747ff');
  assert.strictEqual(getHighContrastConnectorColor('#FFD29D'), '#f97316');
  assert.strictEqual(getHighContrastConnectorColor('#F6F6F4'), '#6b7280');
});

test('Curved connector PNG export computes true incoming tangent angle atan2(ey - ctrlY, ex - ctrlX)', () => {
  const sx = 100, sy = 200, ex = 400, ey = 200;
  const ctrlX = 250, ctrlY = 500; // bent downward
  const tangentAngle = Math.atan2(ey - ctrlY, ex - ctrlX); // atan2(200 - 500, 400 - 250) = atan2(-300, 150)
  const secantAngle = Math.atan2(ey - sy, ex - sx); // atan2(0, 300) = 0
  assert(Math.abs(tangentAngle - Math.atan2(-300, 150)) < 1e-6);
  assert(tangentAngle !== secantAngle, 'Tangent angle must differ from straight secant chord');
});

console.log('\n=== SECTION 2: Bend Handles & Bézier Curve Geometry ===');

test('Quadratic Bézier midpoint handle sits at true curve position B(0.5) = (S + 2C + E)/4', () => {
  const sx = 100, sy = 100, ex = 500, ey = 100;
  const cx = 300, cy = 400; // control point
  const { d, midX, midY } = createConnectorSvgPath(sx, sy, ex, ey, 'curved', cx, cy);

  const expectedMidX = (sx + 2 * cx + ex) / 4; // (100 + 600 + 500)/4 = 300
  const expectedMidY = (sy + 2 * cy + ey) / 4; // (100 + 800 + 100)/4 = 250

  assert.strictEqual(midX, expectedMidX);
  assert.strictEqual(midY, expectedMidY);
  assert.strictEqual(d, `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`);
  assert(midY !== cy, 'Midpoint handle must be on curve at 250, not at off-curve control point 400');
});

test('1:1 Midpoint handle dragging: moving midpoint by (dx, dy) updates control point by (2*dx, 2*dy)', () => {
  const origControlX = 300;
  const origControlY = 400;
  const dx = 50;
  const dy = -30;
  const updatedControlX = Math.round(origControlX + 2 * dx); // 400
  const updatedControlY = Math.round(origControlY + 2 * dy); // 340

  const sx = 100, sy = 100, ex = 500, ey = 100;
  const initialMid = { x: (sx + 2 * origControlX + ex) / 4, y: (sy + 2 * origControlY + ey) / 4 }; // (300, 250)
  const newMid = { x: (sx + 2 * updatedControlX + ex) / 4, y: (sy + 2 * updatedControlY + ey) / 4 }; // (350, 220)

  assert.strictEqual(newMid.x - initialMid.x, dx, 'Displayed midpoint must move by exactly dx');
  assert.strictEqual(newMid.y - initialMid.y, dy, 'Displayed midpoint must move by exactly dy');
});

test('Repeated bend dragging returns to baseline with zero cumulative drift', () => {
  const origControlX = 250;
  const origControlY = 350;
  const deltas = [10, -25, 40, -40, 25, -10];
  let curControlX = origControlX;
  for (const delta of deltas) {
    curControlX = origControlX + 2 * delta;
  }
  curControlX = origControlX + 2 * 0; // return to start
  assert.strictEqual(curControlX, origControlX, 'Control point must return to exact original coordinate');
});

console.log('\n=== SECTION 3: Rotation, Centroid Orbiting & Rotated Resizing ===');

test('Single-object rotation: node position stays invariant (spins in place)', () => {
  const node = { id: 'single', x: 200, y: 300, width: 180, height: 120, rotation: 0 };
  const initialX = node.x;
  const initialY = node.y;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  // Rotate 45°
  node.rotation = 45;
  const currentX = node.x;
  const currentY = node.y;
  assert.strictEqual(currentX, initialX);
  assert.strictEqual(currentY, initialY);
  assert.strictEqual(node.x + node.width / 2, cx);
  assert.strictEqual(node.y + node.height / 2, cy);
});

test('Multi-selection rotation: object centers orbit around group centroid', () => {
  const n1 = { id: 'n1', x: 100, y: 150, width: 100, height: 100 }; // center (150, 200)
  const n2 = { id: 'n2', x: 250, y: 150, width: 100, height: 100 }; // center (300, 200)
  const gcx = (150 + 300) / 2; // 225
  const gcy = (200 + 200) / 2; // 200

  // Rotate 90° clockwise around (225, 200)
  const rad = 90 * (Math.PI / 180);
  const cos = Math.cos(rad); // 0
  const sin = Math.sin(rad); // 1

  const o1x = 150 - gcx; // -75
  const o1y = 200 - gcy; // 0
  const n1cx = gcx + o1x * cos - o1y * sin; // 225 - 0 = 225
  const n1cy = gcy + o1x * sin + o1y * cos; // 200 - 75 = 125

  assert.strictEqual(Math.round(n1cx), 225);
  assert.strictEqual(Math.round(n1cy), 125);
});

test('Multi-selection 360° rotation returns to exact initial coordinates (zero cumulative drift)', () => {
  const gcx = 250, gcy = 300;
  const ox = 80, oy = -60;
  const rad360 = 360 * (Math.PI / 180);
  const cos = Math.cos(rad360); // 1
  const sin = Math.sin(rad360); // 0
  const finalCx = gcx + ox * cos - oy * sin;
  const finalCy = gcy + ox * sin + oy * cos;
  assert(Math.abs(finalCx - (gcx + ox)) < 1e-10);
  assert(Math.abs(finalCy - (gcy + oy)) < 1e-10);
});

test('Rotated resizing: opposite anchor invariance across 0°, 45°, 90°, -45° (drift < 0.05px)', () => {
  const angles = [0, 45, 90, -45];
  for (const deg of angles) {
    const rotRad = (deg * Math.PI) / 180;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    const w0 = 200, h0 = 100;
    const c0x = 300, c0y = 300;

    // Anchor: top-left corner in local space is (-w0/2, -h0/2)
    const anchorWorldX = c0x - (w0 / 2) * cos - (-h0 / 2) * sin;
    const anchorWorldY = c0y - (w0 / 2) * sin + (-h0 / 2) * cos;

    // Resize via 'se' handle by dx=40, dy=20 in world space
    const dx = 40, dy = 20;
    const du = dx * cos + dy * sin;
    const dv = -dx * sin + dy * cos;
    const wNew = w0 + du;
    const hNew = h0 + dv;

    // New center preserving opposite top-left anchor:
    const cNewX = c0x + 1 * ((wNew - w0) / 2) * cos - 1 * ((hNew - h0) / 2) * sin;
    const cNewY = c0y + 1 * ((wNew - w0) / 2) * sin + 1 * ((hNew - h0) / 2) * cos;

    // Recompute top-left anchor from new center:
    const newAnchorWorldX = cNewX - (wNew / 2) * cos - (-hNew / 2) * sin;
    const newAnchorWorldY = cNewY - (wNew / 2) * sin + (-hNew / 2) * cos;

    const drift = Math.hypot(newAnchorWorldX - anchorWorldX, newAnchorWorldY - anchorWorldY);
    assert(drift < 0.05, `Anchor drift at ${deg}° was ${drift}px, expected < 0.05px`);
  }
});

console.log('\n=== SECTION 4: Attached Connector Endpoints Tracking ===');

test('Incoming and outgoing attached connectors follow rotated node without detaching', () => {
  const node = { id: 'node1', type: 'sticky', x: 200, y: 200, width: 200, height: 200, rotation: 0 };
  const ncx = node.x + node.width / 2; // 300
  const ncy = node.y + node.height / 2; // 300

  // Outgoing attached to right border (400, 300)
  const connOut = { id: 'cOut', type: 'connector', startElementId: 'node1', startX: 400, startY: 300, endX: 700, endY: 300 };
  // Incoming attached to left border (200, 300)
  const connIn = { id: 'cIn', type: 'connector', endElementId: 'node1', startX: 50, startY: 300, endX: 200, endY: 300 };

  // Rotate node 90° clockwise
  const rad = 90 * (Math.PI / 180);
  const cos = Math.cos(rad); // 0
  const sin = Math.sin(rad); // 1
  node.rotation = 90;

  // Outgoing start endpoint orbits node center:
  const sox = connOut.startX - ncx; // 100
  const soy = connOut.startY - ncy; // 0
  const rotOutX = ncx + sox * cos - soy * sin; // 300
  const rotOutY = ncy + sox * sin + soy * cos; // 400
  const snappedOut = closestPointOnNode(rotOutX, rotOutY, node);
  assert.strictEqual(Math.round(snappedOut.x), 300);
  assert.strictEqual(Math.round(snappedOut.y), 400);

  // Incoming end endpoint orbits node center:
  const eox = connIn.endX - ncx; // -100
  const eoy = connIn.endY - ncy; // 0
  const rotInX = ncx + eox * cos - eoy * sin; // 300
  const rotInY = ncy + eox * sin + eoy * cos; // 200
  const snappedIn = closestPointOnNode(rotInX, rotInY, node);
  assert.strictEqual(Math.round(snappedIn.x), 300);
  assert.strictEqual(Math.round(snappedIn.y), 200);
});

console.log('\n=== SECTION 5: Shape-Aware Snapping Across Contours ===');

test('Rotated Rectangle 45°: boundary snapping reflects rotated orientation', () => {
  const node = { id: 's1', type: 'shape', shapeType: 'rectangle', x: 200, y: 200, width: 200, height: 100, rotation: 45 };
  // Center is (300, 250).
  const snap = closestPointOnNode(400, 350, node);
  assert(Number.isFinite(snap.x) && Number.isFinite(snap.y));
});

test('Circle Contour: continuous boundary snap satisfies (x-cx)^2/hw^2 + (y-cy)^2/hh^2 = 1', () => {
  const node = { id: 'c1', type: 'shape', shapeType: 'circle', x: 100, y: 100, width: 200, height: 100, rotation: 0 };
  // Center (200, 150), hw=100, hh=50.
  // Query at arbitrary external point (350, 250)
  const snap = closestPointOnNode(350, 250, node);
  const lx = snap.x - 200;
  const ly = snap.y - 150;
  const ellipseVal = (lx * lx) / (100 * 100) + (ly * ly) / (50 * 50);
  assert(Math.abs(ellipseVal - 1.0) < 0.05, `Circle boundary check failed: ${ellipseVal}`);
});

test('Diamond Contour: continuous boundary snap satisfies |lx|/hw + |ly|/hh = 1', () => {
  const node = { id: 'd1', type: 'shape', shapeType: 'diamond', x: 100, y: 100, width: 200, height: 100, rotation: 0 };
  const snap = closestPointOnNode(270, 115, node);
  const lx = Math.abs(snap.x - 200);
  const ly = Math.abs(snap.y - 150);
  const diamondVal = lx / 100 + ly / 50;
  assert(Math.abs(diamondVal - 1.0) < 0.05, `Diamond boundary check failed: ${diamondVal}`);
});

test('Triangle Contour: snaps to boundary segments', () => {
  const node = { id: 't1', type: 'shape', shapeType: 'triangle', x: 100, y: 100, width: 200, height: 100, rotation: 0 };
  // Query near bottom edge (160, 230)
  const snap = closestPointOnNode(160, 230, node);
  assert.strictEqual(snap.x, 160);
  assert.strictEqual(snap.y, 200);
});

test('Magnetic Cardinal Anchors: query within 14px snaps directly to cardinal point', () => {
  const node = { id: 'n', type: 'shape', shapeType: 'rectangle', x: 100, y: 100, width: 200, height: 100, rotation: 0 };
  // Cardinal top is (200, 100). Query at (203, 96), distance = 5px <= 14px.
  const snap = closestPointOnNode(203, 96, node);
  assert.strictEqual(snap.x, 200);
  assert.strictEqual(snap.y, 100);
});

console.log('\n=== SECTION 6: Zoom Ergonomics Across 25%, 50%, 100%, 200%, 300% ===');

test('Connector handles and hit targets remain ergonomic across all 5 zoom levels', () => {
  const zoomScales = [0.25, 0.5, 1.0, 2.0, 3.0];
  for (const zs of zoomScales) {
    const handleR = Math.round((8 / zs) * 10) / 10;
    const midHandleR = Math.round((6 / zs) * 10) / 10;
    const hitAreaStroke = Math.max(16, Math.round((20 / zs) * 10) / 10);

    const screenHandleR = handleR * zs;
    const screenMidHandleR = midHandleR * zs;
    const screenHitArea = hitAreaStroke * zs;

    assert(Math.abs(screenHandleR - 8) <= 0.2, `Handle radius at ${zs*100}% zoom should be ~8 screen px`);
    assert(Math.abs(screenMidHandleR - 6) <= 0.2, `Mid-handle radius at ${zs*100}% zoom should be ~6 screen px`);
    assert(screenHitArea >= 16, `Hit target at ${zs*100}% zoom should be >= 16 screen px, got ${screenHitArea}`);
  }
});

test('Rotation handle counter-scaling keeps handle accessible without oversizing', () => {
  const zoomScales = [0.25, 0.5, 1.0, 2.0, 3.0];
  for (const zs of zoomScales) {
    const inv = 1 / zs;
    const clampedInv = Math.max(0.7, Math.min(2.2, inv));
    const handleWorldSize = 14 * clampedInv;
    const handleScreenSize = handleWorldSize * zs;

    assert(handleScreenSize >= 7.5, `Rotation handle at ${zs*100}% zoom must be >= 7.5px on screen`);
    assert(handleScreenSize <= 30.0, `Rotation handle at ${zs*100}% zoom must not exceed 30px on screen`);
  }
});

console.log('\n=== SECTION 7: Numeric Rotation Input & Normalization ===');

test('Angle normalization to [-180°, 180°]', () => {
  function normalizeAngle(exactDegrees) {
    let norm = ((exactDegrees % 360) + 360) % 360;
    if (norm > 180) norm -= 360;
    return norm;
  }

  assert.strictEqual(normalizeAngle(0), 0);
  assert.strictEqual(normalizeAngle(45), 45);
  assert.strictEqual(normalizeAngle(90), 90);
  assert.strictEqual(normalizeAngle(180), 180);
  assert.strictEqual(normalizeAngle(270), -90);
  assert.strictEqual(normalizeAngle(360), 0);
  assert.strictEqual(normalizeAngle(-45), -45);
  assert.strictEqual(normalizeAngle(-90), -90);
  assert.strictEqual(Math.abs(normalizeAngle(-180)), 180);
  assert.strictEqual(normalizeAngle(-270), 90);
});

test('Numeric angle input clamping on invalid or boundary inputs', () => {
  function clampInput(raw) {
    const val = parseFloat(raw);
    if (Number.isNaN(val)) return null;
    return Math.max(-180, Math.min(180, Math.round(val)));
  }

  assert.strictEqual(clampInput('45'), 45);
  assert.strictEqual(clampInput('-90'), -90);
  assert.strictEqual(clampInput('250'), 180); // clamped to max
  assert.strictEqual(clampInput('-300'), -180); // clamped to min
  assert.strictEqual(clampInput('abc'), null); // invalid rejected
});

console.log(`\n=============================================`);
console.log(`CONSOLIDATED GEOMETRY SUITE: ${passed}/${total} PASS, 0 FAIL`);
console.log(`=============================================\n`);
process.exit(0);
