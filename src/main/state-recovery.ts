/**
 * Persistent-state recovery helpers (electron-independent so the plain-node
 * unit layer can import the compiled module directly).
 *
 * QA-G4 D-1 finding: stateLoad ranks save candidates (primary file / .tmp /
 * .bak) purely by their savedAt stamp. flushSave stamps savedAt with
 * Date.now(); after a backward system-clock jump (NTP correction, DST/manual
 * clock change), older files can carry timestamps that sit in the future
 * relative to the new wall clock. A stale .bak stamped "in the future" then
 * outranks the fresh-but-"older"-looking primary, the stale state gets loaded
 * at boot, and the renderer's own boot save persists the revert - silently
 * replacing current state with older content.
 *
 * Guard: a timestamp farther than STATE_SKEW_TOLERANCE_MS in the future is a
 * clock-skew artifact and may never be treated as fresh.
 */

/** Tolerance for ordinary drift between save time and load time. */
export const STATE_SKEW_TOLERANCE_MS = 60_000;

/**
 * Compute the freshness timestamp of one save candidate.
 * @param savedAt  candidate's savedAt value (may be missing/invalid)
 * @param fallbackTs  timestamp derived from embedded timers (legacy saves)
 * @param now  current wall clock in ms
 * @returns usable timestamp, or null when the stamp is a future-skew artifact
 */
export function candidateTimestamp(
  savedAt: unknown,
  fallbackTs: number,
  now: number
): number | null {
  if (typeof savedAt === 'number' && Number.isFinite(savedAt)) {
    return savedAt > now + STATE_SKEW_TOLERANCE_MS ? null : savedAt;
  }
  return fallbackTs;
}

/**
 * QA-G4S: classify a stamp that the skew guard rejected. A future stamp
 * beyond the tolerance marks a structurally valid file written while the
 * system clock ran ahead (backward clock jump before the next boot). The
 * stamp itself is returned for the ALL-REJECTED FALLBACK ranking only;
 * it never takes part in normal ranking, so a fresh (real-clock or
 * within-tolerance) candidate can never be overridden by a skew-stamped one.
 * Missing/malformed stamps never reach this predicate: the caller already
 * ranks them via the timers fallback.
 */
export function isSkewArtifactStamp(
  savedAt: unknown,
  now: number
): savedAt is number {
  return (
    typeof savedAt === 'number' &&
    Number.isFinite(savedAt) &&
    savedAt > now + STATE_SKEW_TOLERANCE_MS
  );
}

export interface SkewCandidate {
  /** raw (beyond-tolerance) savedAt stamp */
  savedAt: number;
  /** scan position: 0 = primary, 1 = .tmp, 2 = .bak */
  order: number;
}

/**
 * QA-G4S tier-B ranking for skew artifacts. Used ONLY when every valid
 * candidate was future-stamped beyond tolerance, i.e. normal ranking found
 * nothing: the largest raw stamp is the most recently written state from the
 * ahead-clock era; on equal stamps the earlier-scanned candidate wins
 * (primary before .tmp before .bak), mirroring tier A's keep-first rule.
 */
export function skewFallbackSort(a: SkewCandidate, b: SkewCandidate): number {
  return b.savedAt - a.savedAt || a.order - b.order;
}
