// Unit test matrix for v2 board persistence and recovery validation.
// Directly tests compiled dist/main/boards.js and dist/main/state-recovery.js.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const boards = require('../dist/main/boards.js');
const recovery = require('../dist/main/state-recovery.js');

let pass = 0;
let fail = 0;
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

console.log('=== V2 RECOVERY LOGIC UNIT TEST MATRIX ===\n');

// -------------------------------------------------------------
// Helper factories
// -------------------------------------------------------------
function makeValidBoard(id = 'b-valid-1', name = 'Test Board') {
  return {
    id,
    name,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    items: [{ id: 'card-1', type: 'sticky', x: 10, y: 10, content: 'test' }],
    archived: false,
    title: 'Board Title',
    gridStyle: 'dots',
    pan: { x: 0, y: 0 },
    zoom: 1.0
  };
}

function makeValidDocV2(boardsList = [makeValidBoard()], activeId = 'b-valid-1') {
  return {
    version: 2,
    savedAt: 1700000002000,
    boards: boardsList,
    activeBoardId: activeId,
    timers: { lastHydration: 1700000000000, lastBreak: 1700000000000 },
    settings: { water: { enabled: true, intervalMinutes: 120 }, chai: { enabled: false, everyMin: 50 } },
    clips: []
  };
}

// -------------------------------------------------------------
// 1. looksLikeV2
// -------------------------------------------------------------
console.log('--- 1. looksLikeV2 shape detection ---');
check('valid v2 doc looks like v2', boards.looksLikeV2(makeValidDocV2()) === true);
check('missing boards is not v2', boards.looksLikeV2({ activeBoardId: 'b-1' }) === false);
check('boards not array is not v2', boards.looksLikeV2({ boards: 'not an array', activeBoardId: 'b-1' }) === false);
check('missing activeBoardId is not v2', boards.looksLikeV2({ boards: [makeValidBoard()] }) === false);
check('activeBoardId not string is not v2', boards.looksLikeV2({ boards: [makeValidBoard()], activeBoardId: 123 }) === false);
check('null / primitive is not v2', boards.looksLikeV2(null) === false && boards.looksLikeV2('foo') === false);
check('legacy v1 flat state does not look like v2', boards.looksLikeV2({ items: [], timers: { lastHydration: 0, lastBreak: 0 } }) === false);

// -------------------------------------------------------------
// 2. isBoardRecord
// -------------------------------------------------------------
console.log('\n--- 2. isBoardRecord validation ---');
check('valid board record passes', boards.isBoardRecord(makeValidBoard()) === true);
check('empty id fails regex', boards.isBoardRecord({ ...makeValidBoard(), id: '' }) === false);
check('id with invalid special characters fails regex', boards.isBoardRecord({ ...makeValidBoard(), id: 'bad id with spaces!' }) === false);
check('id over 64 chars fails regex', boards.isBoardRecord({ ...makeValidBoard(), id: 'a'.repeat(65) }) === false);
check('non-string name fails', boards.isBoardRecord({ ...makeValidBoard(), name: 12345 }) === false);
check('missing/non-finite createdAt fails', boards.isBoardRecord({ ...makeValidBoard(), createdAt: NaN }) === false);
check('missing/non-finite updatedAt fails', boards.isBoardRecord({ ...makeValidBoard(), updatedAt: Infinity }) === false);
check('non-array items fails', boards.isBoardRecord({ ...makeValidBoard(), items: 'not an array' }) === false);
check('invalid gridStyle fails', boards.isBoardRecord({ ...makeValidBoard(), gridStyle: 'triangles' }) === false);
check('valid gridStyles pass', ['dots', 'lines', 'blank'].every(g => boards.isBoardRecord({ ...makeValidBoard(), gridStyle: g })));
check('non-finite pan.x fails', boards.isBoardRecord({ ...makeValidBoard(), pan: { x: NaN, y: 0 } }) === false);
check('non-finite pan.y fails', boards.isBoardRecord({ ...makeValidBoard(), pan: { x: 0, y: Infinity } }) === false);
check('zoom <= 0 fails', boards.isBoardRecord({ ...makeValidBoard(), zoom: 0 }) === false && boards.isBoardRecord({ ...makeValidBoard(), zoom: -1 }) === false);
check('non-finite zoom fails', boards.isBoardRecord({ ...makeValidBoard(), zoom: NaN }) === false);
check('optional fields absent passes', boards.isBoardRecord({
  id: 'b-minimal',
  name: 'Minimal',
  createdAt: 1000,
  updatedAt: 1000,
  items: []
}) === true);

