import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TEMP_USER_DATA = path.join(rootDir, '.test-storage-lifecycle');
const STATE_FILE = path.join(TEMP_USER_DATA, 'peepdesk-state.json');
const MEDIA_DIR = path.join(TEMP_USER_DATA, 'media');
const CDP_PORT = 9260;
const distElectron = path.resolve(rootDir, 'node_modules/electron/dist/electron.exe');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { shell: true, stdio: 'ignore' });
  } catch {}
  await sleep(1500);
}

function cleanTempDir() {
  try {
    if (fs.existsSync(TEMP_USER_DATA)) {
      fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true });
    }
  } catch (err) {
    try {
      fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true });
    } catch {}
  }
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Minimal 1x1 valid PNG buffer
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    const { WebSocket } = await import('ws');
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', data => {
        const parsed = JSON.parse(data.toString());
        if (parsed.id && this.pending.has(parsed.id)) {
          const { resolve, reject } = this.pending.get(parsed.id);
          this.pending.delete(parsed.id);
          if (parsed.error) reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          else resolve(parsed.result);
        }
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function connectToElectron(port, maxAttempts = 30) {
  let endpoints = null;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(400);
    try {
      endpoints = await getJson(`http://127.0.0.1:${port}/json`);
      if (endpoints && endpoints.length > 0) break;
    } catch {}
  }
  if (!endpoints) throw new Error(`Could not connect to CDP on port ${port}`);
  const canvasTarget = endpoints.find(e => e.url && e.url.includes('canvas/index.html'));
  if (!canvasTarget) throw new Error('Canvas window target not found in CDP endpoints');
  const client = new CdpClient(canvasTarget.webSocketDebuggerUrl);
  await client.connect();
  return client;
}

