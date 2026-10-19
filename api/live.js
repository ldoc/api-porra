import { etagMatches } from './etag.js';

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

export function maxIngestedAt(docs) {
  return (docs || []).reduce((max, d) => {
    const t = d.ingestedAt ? new Date(d.ingestedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);
}

export function liveEventsVersion(docs) {
  return new Date(maxIngestedAt(docs) || 0).toISOString();
}

export function shouldReturn304({ cached, version, since, source = '', ifNoneMatch }) {
  return Boolean(
    cached?.etag &&
    cached.version === version &&
    cached.since === since &&
    (cached.source || '') === (source || '') &&
    etagMatches(ifNoneMatch, cached.etag)
  );
}

export function buildLiveEventsResponse(docs, serverTime = null, resync = false) {
  const events = [...(docs || [])].sort((a, b) => {
    const t = new Date(a.ts).getTime() - new Date(b.ts).getTime();
    return t || ((a.seq || 0) - (b.seq || 0));
  });
  return { ok: true, events, serverTime: serverTime ?? null, resync: !!resync };
}

export function liveEventsQuery(sinceDate, { excludeSim = false } = {}) {
  const filter = sinceDate ? { ingestedAt: { $gt: sinceDate } } : {};
  if (excludeSim) filter.source = { $ne: 'sim' };
  return filter;
}

function nonNegativeInt(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function buildScrapeLog({ startedMs, nowMs, live = 0, ok = 0, inserted = 0 } = {}) {
  const at = Number.isFinite(nowMs) ? nowMs : Date.now();
  const ms = Number.isFinite(startedMs) ? Math.max(0, at - startedMs) : 0;
  return {
    t: new Date(at).toISOString(),
    live: nonNegativeInt(live),
    ok: nonNegativeInt(ok),
    inserted: nonNegativeInt(inserted),
    ms
  };
}

export function buildLiveHealth(lastScrapeAt, lastScrapeOk, nowMs = Date.now(), staleMs = 90000) {
  const date = lastScrapeAt instanceof Date ? lastScrapeAt : new Date(lastScrapeAt);
  const valid = lastScrapeAt != null && !Number.isNaN(date.getTime());
  const fresh = valid && nowMs - date.getTime() <= staleMs;
  return {
    ok: valid && fresh && lastScrapeOk !== false,
    lastScrapeAt: valid ? date.toISOString() : null
  };
}