// -------------------------------------------------------------
// 3. isValidStateV2
// -------------------------------------------------------------
console.log('\n--- 3. isValidStateV2 wrapper validation ---');
check('valid v2 document passes', boards.isValidStateV2(makeValidDocV2()) === true);
check('empty boards array rejected', boards.isValidStateV2(makeValidDocV2([], 'b-none')) === false);
check('excessive boards (> 500) rejected', () => {
  const many = [];
  for (let i = 0; i < 501; i++) many.push(makeValidBoard(`b-${i}`));
  return boards.isValidStateV2(makeValidDocV2(many, 'b-0')) === false;
});
check('duplicate board IDs rejected', () => {
  const dupes = [makeValidBoard('b-same'), makeValidBoard('b-same')];
  return boards.isValidStateV2(makeValidDocV2(dupes, 'b-same')) === false;
});
check('one malformed board in list causes entire document rejection', () => {
  const mixed = [makeValidBoard('b-1'), { ...makeValidBoard('b-2'), id: 'illegal char *' }];
  return boards.isValidStateV2(makeValidDocV2(mixed, 'b-1')) === false;
});
check('missing timers object rejected', boards.isValidStateV2({ ...makeValidDocV2(), timers: null }) === false);
check('non-finite timers.lastHydration rejected', boards.isValidStateV2({ ...makeValidDocV2(), timers: { lastHydration: NaN, lastBreak: 0 } }) === false);
check('non-finite timers.lastBreak rejected', boards.isValidStateV2({ ...makeValidDocV2(), timers: { lastHydration: 0, lastBreak: Infinity } }) === false);

// Active board ID validation & documented recovery policy:
check('activeBoardId not in boards rejected', boards.isValidStateV2(makeValidDocV2([makeValidBoard('b-1')], 'b-missing-id')) === false);
check('activeBoardId pointing to archived board is ACCEPTED (policy: never silently discard user data)', () => {
  const bArchived = { ...makeValidBoard('b-archived'), archived: true };
  const bActive = makeValidBoard('b-normal');
  const doc = makeValidDocV2([bArchived, bActive], 'b-archived');
  return boards.isValidStateV2(doc) === true;
});

// -------------------------------------------------------------
// 4. normalizeActiveBoard
// -------------------------------------------------------------
console.log('\n--- 4. normalizeActiveBoard recovery policy ---');
{
  const b1 = makeValidBoard('b-1');
  const doc = makeValidDocV2([b1], 'b-1');
  boards.normalizeActiveBoard(doc);
  check('unarchived activeBoardId is preserved', doc.activeBoardId === 'b-1');
}
{
  const b1 = { ...makeValidBoard('b-1'), archived: true };
  const b2 = { ...makeValidBoard('b-2'), archived: false };
  const doc = makeValidDocV2([b1, b2], 'b-1');
  boards.normalizeActiveBoard(doc);
  check('archived activeBoardId falls back to first unarchived board', doc.activeBoardId === 'b-2');
}
{
  const b1 = { ...makeValidBoard('b-1'), archived: true };
  const b2 = { ...makeValidBoard('b-2'), archived: true };
  const doc = makeValidDocV2([b1, b2], 'b-1');
  boards.normalizeActiveBoard(doc);
  check('all boards archived does not crash or corrupt document', doc.activeBoardId === 'b-1' && doc.boards.length === 2);
}

// -------------------------------------------------------------
// 5. migrateV1ToV2
// -------------------------------------------------------------
console.log('\n--- 5. migrateV1ToV2 legacy migration ---');
{
  const v1 = {
    title: 'Legacy Board',
    gridStyle: 'lines',
    pan: { x: 100, y: 150 },
    zoom: 1.5,
    items: [{ id: 'legacy-card', type: 'thought', x: 20, y: 20, content: 'old' }],
    timers: { lastHydration: 12345, lastBreak: 67890 },
    settings: { water: { enabled: true } },
    clips: [{ id: 'clip-1', text: 'snippet' }]
  };
  const v2 = boards.migrateV1ToV2(v1);
  check('migrated v2 is valid v2', boards.isValidStateV2(v2) === true);
  check('migrated v2 has 1 board', v2.boards.length === 1);
  check('migrated v2 activeBoardId references the created board', v2.activeBoardId === v2.boards[0].id);
  check('migrated board keeps title, gridStyle, pan, zoom, items', (
    v2.boards[0].title === 'Legacy Board' &&
    v2.boards[0].gridStyle === 'lines' &&
    v2.boards[0].pan.x === 100 &&
    v2.boards[0].pan.y === 150 &&
    v2.boards[0].zoom === 1.5 &&
    v2.boards[0].items.length === 1 &&
    v2.boards[0].items[0].id === 'legacy-card'
  ));
  check('migrated v2 preserves timers, settings, clips', (
    v2.timers.lastHydration === 12345 &&
    v2.timers.lastBreak === 67890 &&
    v2.settings.water.enabled === true &&
    v2.clips.length === 1
  ));
}

