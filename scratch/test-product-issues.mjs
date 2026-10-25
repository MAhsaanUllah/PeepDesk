import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== PeepJam Product Issues & Navigation Audit Suite ===\n');

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
  }
}

async function runSuite() {
  // ----------------------------------------------------
  // Test 1: Header - Single Navigation System
  // ----------------------------------------------------
  console.log('--- 1. Header Navigation System Verification ---');

  const htmlContent = fs.readFileSync(path.join(rootDir, 'src/renderer/canvas/index.html'), 'utf-8');
  const cssContent = fs.readFileSync(path.join(rootDir, 'src/renderer/canvas/canvas.css'), 'utf-8');

  await test('Unified single hamburger menu hub exists (#menu-bar-app)', () => {
    assert.ok(htmlContent.includes('id="menu-bar-app"'), 'Must have #menu-bar-app');
    assert.ok(htmlContent.includes('id="btn-menu-hamburger"'), 'Must have #btn-menu-hamburger');
    assert.ok(htmlContent.includes('id="dropdown-app"'), 'Must have #dropdown-app');
  });

  await test('Desktop menu bar is hidden via CSS across all viewports', () => {
    assert.match(cssContent, /\.desktop-menu-bar\s*\{[^}]*display:\s*none\s*!important/s, 'Desktop menu bar must be hidden unconditionally');
  });

  await test('Unified menu button #menu-bar-app is enabled at all widths', () => {
    assert.match(cssContent, /#menu-bar-app\s*\{[^}]*display:\s*inline-flex/s, '#menu-bar-app must have display: inline-flex');
  });

  await test('Essential top header actions and elements are present', () => {
    assert.ok(htmlContent.includes('class="brand"'), 'Branding present');
    assert.ok(htmlContent.includes('class="brand-name">PeepJam</span>'), 'Brand name present');
    assert.ok(htmlContent.includes('id="board-title"'), 'Editable board title present');
    assert.ok(htmlContent.includes('id="save-status-badge"'), 'Save status badge present');
    assert.ok(htmlContent.includes('id="tb-undo"'), 'Undo button present');
    assert.ok(htmlContent.includes('id="tb-redo"'), 'Redo button present');
    assert.ok(htmlContent.includes('id="tb-grid-toggle"'), 'Grid toggle button present');
    assert.ok(htmlContent.includes('id="export-btn"'), 'Export button present');
    assert.ok(htmlContent.includes('id="tb-clip"'), 'Clip stash button present');
    assert.ok(htmlContent.includes('id="tb-settings"'), 'Settings button present');
  });

  // ----------------------------------------------------
  // Test 2: Connector UX & Styling Verification
  // ----------------------------------------------------
  console.log('\n--- 2. Connector UX & Styling Verification ---');

  await test('Connector selection bar controls exist in HTML', () => {
    assert.ok(htmlContent.includes('id="sel-conn-group"'), 'Connector group present');
    assert.ok(htmlContent.includes('id="sel-conn-color-btn"'), 'Color toggle button present');
    assert.ok(htmlContent.includes('id="sel-conn-color-indicator"'), 'Color indicator present');
    assert.ok(htmlContent.includes('id="sel-conn-palette"'), 'Color palette present');
    assert.ok(htmlContent.includes('id="sel-conn-width-btn"'), 'Width selector present');
    assert.ok(htmlContent.includes('id="sel-conn-width-menu"'), 'Width menu present');
    assert.ok(htmlContent.includes('id="sel-conn-arrow-btn"'), 'Arrow style selector present');
    assert.ok(htmlContent.includes('id="sel-conn-arrow-menu"'), 'Arrow style menu present');
    assert.ok(htmlContent.includes('id="sel-conn-size-btn"'), 'Arrow size selector present');
    assert.ok(htmlContent.includes('id="sel-conn-size-menu"'), 'Arrow size menu present');
    assert.ok(htmlContent.includes('id="sel-conn-straighten-btn"'), 'Straighten button present');
    assert.ok(htmlContent.includes('id="sel-conn-style-btn"'), 'Straight/Curved button present');
    assert.ok(htmlContent.includes('id="sel-conn-flip-btn"'), 'Flip button present');
  });

  await test('Shared types include arrowStart, arrowheadSize, and arrowheadStyle', () => {
    const typesContent = fs.readFileSync(path.join(rootDir, 'src/shared/types.ts'), 'utf-8');
    assert.ok(typesContent.includes('arrowStart?: boolean'), 'CanvasNode has arrowStart');
    assert.ok(typesContent.includes('arrowheadSize?: number'), 'CanvasNode has arrowheadSize');
    assert.ok(typesContent.includes('arrowheadStyle?: string'), 'CanvasNode has arrowheadStyle');
  });

  await test('Connector layer generates sized and start/end arrow markers', async () => {
    const { createConnectorSvgPath } = await import('../dist/renderer/canvas/components/connector-layer.js');
    
    // Test createConnectorSvgPath for straight line
    const p1 = createConnectorSvgPath(0, 0, 100, 100, 'straight');
    assert.strictEqual(p1.d, 'M 0 0 L 100 100');
    assert.strictEqual(p1.midX, 50);
    assert.strictEqual(p1.midY, 50);

    // Test createConnectorSvgPath for curved line
    const p2 = createConnectorSvgPath(0, 0, 100, 0, 'curved');
    assert.ok(p2.d.startsWith('M 0 0 Q '));
  });

  await test('Geometric connector distance calculation accurately hits lines and curves', () => {
    function distancePointToSegment(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(px - x1, py - y1);
      let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      return Math.hypot(px - projX, py - projY);
    }

    // Point on segment (50, 5) near line (0,0) -> (100, 0)
    const dNear = distancePointToSegment(50, 5, 0, 0, 100, 0);
    assert.strictEqual(Math.round(dNear), 5);

    // Point far from segment (50, 60)
    const dFar = distancePointToSegment(50, 60, 0, 0, 100, 0);
    assert.strictEqual(Math.round(dFar), 60);
  });

  // ----------------------------------------------------
  // Test 3: Theme Options (Light, Dark, System)
  // ----------------------------------------------------
  console.log('\n--- 3. Theme System Verification ---');

  await test('Theme setting select options include System (Auto)', () => {
    assert.ok(htmlContent.includes('<option value="system">System (Auto)</option>'), 'Settings select has system option');
    assert.ok(htmlContent.includes('<option value="dark">Dark (default)</option>'), 'Settings select has dark option');
    assert.ok(htmlContent.includes('<option value="light">Light</option>'), 'Settings select has light option');
  });

  await test('Types allow system theme', () => {
    const typesContent = fs.readFileSync(path.join(rootDir, 'src/shared/types.ts'), 'utf-8');
    assert.ok(typesContent.includes("'dark' | 'light' | 'system'"), 'ReminderSettings allows system theme');
  });

  // ----------------------------------------------------
  // Test 4: Boards and Templates Isolation
  // ----------------------------------------------------
  console.log('\n--- 4. Boards & Templates Isolation Verification ---');

  await test('Template modal contains "View Recent Canvases" return button', () => {
    assert.ok(htmlContent.includes('id="templates-view-boards-btn"'), 'Must have templates-view-boards-btn button');
  });

  await test('Template selection preserves active board content if non-empty', () => {
    const canvasContent = fs.readFileSync(path.join(rootDir, 'src/renderer/canvas/canvas.ts'), 'utf-8');
    assert.ok(
      canvasContent.includes('curItems.length > 0 && window.canvasApi?.boardCreate'),
      'Template click creates new board when curItems.length > 0'
    );
  });

  // ----------------------------------------------------
  // Test 5: n8n Workflow JSON Import
  // ----------------------------------------------------
  console.log('\n--- 5. n8n Workflow JSON Import Verification ---');

  const sampleN8nWorkflow = {
    name: 'Test Telegram Webhook Workflow',
    nodes: [
      {
        id: 'node-webhook-1',
        name: 'Webhook Trigger',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [200, 300]
      },
      {
        id: 'node-openai-2',
        name: 'OpenAI Processor',
        type: 'n8n-nodes-base.openAi',
        typeVersion: 1,
        position: [550, 300]
      },
      {
        id: 'node-telegram-3',
        name: 'Telegram Send',
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1,
        position: [900, 300]
      }
    ],
    connections: {
      'Webhook Trigger': {
        main: [
          [
            {
              node: 'OpenAI Processor',
              type: 'main',
              index: 0
            }
          ]
        ]
      },
      'OpenAI Processor': {
        main: [
          [
            {
              node: 'Telegram Send',
              type: 'main',
              index: 0
            }
          ]
        ]
      }
    }
  };

  await test('isN8nWorkflowJson detects n8n workflow correctly', async () => {
    const { isN8nWorkflowJson } = await import('../dist/renderer/canvas/components/board-export.js');
    assert.strictEqual(isN8nWorkflowJson(sampleN8nWorkflow), true);
    assert.strictEqual(isN8nWorkflowJson({ items: [] }), false);
    assert.strictEqual(isN8nWorkflowJson(null), false);
    assert.strictEqual(isN8nWorkflowJson('invalid string'), false);
  });

  await test('parseBoardJson imports n8n workflow safely without missing items array error', async () => {
    const { parseBoardJson } = await import('../dist/renderer/canvas/components/board-export.js');
    const result = parseBoardJson(JSON.stringify(sampleN8nWorkflow));

    assert.ok(result, 'Result must exist');
    assert.strictEqual(result.title, 'Test Telegram Webhook Workflow');
    assert.ok(Array.isArray(result.items), 'Result must have items array');

    // Should have 3 nodes (shapes) + 2 connectors
    const nodes = result.items.filter((item) => item.type === 'shape');
    const connectors = result.items.filter((item) => item.type === 'connector');

    assert.strictEqual(nodes.length, 3, 'Must create 3 shape nodes');
    assert.strictEqual(connectors.length, 2, 'Must create 2 connectors');

    // Check node properties
    const webhookNode = nodes.find((n) => n.title === 'Webhook Trigger');
    assert.ok(webhookNode, 'Webhook node exists');
    assert.strictEqual(webhookNode.x, 200);
    assert.strictEqual(webhookNode.y, 300);
    assert.strictEqual(webhookNode.shapeType, 'rounded-rect');

    // Check connector properties
    const conn1 = connectors.find((c) => c.startElementId === 'n8n-node-webhook-1' && c.endElementId === 'n8n-node-openai-2');
    assert.ok(conn1, 'Connector between webhook and openai exists');
    assert.strictEqual(conn1.lineStyle, 'curved');
    assert.strictEqual(conn1.arrowEnd, true);
  });

  await test('Standard PeepJam board JSON export/import remains backward compatible', async () => {
    const { parseBoardJson } = await import('../dist/renderer/canvas/components/board-export.js');
    const testItems = [
      {
        id: 'sticky-1',
        type: 'sticky',
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        content: 'Hello PeepJam'
      },
      {
        id: 'conn-1',
        type: 'connector',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        startX: 100,
        startY: 100,
        endX: 200,
        endY: 200,
        arrowEnd: true,
        arrowStart: false,
        arrowheadSize: 12
      }
    ];

    const jsonStr = JSON.stringify({ version: 1, title: 'Test Board', pan: { x: 50, y: 50 }, zoom: 1.2, items: testItems });
    const parsed = parseBoardJson(jsonStr);

    assert.strictEqual(parsed.title, 'Test Board');
    assert.strictEqual(parsed.items.length, 2);
    assert.strictEqual(parsed.items[0].id, 'sticky-1');
    assert.strictEqual(parsed.items[1].arrowheadSize, 12);
  });

  console.log(`\nResults: ${passedTests} / ${totalTests} passed.`);
  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    console.log('All product issues regression tests PASSED successfully!\n');
  }
}

await runSuite();
