// QA GROUP: Explicit V2 Recovery-Candidate Coverage against real Electron stateLoad
// Verifies all candidate selection, fallback policies, self-healing, corrupt file preservation,
// and reload persistence on an isolated disposable profile.
import fs from 'fs';
import path from 'path';
import { sleep, readText, launchElectron, connectCdp, bootCanvas, Inspector, disposeElectron } from './g4-harness.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    failures.push(`${name} :: ${String(detail).slice(0, 300)}`);
    console.log(`FAIL: ${name} :: ${String(detail).slice(0, 300)}`);
  }
}

const PORT = 9382;
const INSPECT_PORT = 9383;
const TEMP = process.env.TEMP || 'C:/temp';
const profile = path.join(TEMP, 'peepdesk-v2-recovery-profile');
const stateFile = path.join(profile, 'peepdesk-state.json');

const NODE_OPTS_ENV = {
  NODE_OPTIONS: '--require "D:/AI startups/nekoboard/scratch/g4-main-require.cjs"'
};

function clearAllCandidates() {
  for (const s of ['', '.tmp', '.bak']) {
    try { fs.rmSync(stateFile + s, { force: true }); } catch {}
  }
  try {
    for (const f of fs.readdirSync(profile)) {
      if (f.startsWith('peepdesk-state.json.corrupt.')) {
        try { fs.rmSync(path.join(profile, f), { force: true }); } catch {}
      }
    }
  } catch {}
}

function getCorruptArtifacts() {
  try {
    return fs.readdirSync(profile).filter(f => f.startsWith('peepdesk-state.json.corrupt.'));
  } catch {
    return [];
  }
}

function makeV2Candidate({
  savedAt,
  boards = [
    {
      id: 'b-default',
      name: 'Default Board',
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
      title: 'Default Board',
      items: [{ id: 'card-1', type: 'sticky', x: 20, y: 20, content: 'test' }],
      archived: false
    }
  ],
  activeBoardId = boards[0]?.id || 'b-default',
  timers = { lastHydration: 1700000000000, lastBreak: 1700000000000 }
}) {
  const doc = {
    version: 2,
    boards,
    activeBoardId,
    timers,
    settings: { water: { enabled: false, intervalMinutes: 120 }, chai: { enabled: false, everyMin: 50 } },
    clips: []
  };
  if (savedAt !== undefined) {
    doc.savedAt = savedAt;
  }
  return doc;
}

function writeCandidate(suffix, content) {
  const target = suffix === '' ? stateFile : stateFile + suffix;
  const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(target, raw, 'utf8');
}

async function reloadAndReboot(canvas, ins) {
  await ins.eval(`global.__g4CW().webContents.reload(); 'reloading'`);
  await sleep(400);
  const boot = await bootCanvas(canvas, PORT);
  if (boot !== 'boot-complete') throw new Error('Failed to reboot canvas after reload');
  await sleep(200);
}

async function getLiveState(canvas) {
  return canvas.eval(`(() => {
    const api = window.__peepdeskTestApi;
    const st = api.getState();
    return {
      title: api.getBoardTitle(),
      itemCount: st.items ? st.items.length : 0,
      items: st.items,
      gridStyle: api.getCurrentGridStyle()
    };
  })()`);
}

async function getLiveDocument(canvas) {
  return canvas.eval(`window.canvasApi.boardDocumentExport()`);
}

