import { app, dialog, type BrowserWindow, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Returns true only when running under explicit test environments.
 * In standard production execution, this returns false.
 */
export function isTestMode(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.PEEPDESK_TEST_MODE === '1' ||
    process.argv.includes('--test-mode') ||
    process.argv.includes('--peepdesk-test')
  );
}

let memoryMockDialogResult: OpenDialogReturnValue | null = null;

/**
 * Queue a mock file dialog result for automated testing.
 * Strictly a no-op if test mode is not active.
 */
export function setMockDialogResult(result: OpenDialogReturnValue | null): void {
  if (!isTestMode()) return;
  memoryMockDialogResult = result;
}

/**
 * Show open dialog safely. In production, always triggers native OS dialog.
 * In test mode only, checks for queued mock dialog results from test harness.
 */
export async function showOpenDialogSafe(
  win: BrowserWindow | null,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  if (isTestMode()) {
    // 1. Check in-memory test queue
    if (memoryMockDialogResult !== null) {
      const res = memoryMockDialogResult;
      memoryMockDialogResult = null;
      return res;
    }

    // 2. Check file-based test seam in isolated test userData directory
    try {
      const seamFile = path.join(app.getPath('userData'), '__test_mock_dialog.json');
      if (fs.existsSync(seamFile)) {
        const raw = fs.readFileSync(seamFile, 'utf8');
        fs.unlinkSync(seamFile);
        const parsed = JSON.parse(raw);
        if (typeof parsed?.canceled === 'boolean' && Array.isArray(parsed?.filePaths)) {
          return parsed as OpenDialogReturnValue;
        }
      }
    } catch {
      // Ignore errors reading test seam file
    }
  }

  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}
