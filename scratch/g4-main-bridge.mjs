// QA-G4 main-process bridge: exposes real window handles and electron APIs to
// inspector Runtime.evaluate. Uses createRequire so the CJS module cache is
// shared with the app itself (same instances, not re-instantiated modules).
import { createRequire } from 'module';
const require2 = createRequire(import.meta.url);

export async function install() {
  if (globalThis.__g4CW) return 'g4-main-bridge-already-installed';
  const cw = require2('../dist/main/canvas-window.js');
  const pw = require2('../dist/main/pet-window.js');
  const electron = require2('electron');
  globalThis.__g4CW = cw.getCanvasWindow;
  globalThis.__g4PW = pw.getPetWindow;
  globalThis.__g4screen = electron.screen;
  globalThis.__g4mod = { cw, pw, electron };
  return 'g4-main-bridge-installed';
}
