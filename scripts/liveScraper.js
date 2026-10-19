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
  if (e.code === 11000) return true;
  return Array.isArray(e.writeErrors) &&
    e.writeErrors.length > 0 &&
    e.writeErrors.every(w => w?.code === 11000);
}
