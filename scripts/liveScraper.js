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

export function shouldRefreshLineups({
  cachedAt,
  statusKey,
  cachedStatusKey,
  hasSubstitution,
  nowMs,
  ttlMs = 300000
}) {
  if (cachedAt == null) return true;
  if (hasSubstitution) return true;
  if (statusKey !== cachedStatusKey) return true;
  return nowMs - cachedAt >= ttlMs;
}

export function isCacheableLineups(data) {
  return !!(data?.home?.players?.length && data?.away?.players?.length);
}