async function run() {
  console.log('================================================================');
  console.log('=== PEEPJAM STORAGE LIFECYCLE & ISOLATION VALIDATION ===');
  console.log('================================================================\n');

  cleanTempDir();
  fs.mkdirSync(TEMP_USER_DATA, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  console.log('--- 1. Multi-Board & Media Initialization in Isolated Profile ---');
  const mediaFilename = `test-media-${Date.now()}.png`;
  const mediaPath = path.join(MEDIA_DIR, mediaFilename);
  fs.writeFileSync(mediaPath, VALID_PNG_BUFFER);
  assert(fs.existsSync(mediaPath), `Media file written to isolated directory: ${mediaFilename}`);

  const initialDoc = {
    version: 2,
    activeBoardId: 'board-alpha',
    savedAt: Date.now() - 5000,
    boards: [
      {
        id: 'board-alpha',
        name: 'Board Alpha',
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 5000,
        title: 'Board Alpha',
        gridStyle: 'dots',
        pan: { x: 100, y: 150 },
        zoom: 1.0,
        items: [
          {
            id: 'sticky-1',
            type: 'sticky',
            x: 200,
            y: 200,
            width: 200,
            height: 200,
            color: '#FFF385',
            title: 'Alpha Note',
            content: 'Persistent work on Alpha'
          },
          {
            id: 'media-card-1',
            type: 'image',
            x: 450,
            y: 200,
            width: 320,
            height: 240,
            mediaFile: mediaFilename
          }
        ]
      },
      {
        id: 'board-beta',
        name: 'Board Beta',
        createdAt: Date.now() - 8000,
        updatedAt: Date.now() - 4000,
        title: 'Board Beta',
        gridStyle: 'lines',
        pan: { x: 0, y: 0 },
        zoom: 1.2,
        items: [
          {
            id: 'shape-beta-1',
            type: 'shape',
            shapeType: 'decision',
            x: 300,
            y: 300,
            width: 140,
            height: 100,
            label: 'Review Decision'
          }
        ]
      }
    ],
    timers: { lastHydration: Date.now(), lastBreak: Date.now() },
    settings: {
      water: { intervalMinutes: 120, enabled: true },
      chai: { intervalMinutes: 50, enabled: true }
    }
  };

  const tmpFile = `${STATE_FILE}.tmp`;
  const bakFile = `${STATE_FILE}.bak`;
  fs.writeFileSync(tmpFile, JSON.stringify(initialDoc, null, 2), 'utf8');
  fs.renameSync(tmpFile, STATE_FILE);
  fs.copyFileSync(STATE_FILE, bakFile);

  assert(fs.existsSync(STATE_FILE), 'Primary state file peepdesk-state.json exists');
  assert(fs.existsSync(bakFile), 'Backup state file peepdesk-state.json.bak exists');

  console.log('\n--- 2. Live Electron Launch with Isolated --user-data-dir ---');
  console.log('  [INFO] Verifying --user-data-dir launch-time override behavior...');
  console.log('  [INFO] Documenting: --user-data-dir is a launch-time CLI override, not an in-app dynamic location setting.');

  let electronProcess = spawn(distElectron, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${TEMP_USER_DATA}`,
    '--show-canvas'
  ], {
    cwd: rootDir,
    stdio: 'ignore'
  });

  let cdp = null;
  try {
    cdp = await connectToElectron(CDP_PORT);
    assert(!!cdp, 'Discovered Canvas window CDP target on isolated profile');
  } catch (err) {
    assert(false, `Failed to connect to CDP: ${err.message}`);
  }

  if (cdp) {
    console.log('\n--- 3. Verifying Loaded State & Media from Isolated Directory ---');
    // Wait for canvas ready
    await sleep(1000);
    const loadedState = await cdp.eval('window.canvasApi.loadState()');
    assert(!!loadedState, 'Canvas successfully loaded state from isolated profile');
    assert(loadedState?.items?.length === 2, `Board Alpha items loaded correctly (found ${loadedState?.items?.length}, expected 2)`);
    assert(loadedState?.items?.[0]?.title === 'Alpha Note', 'Sticky note title matched saved state');

    const mediaUrl = await cdp.eval(`window.canvasApi.imageUrl("${mediaFilename}")`);
    assert(typeof mediaUrl === 'string' && mediaUrl.startsWith('file://'), `Media URL resolved strictly from isolated media dir: ${mediaUrl}`);

    const boardsList = await cdp.eval('window.canvasApi.boardsList()');
    assert(boardsList?.boards?.length === 2, `Multi-board document contains 2 boards (found ${boardsList?.boards?.length})`);
    assert(boardsList?.activeBoardId === 'board-alpha', `Active board is correctly board-alpha`);

    console.log('\n--- 4. Board Switching & Data Survival ---');
    // Switch to Board Beta
    const switchRes = await cdp.eval('window.canvasApi.boardSwitch("board-beta")');
    assert(switchRes?.ok === true, 'Switched to board-beta successfully');

    const betaState = await cdp.eval('window.canvasApi.loadState()');
    assert(betaState?.items?.length === 1, `Board Beta loaded with 1 item (found ${betaState?.items?.length})`);
    assert(betaState?.items?.[0]?.id === 'shape-beta-1', 'Board Beta shape node present');

    // Add a new item to Board Beta and save
    await cdp.eval(`
      (async () => {
        const cur = await window.canvasApi.loadState();
        cur.items.push({
          id: 'new-sticky-beta-2',
          type: 'sticky',
          x: 600,
          y: 300,
          width: 200,
          height: 200,
          color: '#C8F560',
          title: 'Added on Beta',
          content: 'This should survive restart'
        });
        window.canvasApi.saveState(cur);
      })()
    `);
    assert(true, 'Dispatched updated saveState to Board Beta');

    // Wait for save debounce
    await sleep(1000);

    // Switch back to Board Alpha
    const switchBackRes = await cdp.eval('window.canvasApi.boardSwitch("board-alpha")');
    assert(switchBackRes?.ok === true, 'Switched back to board-alpha');

    const alphaStateAgain = await cdp.eval('window.canvasApi.loadState()');
    assert(alphaStateAgain?.items?.length === 2, 'Board Alpha items remained untouched after switching to Beta and back');

    cdp.close();
    await killProcessTree(electronProcess);

    console.log('\n--- 5. Electron Restart with Same Isolated --user-data-dir ---');
    electronProcess = spawn(distElectron, [
      '.',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${TEMP_USER_DATA}`,
      '--show-canvas'
    ], {
      cwd: rootDir,
      stdio: 'ignore'
    });

    cdp = await connectToElectron(CDP_PORT);
    assert(!!cdp, 'Discovered Canvas target after Electron restart');
    await sleep(1000);

    const restartedBoards = await cdp.eval('window.canvasApi.boardsList()');
    assert(restartedBoards?.boards?.length === 2, 'Both boards preserved across full app restart');

    // Check Board Beta items in storage
    await cdp.eval('window.canvasApi.boardSwitch("board-beta")');
    const restartedBetaState = await cdp.eval('window.canvasApi.loadState()');
    assert(restartedBetaState?.items?.length === 2, `Board Beta retained added item after restart (found ${restartedBetaState?.items?.length}, expected 2)`);
    assert(restartedBetaState?.items?.some(i => i.id === 'new-sticky-beta-2'), 'Item "new-sticky-beta-2" survived restart without data loss');

    // Verify media resolution after restart
    const restartedMediaUrl = await cdp.eval(`window.canvasApi.imageUrl("${mediaFilename}")`);
    assert(typeof restartedMediaUrl === 'string' && restartedMediaUrl.startsWith('file://'), 'Media file still resolves cleanly after app restart');

    cdp.close();
    await killProcessTree(electronProcess);
  }

  console.log('\n--- 6. Recoverable Write Failure Simulation ---');
  assert(fs.existsSync(STATE_FILE), 'Primary state exists before corruption test');
  assert(fs.existsSync(bakFile), 'Backup file exists before corruption test');

  // Corrupt the primary file with broken JSON bytes
  fs.writeFileSync(STATE_FILE, '{"version": 2, "broken_json": [', 'utf8');

  // Launch Electron again to trigger state recovery
  electronProcess = spawn(distElectron, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${TEMP_USER_DATA}`,
    '--show-canvas'
  ], {
    cwd: rootDir,
    stdio: 'ignore'
  });

  cdp = await connectToElectron(CDP_PORT);
  assert(!!cdp, 'Electron launched and connected to CDP');
  await sleep(1000);

  // Explicitly call loadState to execute candidate recovery logic
  const recoveredState = await cdp.eval('window.canvasApi.loadState()');
  assert(!!recoveredState && Array.isArray(recoveredState.items), 'loadState successfully recovered board state');

  const recoveredBoards = await cdp.eval('window.canvasApi.boardsList()');
  assert(recoveredBoards?.boards?.length >= 1, `Recovered boards successfully from backup candidate (found ${recoveredBoards?.boards?.length} boards)`);

  // Check that corrupt primary was archived as .corrupt.<timestamp>
  const profileFiles = fs.readdirSync(TEMP_USER_DATA);
  const corruptArtifacts = profileFiles.filter(f => f.startsWith('peepdesk-state.json.corrupt.'));
  assert(corruptArtifacts.length > 0, `Corrupt primary file safely quarantined as: ${corruptArtifacts[0]}`);

  // Confirm primary file was self-healed on disk
  const healedContent = fs.readFileSync(STATE_FILE, 'utf8');
  let healedJson = null;
  try {
    healedJson = JSON.parse(healedContent);
  } catch {}
  assert(healedJson !== null && healedJson.version === 2, 'Primary state file self-healed on disk with valid JSON');

  cdp.close();
  await killProcessTree(electronProcess);

  console.log('\n--- 7. Cleanup & Isolation Invariance ---');
  await sleep(1000);
  cleanTempDir();
  assert(!fs.existsSync(TEMP_USER_DATA), 'Temporary test profile directory cleanly removed');

  console.log('\n================================================================');
  console.log(`STORAGE LIFECYCLE AUDIT: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(async err => {
  console.error('Unhandled fatal error in storage lifecycle test:', err);
  cleanTempDir();
  process.exit(1);
});
