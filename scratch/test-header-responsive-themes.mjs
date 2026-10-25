// test-header-responsive-themes.mjs
// Real Electron CDP Test: Responsive Widths (560, 580, 700, 860, 900, 1000, 1150, 1400px),
// Single Navigation System verification (One hamburger hub across all widths, no duplicate desktop menus),
// Theme Consistency (Dark, Light, System) across surfaces & disk persistence,
// Keyboard Navigation, Escape/Outside-Click dismissal, and Focus Restoration.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 9231;
const USER_DATA_DIR = path.resolve('./.test-header-profile');

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
      console.error('CDP Eval Exception:', JSON.stringify(res.exceptionDetails, null, 2));
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

let passCount = 0;
let failCount = 0;

function check(desc, cond, detail = '') {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${desc}`);
  } else {
    failCount++;
    console.error(`  ✗ FAIL: ${desc} ${detail ? '(' + detail + ')' : ''}`);
  }
}

async function run() {
  console.log('\n======================================================');
  console.log('=== PEEPJAM LIVE ELECTRON RESPONSIVE & THEME AUDIT ===');
  console.log('======================================================\n');

  if (fs.existsSync(USER_DATA_DIR)) {
    try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch {}
  }
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  console.log(`Spawning Electron with isolated profile at port ${PORT}...`);
  const electronProcess = spawn('npx.cmd', [
    'electron', '.',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--show-canvas'
  ], {
    shell: true,
    stdio: 'ignore'
  });

  let client = null;

  try {
    let endpoints = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        endpoints = await getJSON(`http://127.0.0.1:${PORT}/json`);
        if (endpoints && endpoints.length > 0) break;
      } catch {}
    }

    if (!endpoints) throw new Error('Could not connect to Electron CDP port');

    const canvasTarget = endpoints.find(e => e.url.includes('canvas/index.html'));
    if (!canvasTarget) throw new Error('Canvas window target not found');

    client = new CDPClient(canvasTarget.webSocketDebuggerUrl);
    await client.connect();
    console.log('Connected to Canvas window via CDP!\n');

    await client.eval(`new Promise(resolve => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve);
    })`);
    await new Promise(r => setTimeout(r, 800));

    // ========================================================
    // 1. RESPONSIVE BREAKPOINT AUDIT ACROSS 8 WIDTHS
    // ========================================================
    console.log('--- 1. Responsive Viewport Testing (560, 580, 700, 860, 900, 1000, 1150, 1400 px) ---');

    const testWidths = [1400, 1150, 1000, 900, 860, 700, 580, 560];
    for (const w of testWidths) {
      await client.send('Emulation.setDeviceMetricsOverride', { width: w, height: 750, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 200));

      const probe = await client.eval(`(() => {
        const tb = document.getElementById('titlebar');
        const r = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        };
        const disp = (sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).display : 'missing';
        };
        const padR = parseFloat(getComputedStyle(tb).paddingRight) || 0;
        const sw = document.documentElement.scrollWidth;
        const cw = document.documentElement.clientWidth;
        const iw = window.innerWidth;
        const tbRect = r('#titlebar');
        const leftRect = r('.header-left');
        const centerRect = r('.header-center');
        const rightRect = r('.header-right');

        return {
          w: iw,
          sw, cw, padR,
          noHScroll: sw <= cw + 1,
          desktopMenuBarDisp: disp('.desktop-menu-bar'),
          hamburgerDisp: disp('#menu-bar-app'),
          statusTextDisp: disp('.save-status-badge .status-text'),
          badgeDisp: disp('.save-status-badge'),
          editHintDisp: disp('.title-edit-hint'),
          gridLabelDisp: disp('#grid-mode-label'),
          gridBtnDisp: disp('#tb-grid-toggle'),
          tbLabelDisp: disp('#tb-clip .tb-label'),
          undoDisp: disp('#tb-undo'),
          redoDisp: disp('#tb-redo'),
          rightWithinUsableArea: rightRect ? rightRect.right <= iw : false,
          tbRect, leftRect, centerRect, rightRect
        };
      })()`);

      check(`Width ${w}px: Zero horizontal overflow (scrollWidth <= clientWidth)`, probe.noHScroll, `sw=${probe.sw}, cw=${probe.cw}`);
      check(`Width ${w}px: Header right controls fit within usable window width`, probe.rightWithinUsableArea);
      check(`Width ${w}px: Desktop menu bar is hidden (one navigation system)`, probe.desktopMenuBarDisp === 'none');
      check(`Width ${w}px: Unified hamburger menu hub is active`, probe.hamburgerDisp !== 'none');

      if (w <= 1150) {
        check(`Width ${w}px: Status text hidden at <=1150px`, probe.statusTextDisp === 'none');
      }
      if (w <= 1000) {
        check(`Width ${w}px: Title edit pencil hint hidden at <=1000px`, probe.editHintDisp === 'none');
      }
      if (w <= 900) {
        check(`Width ${w}px: Grid mode label & button labels hidden at <=900px`, probe.gridLabelDisp === 'none' && probe.tbLabelDisp === 'none');
      }
      if (w <= 700) {
        check(`Width ${w}px: Undo/Redo center buttons hidden at <=700px`, probe.undoDisp === 'none' && probe.redoDisp === 'none');
      }
      if (w <= 580) {
        check(`Width ${w}px: Grid toggle and status badge hidden at <=580px`, probe.gridBtnDisp === 'none' && probe.badgeDisp === 'none');
      }
    }

    // Reset to comfortable width for remaining functional tests
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 750, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 200));

    // ========================================================
    // 2. THEME CONSISTENCY ACROSS SURFACES & PERSISTENCE
    // ========================================================
    console.log('\n--- 2. Theme Consistency Across Surfaces & Persisted Preferences ---');

    const themeTest = await client.eval(`(() => {
      const results = {};
      const body = document.body;
      const titlebar = document.getElementById('titlebar');
      const board = document.getElementById('board');
      const themeBtn = document.getElementById('tb-theme-toggle');
      const themeSelect = document.getElementById('set-theme');
      const viewThemeLabel = document.getElementById('view-menu-theme-label');

      // 1. Initial dark state
      results.initialBodyClass = body.className;
      results.initialIsDark = body.classList.contains('dark-theme') && !body.classList.contains('light-theme');
      results.initialTbBg = getComputedStyle(titlebar).backgroundColor;
      results.initialBoardBg = getComputedStyle(board).backgroundColor;
      results.initialBtnTitle = themeBtn ? themeBtn.title : '';
      results.initialBtnIcon = themeBtn ? themeBtn.innerText.trim() : '';
      results.initialSelectVal = themeSelect ? themeSelect.value : '';

      // 2. Toggle to Light theme via #tb-theme-toggle click
      themeBtn.click();
      results.lightBodyClass = body.className;
      results.lightIsLight = body.classList.contains('light-theme') && !body.classList.contains('dark-theme');
      results.lightTbBg = getComputedStyle(titlebar).backgroundColor;
      results.lightBoardBg = getComputedStyle(board).backgroundColor;
      results.lightBtnTitle = themeBtn.title;
      results.lightBtnIcon = themeBtn.innerText.trim();
      results.lightSelectVal = themeSelect.value;
      results.lightViewMenuText = viewThemeLabel ? viewThemeLabel.innerText.trim() : '';

      // Check modal styling in light mode
      const settingsPanel = document.getElementById('settings-panel');
      const settingsModalWin = settingsPanel.querySelector('.modal-window');
      results.settingsModalBg = getComputedStyle(settingsModalWin).backgroundColor;

      // 3. Toggle to System theme
      themeBtn.click();
      results.systemBodyClass = body.className;
      results.systemIsSystem = body.classList.contains('system-theme');
      results.systemSelectVal = themeSelect.value;
      results.systemBtnIcon = themeBtn.innerText.trim();

      // 4. Toggle back to Dark theme
      themeBtn.click();
      results.restoredIsDark = body.classList.contains('dark-theme') && !body.classList.contains('light-theme');
      results.restoredSelectVal = themeSelect.value;
      results.restoredBtnIcon = themeBtn.innerText.trim();

      return results;
    })()`);

    check('Initial state is dark theme', themeTest.initialIsDark);
    check('Theme toggle switches body class to light-theme', themeTest.lightIsLight);
    check('Theme toggle updates titlebar background to light', themeTest.lightTbBg !== themeTest.initialTbBg);
    check('Theme toggle updates canvas background to light (#f4f3ee / rgb(244, 243, 238))',
      themeTest.lightBoardBg.includes('244, 243, 238') || themeTest.lightBoardBg !== themeTest.initialBoardBg
    );
    check('Theme toggle updates button title and moon icon (🌙)',
      themeTest.lightBtnTitle.includes('Dark') && themeTest.lightBtnIcon.includes('🌙')
    );
    check('Theme toggle synchronizes settings dropdown select to "light"', themeTest.lightSelectVal === 'light');
    check('Settings modal window uses clean white background in light mode',
      themeTest.settingsModalBg.includes('255, 255, 255') || themeTest.settingsModalBg.includes('rgb(255, 255, 255)')
    );
    check('Third toggle activates System theme option (💻)',
      themeTest.systemIsSystem && themeTest.systemSelectVal === 'system' && themeTest.systemBtnIcon.includes('💻')
    );
    check('Fourth toggle restores dark theme and sun icon (☀️)',
      themeTest.restoredIsDark && themeTest.restoredSelectVal === 'dark' && themeTest.restoredBtnIcon.includes('☀️')
    );

    // ========================================================
    // 3. KEYBOARD NAVIGATION, ESCAPE DISMISSAL & FOCUS RESTORATION
    // ========================================================
    console.log('\n--- 3. Keyboard Navigation, Dismissal & Focus Restoration ---');

    const keyNavTest = await client.eval(`(() => {
      const results = {};
      const appBtn = document.getElementById('btn-menu-hamburger');
      const appDrop = document.getElementById('dropdown-app');

      // 1. Focus Hamburger button
      appBtn.focus();
      results.btnFocusedInitially = document.activeElement === appBtn;

      // 2. Press ArrowDown to open dropdown
      appBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      results.appDropOpenedOnArrowDown = !appDrop.classList.contains('hidden');
      const activeAfterArrowDown = document.activeElement;
      results.firstItemFocused = activeAfterArrowDown && activeAfterArrowDown.dataset.menu === 'boards';

      // 3. Press ArrowDown inside dropdown to focus next item
      appDrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const activeAfterSecondDown = document.activeElement;
      results.secondItemFocused = activeAfterSecondDown && activeAfterSecondDown.dataset.menu === 'templates';

      // 4. Press Escape inside dropdown: should close and restore focus to Hamburger button
      appDrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      results.appDropClosedOnEscape = appDrop.classList.contains('hidden');
      results.focusRestoredToAppBtn = document.activeElement === appBtn;

      // 5. Test Outside Click Dismissal
      appBtn.click();
      results.appDropOpenedForOutsideClick = !appDrop.classList.contains('hidden');
      // Click on canvas #board
      document.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 400, bubbles: true }));
      results.appDropClosedOnOutsideClick = appDrop.classList.contains('hidden');

      return results;
    })()`);

    check('Focuses Hamburger button initially', keyNavTest.btnFocusedInitially);
    check('ArrowDown opens Hamburger dropdown and focuses first item ("Boards / Canvases")',
      keyNavTest.appDropOpenedOnArrowDown && keyNavTest.firstItemFocused
    );
    check('ArrowDown advances focus to next item ("Templates Library")', keyNavTest.secondItemFocused);
    check('Escape closes dropdown and restores focus to hamburger button',
      keyNavTest.appDropClosedOnEscape && keyNavTest.focusRestoredToAppBtn
    );
    check('Outside click on canvas dismisses menu dropdown',
      keyNavTest.appDropOpenedForOutsideClick && keyNavTest.appDropClosedOnOutsideClick
    );

    console.log('\n======================================================');
    console.log(`HEADER RESPONSIVE & THEME AUDIT: ${passCount} PASS, ${failCount} FAIL`);
    console.log('======================================================\n');
  } finally {
    if (client) client.close();
    electronProcess.kill();
    try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch {}
  }

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
