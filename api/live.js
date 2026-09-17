export const LIVE_REFRESH_DEFAULT = 60;
const MATCH_DURATION_S = 2 * 3600;
const PRE_WINDOW_S = 15 * 60;

export function isLiveWindow(fechaTs, nowMs) {
  const start = fechaTs * 1000 - PRE_WINDOW_S * 1000;
  const end = fechaTs * 1000 + MATCH_DURATION_S * 1000;
  return nowMs >= start && nowMs <= end;
}

export function getLiveRefreshSecs(config) {
  const v = config?.liveRefreshSecs;
  return Number.isInteger(v) && v > 0 ? v : LIVE_REFRESH_DEFAULT;
}

export function minuteToStatus(minute) {
  if (minute >= 90) return 'FT';
  if (minute >= 45) return 'HT';
  return 'LIVE';
}

export function liveStatusFromSofascore(statusType) {
  if (statusType === 'halftime') return 'HT';
  if (statusType === 'finished') return 'FT';
  if (statusType === 'inprogress') return 'LIVE';
  return null;
}

export function buildLiveDoc(eventId, stats, status, nowMs, minute = null) {
  const day = new Date(nowMs);
  const expireAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59));
  return { eventId, stats, status, minute, lastUpdated: new Date(nowMs), expireAt };
}

export function selectLiveMatches(calendar, nowMs) {
  return (calendar || []).filter(m => isLiveWindow(m.fecha, nowMs));
}

export function buildLiveResponse(docs) {
  const liveMatches = [...(docs || [])].sort((a, b) => a.eventId - b.eventId);
  const max = liveMatches.reduce((acc, d) => {
    const t = d.lastUpdated ? new Date(d.lastUpdated).getTime() : 0;
    return t > acc ? t : acc;
  }, 0);
  return { ok: true, liveMatches, serverTime: max ? new Date(max).toISOString() : null };
}
