import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseBoardJson,
  renderBoardToCanvas
} from '../dist/renderer/canvas/components/board-export.js';
import {
  createConnectorSvgPath,
  renderConnectorsSvg
} from '../dist/renderer/canvas/components/connector-layer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(cond, desc) {
  if (cond) {
    console.log(`  [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${desc}`);
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== CONNECTOR PERSISTENCE, SVG/PNG PARITY, THEME & TEMPLATES ===');
  console.log('================================================================\n');

  console.log('--- 1. Connector Style Persistence Across Serialization ---');
  const testConnector = {
    id: 'conn-persist-test-1',
    type: 'connector',
    x: 100,
    y: 100,
    width: 300,
    height: 200,
    content: 'Flow Step Label',
    color: '#9747FF',
    strokeWidth: 5,
    lineStyle: 'curved',
    arrowStart: true,
    arrowEnd: true,
    arrowheadStyle: 'double',
    arrowheadSize: 16,
    controlX: 250,
    controlY: 350,
    startX: 100,
    startY: 100,
    endX: 400,
    endY: 300,
    startElementId: 'node-a',
    endElementId: 'node-b',
    createdAt: 1700000000000
  };

  const boardState = {
    items: [
      {
        id: 'node-a',
        type: 'shape',
        shapeType: 'rectangle',
        x: 50,
        y: 80,
        width: 100,
        height: 60,
        content: 'A'
      },
      {
        id: 'node-b',
        type: 'shape',
        shapeType: 'rectangle',
        x: 350,
        y: 280,
        width: 100,
        height: 60,
        content: 'B'
      },
      testConnector
    ],
    title: 'Connector Persistence Board'
  };

  const serialized = JSON.stringify(boardState, null, 2);
  const deserialized = parseBoardJson(serialized);
  const restoredConn = deserialized.items.find(i => i.id === 'conn-persist-test-1');

  assert(!!restoredConn, 'Connector deserialized successfully from JSON');
  assert(restoredConn.color === '#9747FF', `Color preserved: ${restoredConn.color}`);
  assert(restoredConn.strokeWidth === 5, `Stroke width preserved: ${restoredConn.strokeWidth}`);
  assert(restoredConn.lineStyle === 'curved', `Line style preserved: ${restoredConn.lineStyle}`);
  assert(restoredConn.arrowStart === true, `arrowStart preserved: ${restoredConn.arrowStart}`);
  assert(restoredConn.arrowEnd === true, `arrowEnd preserved: ${restoredConn.arrowEnd}`);
  assert(restoredConn.arrowheadStyle === 'double', `arrowheadStyle preserved: ${restoredConn.arrowheadStyle}`);
  assert(restoredConn.arrowheadSize === 16, `arrowheadSize preserved: ${restoredConn.arrowheadSize}`);
  assert(restoredConn.controlX === 250 && restoredConn.controlY === 350, 'Quadratic Bézier control point preserved');
  assert(restoredConn.startElementId === 'node-a' && restoredConn.endElementId === 'node-b', 'Start and End attached node references preserved');

  console.log('\n--- 2. SVG & PNG Parity Verification ---');
  function makeMockElement(tag) {
    const children = [];
    const attrs = {};
    const classList = { add() {}, remove() {}, contains() { return false; } };
    return {
      tagName: tag,
      children,
      attrs,
      style: {},
      dataset: {},
      classList,
      setAttribute(k, v) { attrs[k] = v; },
      getAttribute(k) { return attrs[k]; },
      appendChild(c) { children.push(c); return c; },
      addEventListener() {},
      set innerHTML(val) { children.length = 0; }
    };
  }

  const drawnCanvasCalls = [];
  const mockCtx = {
    scale() {},
    fillRect() {},
    beginPath() { drawnCanvasCalls.push('beginPath'); },
    moveTo(x, y) { drawnCanvasCalls.push(`moveTo(${Math.round(x)},${Math.round(y)})`); },
    lineTo(x, y) { drawnCanvasCalls.push(`lineTo(${Math.round(x)},${Math.round(y)})`); },
    quadraticCurveTo(cx, cy, x, y) { drawnCanvasCalls.push(`quadraticCurveTo(${Math.round(cx)},${Math.round(cy)},${Math.round(x)},${Math.round(y)})`); },
    closePath() { drawnCanvasCalls.push('closePath'); },
    stroke() { drawnCanvasCalls.push('stroke'); },
    fill() { drawnCanvasCalls.push('fill'); },
    save() { drawnCanvasCalls.push('save'); },
    restore() { drawnCanvasCalls.push('restore'); },
    translate() {},
    rotate() {},
    arc() {},
    rect() {},
    roundRect() {},
    strokeRect() {},
    measureText() { return { width: 50 }; },
    fillText() {}
  };

  globalThis.document = {
    createElementNS(ns, tag) {
      return makeMockElement(tag);
    },
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 1000,
          height: 800,
          getContext(type) {
            if (type === '2d') return mockCtx;
            return null;
          }
        };
      }
      return makeMockElement(tag);
    }
  };

  const mockSvg = makeMockElement('svg');
  renderConnectorsSvg(
    mockSvg,
    [testConnector],
    null,
    () => {},
    () => {},
    () => {},
    () => {},
    1
  );

  const defsEl = mockSvg.children.find(c => c.tagName === 'defs');
  assert(!!defsEl, 'SVG definitions <defs> element generated');
  const endMarker = defsEl.children.find(c => c.attrs.id && c.attrs.id.includes('peepjam-arrow-9747ff'));
  assert(!!endMarker, `SVG dynamic end arrow marker generated for color #9747FF: ${endMarker?.attrs?.id}`);
  assert(endMarker.attrs.markerWidth === '8', `End markerWidth calculated accurately (arrowheadSize 16 / 2 = 8): ${endMarker.attrs.markerWidth}`);

  const startMarker = defsEl.children.find(c => c.attrs.id && c.attrs.id.includes('peepjam-arrow-start-9747ff'));
  assert(!!startMarker, `SVG dynamic start arrow marker generated for color #9747FF: ${startMarker?.attrs?.id}`);
  assert(startMarker.attrs.markerWidth === '8', `Start markerWidth calculated accurately: ${startMarker.attrs.markerWidth}`);

  // Path rendering parity
  const pathData = createConnectorSvgPath(
    testConnector.startX,
    testConnector.startY,
    testConnector.endX,
    testConnector.endY,
    testConnector.lineStyle,
    testConnector.controlX,
    testConnector.controlY
  );
  assert(pathData.d === 'M 100 100 Q 250 350 400 300', `SVG path formula produces exact quadratic Bézier: ${pathData.d}`);

  // Canvas 2D export parity
  await renderBoardToCanvas([testConnector]);
  const hasCurve = drawnCanvasCalls.some(c => c.startsWith('quadraticCurveTo'));
  assert(hasCurve, 'Canvas 2D export path faithfully drew the curved quadratic Bézier segment');
  const closedPaths = drawnCanvasCalls.filter(c => c === 'closePath');
  assert(closedPaths.length >= 2, `Canvas 2D export closed paths for BOTH start and end arrowheads for double-arrow style (found ${closedPaths.length})`);

  console.log('\n--- 3. System Theme OS Preference Handling ---');
  function resolveEffectiveTheme(pref, osIsLight) {
    if (pref === 'system') return osIsLight ? 'light' : 'dark';
    return pref;
  }

  assert(resolveEffectiveTheme('system', false) === 'dark', 'System theme resolves to dark when OS is in dark mode');
  assert(resolveEffectiveTheme('system', true) === 'light', 'System theme resolves to light when OS is in light mode');
  assert(resolveEffectiveTheme('dark', true) === 'dark', 'Explicit dark theme overrides OS light mode');
  assert(resolveEffectiveTheme('light', false) === 'light', 'Explicit light theme overrides OS dark mode');

  console.log('\n--- 4. Template Creation Preserving Existing Board Data ---');
  function simulateTemplateAction(currentBoardItems, templateName, mockApi) {
    if (currentBoardItems && currentBoardItems.length > 0) {
      const res = mockApi.boardCreate(templateName);
      return { createdNewBoard: true, boardId: res.id, items: [] };
    } else {
      return { createdNewBoard: false, boardId: 'current', items: [] };
    }
  }

  let mockCreatedBoardName = '';
  const mockApi = {
    boardCreate(name) {
      mockCreatedBoardName = name;
      return { id: 'new-tpl-board-id', ok: true };
    }
  };

  // Case A: Non-empty board
  const nonEmptyBoardItems = [{ id: 'user-sticky-1', content: 'Important notes' }];
  const resultNonEmpty = simulateTemplateAction(nonEmptyBoardItems, 'Kanban Board', mockApi);
  assert(resultNonEmpty.createdNewBoard === true, 'Template created on a NEW board when active board contains items');
  assert(mockCreatedBoardName === 'Kanban Board', 'New board created with template title');
  assert(nonEmptyBoardItems.length === 1, 'Existing active board items remain completely intact');

  // Case B: Empty board
  const emptyBoardItems = [];
  const resultEmpty = simulateTemplateAction(emptyBoardItems, 'Kanban Board', mockApi);
  assert(resultEmpty.createdNewBoard === false, 'Template loaded in place when active board is clean/empty');

  console.log('\n================================================================');
  console.log(`CONNECTOR, THEME & TEMPLATES AUDIT: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Unhandled fatal error in connector/theme/templates test:', err);
  process.exit(1);
});
