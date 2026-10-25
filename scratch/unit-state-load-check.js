// QA-G4 D-1 regression: candidateTimestamp skew guard (plain node; pure module).
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} :: ${String(detail).slice(0, 200)}`); }
}
const m = await import('../dist/main/state-recovery.js');
const { candidateTimestamp, STATE_SKEW_TOLERANCE_MS } = m;

const NOW = 1_800_000_000_000; // fixed "real" wall clock
const TOL = STATE_SKEW_TOLERANCE_MS;
const fallback = Math.max(1_700_000_000_000, 1_710_000_000_000);

// normal cases behave exactly like the previous inline logic
check('finite savedAt is used as-is', candidateTimestamp(NOW - 1000, fallback, NOW) === NOW - 1000, 'recent stamp');
check('stamp exactly at now is used', candidateTimestamp(NOW, fallback, NOW) === NOW, '');
check('stamp within tolerance is used', candidateTimestamp(NOW + TOL - 1, fallback, NOW) === NOW + TOL - 1, 'drift within tolerance');

// the D-1 bug case: a .bak stamped in the FUTURE (clock rolled back after save)
check('future stamp beyond tolerance is rejected (null)', candidateTimestamp(NOW + TOL + 1, fallback, NOW) === null, 'skew artifact');
check('far-future stamp (hours, the observed G4 case) is rejected', candidateTimestamp(NOW + 6 * 3600 * 1000, fallback, NOW) === null, '');

// legacy saves without savedAt keep the timers-based fallback with no skew notion
check('missing savedAt falls back to timers ts', candidateTimestamp(undefined, fallback, NOW) === fallback, '');
check('NaN savedAt falls back', candidateTimestamp(NaN, fallback, NOW) === fallback, '');
check('Infinity savedAt falls back', candidateTimestamp(Infinity, fallback, NOW) === fallback, '');
check('non-number savedAt falls back', candidateTimestamp('2026-10-24', fallback, NOW) === fallback, '');

// pick semantics around the reported incident (primary vs .bak):
const realPrimary = candidateTimestamp(NOW, fallback, NOW);        // explicit real stamp, exists? ~400ms late write
const skewedBak = candidateTimestamp(NOW + 3 * 3600 * 1000, fallback, NOW);
check('primary usable while skewed bak rejected (primary wins)', realPrimary !== null && skewedBak === null, `primary=${realPrimary} bak=${skewedBak}`);
const olderPrimary = candidateTimestamp(NOW - 5 * 60 * 1000, fallback, NOW);
check('even an older valid primary is usable when bak is rejected', olderPrimary !== null, String(olderPrimary));

// crash-window recovery preserved: a genuinely fresher .tmp still outranks primary
const fresherTmp = candidateTimestamp(NOW + TOL - 1, fallback, NOW);
check('fresh-but-bounded .tmp still ranks above older primary', fresherTmp !== null && fresherTmp > olderPrimary, '');

console.log(fail === 0
  ? `=== ALL STATE-RECOVERY UNIT CHECKS PASS (${pass}) ===`
  : `FAILURES: ${fail} / ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
