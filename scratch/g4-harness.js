// QA-G4 shared harness: canvas CDP, pet CDP, and MAIN-PROCESS inspector
// (via --inspect) for real BrowserWindow/native-level operations.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readText = (p) => fs.readFileSync(p, 'utf8');
export { readText };

export function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

export class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl; this.id = 1; this.pending = new Map(); this.consoleErrors = [];
  }
  async connect() {
    const { WebSocket } = await import('ws');
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
    this.ws.on('message', (m) => {
      let d; try { d = JSON.parse(m.toString()); } catch { return; }
      if (d.id && this.pending.has(d.id)) {
        const { resolve, reject } = this.pending.get(d.id);
        this.pending.delete(d.id);
        if (d.error) reject(new Error(d.error.message || JSON.stringify(d.error)));
        else resolve(d.result);
      }
      if (d.method === 'Runtime.exceptionThrown') {
        const ex = d.params.exceptionDetails;
        this.consoleErrors.push(ex.exception?.description || ex.text || 'exc');
      }
    });
  }
  send(method, params = {}) { return this._send(method, params); }
  _send(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    return res.result.value;
  }
  async settledEval(expression) {
    // one-turn settle: re-read style-dependent values after style recalc ticks
    return this.eval(`(async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await new Promise(r => setTimeout(r, 80)); return (${expression}); })()`);
  }
}

const distElectron = path.resolve('./node_modules/electron/dist/electron.exe');
export function launchElectron({ cdpPort, profile, extraArgs = [], env = {}, keep = false }) {
  if (!keep && fs.existsSync(profile)) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ok */ } }
  fs.mkdirSync(profile, { recursive: true });
  return spawn(distElectron, ['.', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--show-canvas', ...extraArgs],
    { stdio: 'ignore', env: { ...process.env, ...(env || {}) } });
}

export async function findTarget(port, match, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
      const t = list.find(match);
      if (t) return t;
    } catch { /* retry */ }
    await sleep(400);
  }
  throw new Error(`no matching CDP target on ${port}`);
}

export async function connectCdp(port, match) {
  const t = await findTarget(port, match);
  const cdp = new CDPClient(t.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable', {});
  return cdp;
}

export async function bootCanvas(cdp, port) {
  for (let i = 0; i < 80; i++) {
    try {
      const b = await cdp.eval(`(async () => {
        if (typeof window.__peepdeskTestApi === 'object') { await new Promise(r => setTimeout(r, 400)); return 'boot-complete'; }
        return 'pending';
      })()`);
      if (b === 'boot-complete') return 'boot-complete';
    } catch { /* page navigating */ }
    await sleep(250);
  }
  return 'timeout';
}

/** Main-process inspector control (--inspect=<port>). */
export class Inspector {
  async connect(port) {
    const t = await findTarget(port, (x) => x.type === 'node' || /electron|main/i.test(x.title || ''), 25000);
    const cdp = new CDPClient(t.webSocketDebuggerUrl.replace('ws://', 'ws://'));
    await cdp.connect();
    this.cdp = cdp;
    return this;
  }
  async eval(expression) {
    const res = await this.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error('main-inspector: ' + JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    return res.result.value;
  }
  close() { if (this.cdp) { try { this.cdp.ws.close(); } catch { /* ok */ } } }
}

export async function disposeElectron(proc) {
  if (!proc) return;
  try { proc.kill(); } catch { /* ok */ }
  await sleep(900);
}
