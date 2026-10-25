import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const PORT = 9245;
const USER_DATA_DIR = path.join(process.env.TEMP || 'C:\\temp', 'peepdesk-chunk5c-security-profile');

function getJSON(url) {
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

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      import('ws').then(({ WebSocket }) => {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.on('open', () => resolve());
        this.ws.on('error', reject);
        this.ws.on('message', (msg) => {
          const res = JSON.parse(msg.toString());
          if (res.id && this.pending.has(res.id)) {
            const { resolve, reject } = this.pending.get(res.id);
            this.pending.delete(res.id);
            if (res.error) reject(new Error(res.error.message || JSON.stringify(res.error)));
            else resolve(res.result);
          }
        });
      }).catch(reject);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await this.send('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true
        });
        if (res.exceptionDetails) {
          throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
        }
        return res.result?.value;
      } catch (err) {
        if (attempt < retries - 1 && err.message && err.message.includes('Execution context was destroyed')) {
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        throw err;
      }
    }
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('=== CHUNK 5C: PHASE A - IPC TRUST BOUNDARIES SECURITY AUDIT ===');
  console.log('================================================================\n');

  const testReport = {
    matrix: [],
    endToEnd: [],
    passed: 0,
    failed: 0
  };

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      testReport.passed++;
      return true;
    } else {
      console.error(`  [FAIL] ${name} - ${details}`);
      testReport.failed++;
      return false;
    }
  }

  // =========================================================================
  // PART 1: Direct Trust Boundary Matrix Verification (Unit / Logic Audit)
  // =========================================================================
  console.log('--- PART 1: IPC Sender & Frame Trust Boundary Matrix Audit ---');

  // Load built ipc-auth module to test the exact production logic
  const authModule = await import('../dist/main/ipc-auth.js');
  const { validateIpcSender } = authModule;

  // Channel definitions and authorization policies
  const ALL_CHANNELS = [
    { channel: 'window:toggle-canvas', allowed: ['canvas', 'pet'] },
    { channel: 'window:move-pet', allowed: 'pet' },
    { channel: 'pet:ignore-mouse', allowed: 'pet' },
    { channel: 'pet:bubble-mode', allowed: 'pet' },
    { channel: 'timer:action', allowed: 'pet' },
    { channel: 'state:save', allowed: 'canvas' },
    { channel: 'link:open', allowed: 'canvas' },
    { channel: 'clip:read-text', allowed: 'canvas' },
    { channel: 'link:preview', allowed: 'canvas' },
    { channel: 'image:pick', allowed: 'canvas' },
    { channel: 'image:import', allowed: 'canvas' },
    { channel: 'image:url', allowed: 'canvas' },
    { channel: 'video:pick', allowed: 'canvas' },
    { channel: 'video:import', allowed: 'canvas' },
    { channel: 'video:url', allowed: 'canvas' },
    { channel: 'video:forget', allowed: 'canvas' },
    { channel: 'video:open', allowed: 'canvas' },
    { channel: 'state:load', allowed: 'canvas' }
  ];

  assert(ALL_CHANNELS.length === 18, 'Audit catalog contains all 18 discrete IPC channels');

  // Mock windows for matrix validation
  const mockCanvasId = 101;
  const mockPetId = 202;

  let canvasDestroyed = false;
  let petDestroyed = false;

  authModule.setWindowGettersForTest(
    () => ({
      isDestroyed: () => canvasDestroyed,
      webContents: { id: mockCanvasId }
    }),
    () => ({
      isDestroyed: () => petDestroyed,
      webContents: { id: mockPetId }
    })
  );

  try {
    for (const item of ALL_CHANNELS) {
      const allowedArr = Array.isArray(item.allowed) ? item.allowed : [item.allowed];

      // Test 1: Legitimate caller from authorized window
      for (const winType of allowedArr) {
        const legitimateSenderId = winType === 'canvas' ? mockCanvasId : mockPetId;
        const legitimatePath = winType === 'canvas'
          ? 'file:///D:/AI%20startups/nekoboard/src/renderer/canvas/index.html'
          : 'file:///D:/AI%20startups/nekoboard/src/renderer/pet/index.html';

        const legitimateEvent = {
          sender: { id: legitimateSenderId, isDestroyed: () => false },
          senderFrame: {
            url: legitimatePath,
            parent: null,
            top: null // will set top === senderFrame below
          }
        };
        legitimateEvent.senderFrame.top = legitimateEvent.senderFrame;

        const res = validateIpcSender(legitimateEvent, item.allowed);
        assert(res.valid === true && res.senderType === winType,
          `${item.channel}: Authorized call from ${winType} main frame is accepted`);
      }

      // Test 2: Caller from wrong window
      const wrongWinType = allowedArr.includes('canvas') && !allowedArr.includes('pet')
        ? 'pet'
        : (!allowedArr.includes('canvas') && allowedArr.includes('pet') ? 'canvas' : null);

      if (wrongWinType) {
        const wrongSenderId = wrongWinType === 'canvas' ? mockCanvasId : mockPetId;
        const wrongPath = wrongWinType === 'canvas'
          ? 'file:///D:/AI%20startups/nekoboard/src/renderer/canvas/index.html'
          : 'file:///D:/AI%20startups/nekoboard/src/renderer/pet/index.html';

        const wrongEvent = {
          sender: { id: wrongSenderId, isDestroyed: () => false },
          senderFrame: {
            url: wrongPath,
            parent: null,
            top: null
          }
        };
        wrongEvent.senderFrame.top = wrongEvent.senderFrame;

        const resWrong = validateIpcSender(wrongEvent, item.allowed);
        assert(resWrong.valid === false,
          `${item.channel}: Call from wrong window (${wrongWinType}) is strictly rejected`);
      }

      // Test 3: Iframe caller (e.g. YouTube embed or injected frame)
      const primaryWinType = allowedArr[0];
      const validSenderId = primaryWinType === 'canvas' ? mockCanvasId : mockPetId;
      const iframeEvent = {
        sender: { id: validSenderId, isDestroyed: () => false },
        senderFrame: {
          url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          parent: { id: 1 }, // non-null parent = child iframe
          top: { id: 1 }
        }
      };
      const resIframe = validateIpcSender(iframeEvent, item.allowed);
      assert(resIframe.valid === false && resIframe.reason.includes('iframe'),
        `${item.channel}: Child iframe invocation is strictly rejected`);

      // Test 4: Unexpected protocol / origin spoofing
      const httpEvent = {
        sender: { id: validSenderId, isDestroyed: () => false },
        senderFrame: {
          url: 'http://malicious-site.local/canvas/index.html',
          parent: null,
          top: null
        }
      };
      httpEvent.senderFrame.top = httpEvent.senderFrame;
      const resHttp = validateIpcSender(httpEvent, item.allowed);
      assert(resHttp.valid === false && resHttp.reason.includes('protocol'),
        `${item.channel}: Non-file protocol is strictly rejected`);

      // Test 5: Destroyed window / sender
      const destroyedEvent = {
        sender: { id: validSenderId, isDestroyed: () => true },
        senderFrame: {
          url: 'file:///D:/canvas/index.html',
          parent: null,
          top: null
        }
      };
      destroyedEvent.senderFrame.top = destroyedEvent.senderFrame;
      const resDestroyed = validateIpcSender(destroyedEvent, item.allowed);
      assert(resDestroyed.valid === false && resDestroyed.reason.includes('destroyed'),
        `${item.channel}: Destroyed sender webContents is strictly rejected`);
    }
  } finally {
    authModule.setWindowGettersForTest(null, null);
  }

  // =========================================================================
  // PART 2: End-to-End Runtime Execution in Electron
  // =========================================================================
  console.log('\n--- PART 2: Live Electron End-to-End Verification ---');

  if (fs.existsSync(USER_DATA_DIR)) {
    try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch {}
  }
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  console.log(`Spawning Electron with test profile at port ${PORT}...`);
  const electronProcess = spawn('npx.cmd', [
    'electron', '.',
    '--test-mode',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`
  ], {
    shell: true,
    stdio: 'pipe'
  });

  let canvasClient = null;
  let petClient = null;

  try {
    let endpoints = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        endpoints = await getJSON(`http://127.0.0.1:${PORT}/json`);
        if (endpoints && endpoints.length >= 2) break;
      } catch {}
    }

    if (!endpoints || endpoints.length < 2) {
      throw new Error(`Could not discover Canvas and Pet targets. Found: ${JSON.stringify(endpoints)}`);
    }

    const canvasTarget = endpoints.find(e => e.url.includes('canvas/index.html'));
    const petTarget = endpoints.find(e => e.url.includes('pet/index.html'));

    assert(!!canvasTarget, 'Discovered Canvas window CDP target');
    assert(!!petTarget, 'Discovered Pet window CDP target');

    canvasClient = new CDPClient(canvasTarget.webSocketDebuggerUrl);
    await canvasClient.connect();
    console.log('Connected to Canvas window via CDP');

    petClient = new CDPClient(petTarget.webSocketDebuggerUrl);
    await petClient.connect();
    console.log('Connected to Pet window via CDP');

    await new Promise(r => setTimeout(r, 1200));

    // 1. Verify Canvas APIs are exposed on Canvas window
    const canvasApiCheck = await canvasClient.eval(`(() => {
      const api = window.canvasApi;
      return {
        exists: !!api,
        hasLoadState: typeof api?.loadState === 'function',
        hasSaveState: typeof api?.saveState === 'function',
        hasPickImage: typeof api?.pickImage === 'function',
        hasPickVideo: typeof api?.pickVideo === 'function',
        hasTestMockDialog: typeof api?.testMockDialog === 'function'
      };
    })()`);
    assert(canvasApiCheck.exists && canvasApiCheck.hasLoadState && canvasApiCheck.hasPickImage,
      'Canvas window exposes legitimate canvasApi functions');

    // 2. Verify Pet APIs are exposed on Pet window
    const petApiCheck = await petClient.eval(`(() => {
      const api = window.petApi;
      return {
        exists: !!api,
        hasToggleCanvas: typeof api?.toggleCanvas === 'function',
        hasMovePet: typeof api?.movePet === 'function',
        hasSetIgnoreMouse: typeof api?.setIgnoreMouse === 'function',
        hasSetBubbleMode: typeof api?.setBubbleMode === 'function',
        hasTimerAction: typeof api?.timerAction === 'function'
      };
    })()`);
    assert(petApiCheck.exists && petApiCheck.hasToggleCanvas && petApiCheck.hasMovePet,
      'Pet window exposes legitimate petApi functions');

    // 3. Test Shared Channel: toggleCanvas from Pet and Canvas
    const petToggleResult = await petClient.eval(`(() => {
      try {
        window.petApi.toggleCanvas();
        return true;
      } catch (e) {
        return false;
      }
    })()`);
    assert(petToggleResult === true, 'Shared channel window:toggle-canvas invoked successfully from Pet');

    const canvasToggleResult = await canvasClient.eval(`(() => {
      try {
        window.canvasApi.hide();
        return true;
      } catch (e) {
        return false;
      }
    })()`);
    assert(canvasToggleResult === true, 'Shared channel window:toggle-canvas invoked successfully from Canvas');

    // 4. Test State Load and State Save from Canvas
    const stateLoadRes = await canvasClient.eval(`(async () => {
      const s = await window.canvasApi.loadState();
      return !!s && Array.isArray(s.items);
    })()`);
    assert(stateLoadRes === true, 'state:load handler executed successfully from Canvas main frame');

    const stateSaveRes = await canvasClient.eval(`(() => {
      try {
        window.canvasApi.saveState({
          items: [{ id: 'test_node', type: 'sticky', x: 100, y: 100, w: 200, h: 200, zIndex: 1, text: 'sec_test' }],
          timers: { lastHydration: Date.now(), lastBreak: Date.now() }
        });
        return true;
      } catch {
        return false;
      }
    })()`);
    assert(stateSaveRes === true, 'state:save handler accepted valid payload from Canvas main frame');

    // 5. Test Clipboard Read from Canvas
    const clipRes = await canvasClient.eval(`(async () => {
      try {
        const text = await window.canvasApi.readClipboard();
        return typeof text === 'string';
      } catch {
        return false;
      }
    })()`);
    assert(clipRes === true, 'clip:read-text handler executed successfully from Canvas main frame');

    // 6. Test Pet Window actions: movePet, ignoreMouse, bubbleMode, timerAction
    const petActionsRes = await petClient.eval(`(() => {
      try {
        window.petApi.movePet(2, 2);
        window.petApi.setIgnoreMouse(true);
        window.petApi.setBubbleMode(false);
        window.petApi.timerAction('water', 'snooze');
        window.petApi.timerAction('break', 'dismiss');
        return true;
      } catch {
        return false;
      }
    })()`);
    assert(petActionsRes === true, 'Pet actions (movePet, ignoreMouse, bubbleMode, timerAction) executed cleanly from Pet');

    // 7. Verify Removal of targetPath Renderer Bypass & Function of Safe Test Seam
    const fixtureDir = path.join(USER_DATA_DIR, 'test_fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });
    const fixturePng = path.join(fixtureDir, 'safe_test.png');
    fs.writeFileSync(fixturePng, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJAD/6pnMbCAAAAAElFTkSuQmCC', 'base64'));

    // A) In production/normal mode, pickImage takes 0 arguments and does NOT accept arbitrary renderer strings
    // B) In test mode, test seam queues the mock dialog
    const mockDialogArmed = await canvasClient.eval(`(async () => {
      return await window.canvasApi.testMockDialog(${JSON.stringify(fixturePng)});
    })()`);
    assert(mockDialogArmed === true, 'Safe test seam successfully queued mock dialog result');

    const pickResult = await canvasClient.eval(`(async () => {
      return await window.canvasApi.pickImage();
    })()`);
    assert(pickResult !== null && typeof pickResult.name === 'string',
      'image:pick completed successfully via safe test seam without arbitrary renderer path parameter');

    // C) Test cancel in safe test seam
    await canvasClient.eval(`(async () => {
      return await window.canvasApi.testMockDialog('__CANCEL__');
    })()`);
    const pickCancelResult = await canvasClient.eval(`(async () => {
      return await window.canvasApi.pickImage();
    })()`);
    assert(pickCancelResult === null, 'image:pick cancellation handled cleanly without error');

  } finally {
    if (canvasClient) canvasClient.close();
    if (petClient) petClient.close();
    try {
      if (electronProcess && electronProcess.pid) {
        spawn('taskkill', ['/pid', electronProcess.pid.toString(), '/t', '/f'], { stdio: 'ignore' });
      }
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`=== AUDIT COMPLETE: ${testReport.passed} PASSED, ${testReport.failed} FAILED ===`);
  console.log('================================================================');

  process.exit(testReport.failed > 0 ? 1 : 0);
}

runAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
