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

export function liveStatusFromSofascore(statusType, statusCode = null) {
  if (statusCode === 31 || statusType === 'halftime') return 'HT';
  if (statusCode === 100 || statusType === 'finished') return 'FT';
  if (statusType === 'notstarted' || statusType === 'willsoonstart') return 'NS';
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

const PERIOD_BASE = { period1: 0, period2: 45, period3: 90, period4: 105 };

export function liveMinute(lastPeriod, periodStartTs, nowSecs) {
  const base = PERIOD_BASE[lastPeriod];
  if (base === undefined) return null;
  if (!Number.isFinite(periodStartTs) || !Number.isFinite(nowSecs)) return null;
  return base + Math.floor((nowSecs - periodStartTs) / 60) + 1;
}

export function buildLiveResponse(docs) {
  const liveMatches = [...(docs || [])].sort((a, b) => a.eventId - b.eventId);
  const max = liveMatches.reduce((acc, d) => {
    const t = d.lastUpdated ? new Date(d.lastUpdated).getTime() : 0;
    return t > acc ? t : acc;
  }, 0);
  return { ok: true, liveMatches, serverTime: max ? new Date(max).toISOString() : null };
}

export function buildLiveEventsResponse(docs, serverTime = null) {
  const events = [...(docs || [])].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return { ok: true, events, serverTime: serverTime ?? null };
}