// -------------------------------------------------------------
// 6. flattenActiveBoard & upsertBoardFromFlat
// -------------------------------------------------------------
console.log('\n--- 6. flattenActiveBoard & upsertBoardFromFlat ---');
{
  const b1 = makeValidBoard('b-1', 'Board 1');
  const b2 = makeValidBoard('b-2', 'Board 2');
  b2.items = [{ id: 'b2-item', type: 'todo', x: 50, y: 50, content: 'task' }];
  const doc = makeValidDocV2([b1, b2], 'b-2');

  const flat = boards.flattenActiveBoard(doc);
  check('flattenActiveBoard projects active board items', flat.items.length === 1 && flat.items[0].id === 'b2-item');
  check('flattenActiveBoard includes doc timers & settings', flat.timers?.lastHydration === 1700000000000 && flat.settings !== undefined);

  // Upsert change to active board
  flat.items.push({ id: 'b2-item-2', type: 'text', x: 60, y: 60, content: 'new' });
  flat.title = 'Updated Board 2';
  boards.upsertBoardFromFlat(doc, flat, 1700000005000);

  check('upsertBoardFromFlat updates active board in place', doc.boards[1].title === 'Updated Board 2' && doc.boards[1].items.length === 2);
  check('upsertBoardFromFlat leaves other boards untouched', doc.boards[0].items.length === 1 && doc.boards[0].title === 'Board Title');
}

// -------------------------------------------------------------
// 7. candidateTimestamp & skew artifact ranking for v2 candidates
// -------------------------------------------------------------
console.log('\n--- 7. candidateTimestamp & skew ranking for v2 candidates ---');
const NOW = 1800000000000;
const TOL = recovery.STATE_SKEW_TOLERANCE_MS; // 60000

// Normal candidate ranking
check('v2 candidate with recent savedAt passes through', recovery.candidateTimestamp(NOW - 5000, 0, NOW) === NOW - 5000);
check('v2 candidate with savedAt within tolerance passes through', recovery.candidateTimestamp(NOW + 30000, 0, NOW) === NOW + 30000);
check('v2 candidate with savedAt beyond tolerance rejected (null)', recovery.candidateTimestamp(NOW + 3 * 3600000, 0, NOW) === null);

// Skew classification
check('v2 future-stamped candidate classified as skew artifact', recovery.isSkewArtifactStamp(NOW + 3 * 3600000, NOW) === true);
check('v2 normal-stamped candidate is NOT skew artifact', recovery.isSkewArtifactStamp(NOW - 1000, NOW) === false);

// Tier-B ranking sort: larger raw stamp wins, ties break by candidate order (0=P, 1=.tmp, 2=.bak)
const skewCandidates = [
  { savedAt: NOW + 2 * 3600000, order: 0 },
  { savedAt: NOW + 5 * 3600000, order: 1 },
  { savedAt: NOW + 1 * 3600000, order: 2 }
];
skewCandidates.sort(recovery.skewFallbackSort);
check('tier-B sorts newest raw stamp first (.tmp with +5h wins)', skewCandidates[0].order === 1 && skewCandidates[0].savedAt === NOW + 5 * 3600000);

const tieCandidates = [
  { savedAt: NOW + 3 * 3600000, order: 2 },
  { savedAt: NOW + 3 * 3600000, order: 0 },
  { savedAt: NOW + 3 * 3600000, order: 1 }
];
tieCandidates.sort(recovery.skewFallbackSort);
check('tier-B tie-breaks equal stamps by order (primary before .tmp before .bak)', tieCandidates[0].order === 0 && tieCandidates[1].order === 1 && tieCandidates[2].order === 2);

console.log('\n=============================================');
console.log(`V2 RECOVERY UNIT SUITE: ${pass} PASS, ${fail} FAIL`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(' - ' + f));
}
process.exit(fail > 0 ? 1 : 0);
