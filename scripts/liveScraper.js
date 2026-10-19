function sortedEntries(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).sort().map(k => [k, obj[k]]);
}

export function liveSnapshotHash(obs) {
  return JSON.stringify({
    status: obs.status ?? null,
    period: obs.period ?? null,
    minute: obs.minute ?? null,
    scoreHome: obs.score?.home ?? null,
    scoreAway: obs.score?.away ?? null,
    incidents: (obs.incidents || []).length,
    ratings: sortedEntries(obs.ratings),
    assists: sortedEntries(obs.assists),
    starters: [...(obs.starters || [])].map(String).sort()
  });
}

export function isDuplicateWriteError(e) {
  if (!e) return false;
  const errors = Array.isArray(e.writeErrors) ? e.writeErrors : [];
  if (errors.length) return errors.every(w => w.code === 11000);
  return e.code === 11000;
}

const CRITICAL_ENDPOINTS = new Set(['incidents', 'fantasy', 'lineups']);

export function criticalFetchFailures(raw) {
  return (raw?.failures || []).filter(f => CRITICAL_ENDPOINTS.has(f.endpoint));
}

export function hasCriticalFetchFailure(raw) {
  return criticalFetchFailures(raw).length > 0;
}

export function scrapeHealth({ fatal = false, criticalFailed = 0, attempted = 0, failed = 0 } = {}) {
  return !fatal && criticalFailed === 0
    && !(attempted > 0 && failed >= attempted);
}