async function run() {
  console.log('=== STARTING EXPLICIT V2 RECOVERY INTEGRATION TEST SUITE ===\n');

  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(profile, { recursive: true });

  console.log(`Launching Electron on port ${PORT} (inspect: ${INSPECT_PORT})...`);
  const proc = launchElectron({
    cdpPort: PORT,
    profile,
    extraArgs: [`--inspect=${INSPECT_PORT}`],
    env: NODE_OPTS_ENV
  });

  let canvas = null;
  let ins = null;

  try {
    canvas = await connectCdp(PORT, (t) => t.type === 'page' && /whiteboard/i.test(t.title || ''));
    await bootCanvas(canvas, PORT);
    ins = await new Inspector().connect(INSPECT_PORT);
    console.log('Canvas and Main Inspector connected.\n');

    const H = 3600_000;

    // -------------------------------------------------------------------------
    // Scenario 1: Valid v2 primary state
    // -------------------------------------------------------------------------
    console.log('--- Scenario 1: Valid v2 primary state ---');
    clearAllCandidates();
    const now1 = Date.now();
    writeCandidate('', makeV2Candidate({
      savedAt: now1 - 2000,
      boards: [
        {
          id: 'b-alpha',
          name: 'Alpha Board',
          createdAt: now1 - 5000,
          updatedAt: now1 - 2000,
          title: 'Alpha Board Title',
          items: [
            { id: 'alpha-1', type: 'sticky', x: 50, y: 50, content: 'Alpha Sticky' },
            { id: 'alpha-2', type: 'thought', x: 300, y: 50, content: 'Alpha Thought' }
          ],
          archived: false
        },
        {
          id: 'b-beta',
          name: 'Beta Board',
          createdAt: now1 - 4000,
          updatedAt: now1 - 3000,
          title: 'Beta Board Title',
          items: [{ id: 'beta-1', type: 'todo', x: 100, y: 100, content: 'Beta Todo', status: 'pending' }],
          archived: false
        }
      ],
      activeBoardId: 'b-alpha'
    }));

    await reloadAndReboot(canvas, ins);
    const live1 = await getLiveState(canvas);
    const doc1 = await getLiveDocument(canvas);

    check('S1: valid v2 primary loads active board Alpha', live1.title === 'Alpha Board Title' && live1.itemCount === 2);
    check('S1: full v2 document in memory contains both Alpha and Beta boards', doc1 && doc1.boards && doc1.boards.length === 2 && doc1.activeBoardId === 'b-alpha');

    // -------------------------------------------------------------------------
    // Scenario 2: Recovery from valid .tmp when primary is missing
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Recovery from valid .tmp when primary is missing ---');
    clearAllCandidates();
    const now2 = Date.now();
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now2 - 3000,
      boards: [
        {
          id: 'b-tmp-rec',
          name: 'Recovered From Tmp',
          createdAt: now2 - 6000,
          updatedAt: now2 - 3000,
          title: 'Tmp Recovery Board',
          items: [
            { id: 'tmp-node-1', type: 'sticky', x: 40, y: 40, content: 'Tmp 1' },
            { id: 'tmp-node-2', type: 'sticky', x: 260, y: 40, content: 'Tmp 2' },
            { id: 'tmp-node-3', type: 'sticky', x: 480, y: 40, content: 'Tmp 3' }
          ],
          archived: false
        }
      ],
      activeBoardId: 'b-tmp-rec'
    }));

    await reloadAndReboot(canvas, ins);
    const live2 = await getLiveState(canvas);

    check('S2: recovered active board from .tmp candidate', live2.title === 'Tmp Recovery Board' && live2.itemCount === 3);
    // Self-healing check: primary file on disk must now exist
    check('S2: primary state file self-healed on disk', fs.existsSync(stateFile));
    const healed2 = JSON.parse(readText(stateFile));
    check('S2: primary disk content matches recovered .tmp board', healed2.boards?.[0]?.id === 'b-tmp-rec' && healed2.boards?.[0]?.items?.length === 3);

    // -------------------------------------------------------------------------
    // Scenario 3: Recovery from valid .bak when primary & .tmp are missing
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 3: Recovery from valid .bak when primary & .tmp are missing ---');
    clearAllCandidates();
    const now3 = Date.now();
    writeCandidate('.bak', makeV2Candidate({
      savedAt: now3 - 5000,
      boards: [
        {
          id: 'b-bak-rec',
          name: 'Recovered From Bak',
          createdAt: now3 - 9000,
          updatedAt: now3 - 5000,
          title: 'Bak Recovery Board',
          items: [{ id: 'bak-node-1', type: 'text', x: 100, y: 100, content: 'Bak Text' }],
          archived: false
        }
      ],
      activeBoardId: 'b-bak-rec'
    }));

    await reloadAndReboot(canvas, ins);
    const live3 = await getLiveState(canvas);

    check('S3: recovered active board from .bak candidate', live3.title === 'Bak Recovery Board' && live3.itemCount === 1);
    check('S3: primary state file self-healed from .bak', fs.existsSync(stateFile));
    const healed3 = JSON.parse(readText(stateFile));
    check('S3: primary disk content matches recovered .bak board', healed3.boards?.[0]?.id === 'b-bak-rec');

    // -------------------------------------------------------------------------
    // Scenario 4: Recovery from valid .bak when primary is corrupt JSON
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 4: Recovery from valid .bak when primary is corrupt JSON ---');
    clearAllCandidates();
    const now4 = Date.now();
    writeCandidate('', '{ corrupt JSON content syntax error !!!');
    writeCandidate('.bak', makeV2Candidate({
      savedAt: now4 - 4000,
      boards: [
        {
          id: 'b-bak-healer',
          name: 'Healer Board',
          createdAt: now4 - 8000,
          updatedAt: now4 - 4000,
          title: 'Saved From Corruption',
          items: [{ id: 'healed-1', type: 'sticky', x: 10, y: 10, content: 'Intact' }],
          archived: false
        }
      ],
      activeBoardId: 'b-bak-healer'
    }));

    await reloadAndReboot(canvas, ins);
    const live4 = await getLiveState(canvas);
    const corrupts4 = getCorruptArtifacts();

    check('S4: recovered state from .bak despite corrupt primary', live4.title === 'Saved From Corruption' && live4.itemCount === 1);
    check('S4: corrupt primary preserved as .corrupt.<timestamp> artifact', corrupts4.length > 0);
    if (corrupts4.length > 0) {
      const corruptContent = readText(path.join(profile, corrupts4[0]));
      check('S4: corrupt artifact contains original broken bytes', corruptContent.includes('corrupt JSON content'));
    }
    const healed4 = JSON.parse(readText(stateFile));
    check('S4: primary file self-healed on disk with valid JSON', healed4.boards?.[0]?.id === 'b-bak-healer');

    // -------------------------------------------------------------------------
    // Scenario 5: Recovery from .tmp when primary is structurally invalid v2
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 5: Structurally invalid v2 primary with valid .tmp ---');
    clearAllCandidates();
    const now5 = Date.now();
    // Primary has activeBoardId pointing to nonexistent board
    writeCandidate('', makeV2Candidate({
      savedAt: now5 - 1000,
      boards: [makeV2Candidate({ savedAt: now5 }).boards[0]],
      activeBoardId: 'b-non-existent-id' // violates isValidStateV2
    }));
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now5 - 3000,
      boards: [
        {
          id: 'b-valid-tmp-5',
          name: 'Valid Tmp Board',
          createdAt: now5 - 6000,
          updatedAt: now5 - 3000,
          title: 'Valid Tmp Title',
          items: [{ id: 'v5-node', type: 'shape', x: 50, y: 50, content: 'Shape' }],
          archived: false
        }
      ],
      activeBoardId: 'b-valid-tmp-5'
    }));

    await reloadAndReboot(canvas, ins);
    const live5 = await getLiveState(canvas);
    const corrupts5 = getCorruptArtifacts();

    check('S5: structurally invalid v2 rejected; .tmp candidate recovered', live5.title === 'Valid Tmp Title');
    check('S5: invalid primary preserved as corrupt artifact', corrupts5.length > 0);

    // -------------------------------------------------------------------------
    // Scenario 6: Active board ID pointing to an archived board (Documented Policy)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 6: Active board ID pointing to an archived board ---');
    clearAllCandidates();
    const now6 = Date.now();
    writeCandidate('', makeV2Candidate({
      savedAt: now6 - 2000,
      boards: [
        {
          id: 'b-archived-first',
          name: 'Archived Board',
          createdAt: now6 - 8000,
          updatedAt: now6 - 5000,
          title: 'Archived Board Title',
          items: [{ id: 'arch-1', type: 'sticky', x: 10, y: 10, content: 'Archived' }],
          archived: true
        },
        {
          id: 'b-usable-second',
          name: 'Usable Board',
          createdAt: now6 - 7000,
          updatedAt: now6 - 2000,
          title: 'Usable Board Title',
          items: [{ id: 'usable-1', type: 'sticky', x: 20, y: 20, content: 'Usable' }],
          archived: false
        }
      ],
      activeBoardId: 'b-archived-first' // archived!
    }));

    await reloadAndReboot(canvas, ins);
    const live6 = await getLiveState(canvas);
    const doc6 = await getLiveDocument(canvas);

    check('S6: candidate with archived activeBoardId is NOT rejected (data preserved)', doc6 && doc6.boards?.length === 2);
    check('S6: normalizeActiveBoard fell back to first unarchived board (Usable Board)', live6.title === 'Usable Board Title' && doc6.activeBoardId === 'b-usable-second');

    // -------------------------------------------------------------------------
    // Scenario 7: Candidate ordering and tie-breaking
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 7: Candidate ordering and tie-breaking ---');
    // Test 7A: Normal timestamps (P fresh, tmp mid, bak old) -> P wins
    clearAllCandidates();
    const now7 = Date.now();
    writeCandidate('', makeV2Candidate({
      savedAt: now7 - 1000,
      boards: [{ id: 'b-p7', name: 'Primary 7', createdAt: now7, updatedAt: now7, title: 'Primary 7', items: [], archived: false }],
      activeBoardId: 'b-p7'
    }));
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now7 - 5000,
      boards: [{ id: 'b-tmp7', name: 'Tmp 7', createdAt: now7, updatedAt: now7, title: 'Tmp 7', items: [], archived: false }],
      activeBoardId: 'b-tmp7'
    }));
    writeCandidate('.bak', makeV2Candidate({
      savedAt: now7 - 10000,
      boards: [{ id: 'b-bak7', name: 'Bak 7', createdAt: now7, updatedAt: now7, title: 'Bak 7', items: [], archived: false }],
      activeBoardId: 'b-bak7'
    }));

    await reloadAndReboot(canvas, ins);
    const live7a = await getLiveState(canvas);
    check('S7A: fresher primary wins over older .tmp and .bak', live7a.title === 'Primary 7');

    // Test 7B: Fresher .tmp wins over older primary
    clearAllCandidates();
    writeCandidate('', makeV2Candidate({
      savedAt: now7 - 8000,
      boards: [{ id: 'b-p7b', name: 'Stale Primary', createdAt: now7, updatedAt: now7, title: 'Stale Primary', items: [], archived: false }],
      activeBoardId: 'b-p7b'
    }));
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now7 - 2000, // Fresher!
      boards: [{ id: 'b-tmp7b', name: 'Fresh Tmp', createdAt: now7, updatedAt: now7, title: 'Fresh Tmp', items: [], archived: false }],
      activeBoardId: 'b-tmp7b'
    }));

    await reloadAndReboot(canvas, ins);
    const live7b = await getLiveState(canvas);
    check('S7B: fresher .tmp wins over older primary', live7b.title === 'Fresh Tmp');

    // Test 7C: Equal timestamps -> primary wins by order (first scan position)
    clearAllCandidates();
    writeCandidate('', makeV2Candidate({
      savedAt: now7 - 3000,
      boards: [{ id: 'b-p7c', name: 'Primary Equal', createdAt: now7, updatedAt: now7, title: 'Primary Equal', items: [], archived: false }],
      activeBoardId: 'b-p7c'
    }));
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now7 - 3000,
      boards: [{ id: 'b-tmp7c', name: 'Tmp Equal', createdAt: now7, updatedAt: now7, title: 'Tmp Equal', items: [], archived: false }],
      activeBoardId: 'b-tmp7c'
    }));
    writeCandidate('.bak', makeV2Candidate({
      savedAt: now7 - 3000,
      boards: [{ id: 'b-bak7c', name: 'Bak Equal', createdAt: now7, updatedAt: now7, title: 'Bak Equal', items: [], archived: false }],
      activeBoardId: 'b-bak7c'
    }));

    await reloadAndReboot(canvas, ins);
    const live7c = await getLiveState(canvas);
    check('S7C: equal timestamps tie-break in favor of primary (scan position 0)', live7c.title === 'Primary Equal');

    // Test 7D: Equal timestamps between .tmp and .bak when primary missing -> .tmp wins
    clearAllCandidates();
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now7 - 4000,
      boards: [{ id: 'b-tmp7d', name: 'Tmp Winner', createdAt: now7, updatedAt: now7, title: 'Tmp Winner', items: [], archived: false }],
      activeBoardId: 'b-tmp7d'
    }));
    writeCandidate('.bak', makeV2Candidate({
      savedAt: now7 - 4000,
      boards: [{ id: 'b-bak7d', name: 'Bak Equal', createdAt: now7, updatedAt: now7, title: 'Bak Equal', items: [], archived: false }],
      activeBoardId: 'b-bak7d'
    }));

    await reloadAndReboot(canvas, ins);
    const live7d = await getLiveState(canvas);
    check('S7D: equal timestamps between .tmp and .bak tie-breaks .tmp (scan position 1 vs 2)', live7d.title === 'Tmp Winner');

    // -------------------------------------------------------------------------
    // Scenario 8: Future timestamps and Tier-B fallback with v2 states
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 8: Future timestamps and Tier-B fallback with v2 states ---');
    // Test 8A: Primary has future skew (> tolerance, +3h), valid .tmp has normal stamp (-2s)
    // Tier A must reject the future primary so the real-clock .tmp wins
    clearAllCandidates();
    const now8 = Date.now();
    writeCandidate('', makeV2Candidate({
      savedAt: now8 + 3 * H, // Future skew!
      boards: [{ id: 'b-p8a', name: 'Future Primary', createdAt: now8, updatedAt: now8, title: 'Future Primary', items: [], archived: false }],
      activeBoardId: 'b-p8a'
    }));
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now8 - 2000, // Real clock!
      boards: [{ id: 'b-tmp8a', name: 'Real Clock Tmp', createdAt: now8, updatedAt: now8, title: 'Real Clock Tmp', items: [], archived: false }],
      activeBoardId: 'b-tmp8a'
    }));

    await reloadAndReboot(canvas, ins);
    const live8a = await getLiveState(canvas);
    check('S8A: future-skewed primary is rejected in Tier A; real-clock .tmp wins', live8a.title === 'Real Clock Tmp');

    // Test 8B: ALL candidates future-stamped -> Tier B activates, largest raw stamp wins
    clearAllCandidates();
    writeCandidate('', makeV2Candidate({
      savedAt: now8 + 2 * H,
      boards: [{ id: 'b-p8b', name: 'Primary +2h', createdAt: now8, updatedAt: now8, title: 'Primary +2h', items: [], archived: false }],
      activeBoardId: 'b-p8b'
    }));
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now8 + 5 * H, // Largest stamp!
      boards: [{ id: 'b-tmp8b', name: 'Tmp +5h', createdAt: now8, updatedAt: now8, title: 'Tmp +5h', items: [], archived: false }],
      activeBoardId: 'b-tmp8b'
    }));
    writeCandidate('.bak', makeV2Candidate({
      savedAt: now8 + 1 * H,
      boards: [{ id: 'b-bak8b', name: 'Bak +1h', createdAt: now8, updatedAt: now8, title: 'Bak +1h', items: [], archived: false }],
      activeBoardId: 'b-bak8b'
    }));

    await reloadAndReboot(canvas, ins);
    const live8b = await getLiveState(canvas);
    check('S8B: Tier B fallback selects largest raw stamp when all candidates skewed (.tmp +5h)', live8b.title === 'Tmp +5h');

    // Test 8C: ALL candidates future-stamped with EQUAL stamps -> Primary wins by order
    clearAllCandidates();
    writeCandidate('', makeV2Candidate({
      savedAt: now8 + 4 * H,
      boards: [{ id: 'b-p8c', name: 'Primary Equal Skew', createdAt: now8, updatedAt: now8, title: 'Primary Equal Skew', items: [], archived: false }],
      activeBoardId: 'b-p8c'
    }));
    writeCandidate('.tmp', makeV2Candidate({
      savedAt: now8 + 4 * H,
      boards: [{ id: 'b-tmp8c', name: 'Tmp Equal Skew', createdAt: now8, updatedAt: now8, title: 'Tmp Equal Skew', items: [], archived: false }],
      activeBoardId: 'b-tmp8c'
    }));

    await reloadAndReboot(canvas, ins);
    const live8c = await getLiveState(canvas);
    check('S8C: Tier B fallback tie-breaks equal future stamps by scan order (Primary wins)', live8c.title === 'Primary Equal Skew');

    // -------------------------------------------------------------------------
    // Scenario 9: No valid candidate (safe factory defaults without data destruction)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 9: No valid candidate (safe defaults without data loss) ---');
    clearAllCandidates();
    writeCandidate('', 'broken syntax {{{{');
    writeCandidate('.tmp', 'broken tmp {{{{');
    writeCandidate('.bak', 'broken bak {{{{');

    await reloadAndReboot(canvas, ins);
    const live9 = await getLiveState(canvas);
    const doc9 = await getLiveDocument(canvas);
    const corrupts9 = getCorruptArtifacts();

    check('S9: returns safe factory defaults on all-corrupt files', doc9.boards.length === 1 && doc9.boards[0].name === 'My Board' && live9.itemCount === 0);
    check('S9: corrupt primary preserved for diagnostics', corrupts9.length > 0);

    // -------------------------------------------------------------------------
    // Scenario 10: Intact across reload (no silent revert to older state)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 10: Persistence intact across reload (no silent revert) ---');
    clearAllCandidates();
    const now10 = Date.now();
    // 1. Recover from .bak initially
    writeCandidate('.bak', makeV2Candidate({
      savedAt: now10 - 5000,
      boards: [
        {
          id: 'b-persist-test',
          name: 'Persist Board',
          createdAt: now10 - 9000,
          updatedAt: now10 - 5000,
          title: 'Persist Initial Title',
          items: [{ id: 'item-initial', type: 'sticky', x: 20, y: 20, content: 'Initial' }],
          archived: false
        }
      ],
      activeBoardId: 'b-persist-test'
    }));

    await reloadAndReboot(canvas, ins);
    const live10a = await getLiveState(canvas);
    check('S10: initial recovery from .bak successful', live10a.title === 'Persist Initial Title');

    // 2. User edits board (add a node and rename title)
    await canvas.eval(`
      const api = window.__peepdeskTestApi;
      const st = api.getState();
      st.title = 'Persist Renamed Title';
      st.items.push({ id: 'item-added-later', type: 'text', x: 100, y: 100, content: 'Added node' });
      api.scheduleSave();
    `);
    await sleep(1500); // Wait for debounce and disk flush

    // 3. Reload window again
    await reloadAndReboot(canvas, ins);
    const live10b = await getLiveState(canvas);
    const doc10b = await getLiveDocument(canvas);

    check('S10: after second reload, user edits retained (title: Persist Renamed Title)', live10b.title === 'Persist Renamed Title');
    check('S10: after second reload, added items retained (itemCount: 2)', live10b.itemCount === 2);
    check('S10: active board on disk retains edits and does NOT revert to .bak state', doc10b.boards[0].title === 'Persist Renamed Title' && doc10b.boards[0].items.length === 2);

  } finally {
    if (ins) ins.close();
    await disposeElectron(proc);
  }

  console.log('\n=============================================');
  console.log(`V2 RECOVERY INTEGRATION SUITE: ${pass} PASS, ${fail} FAIL`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach(f => console.log(' - ' + f));
  }
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
