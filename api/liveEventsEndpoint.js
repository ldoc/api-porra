import { parseSinceParam } from './matchStatsFilter.js';
import { LIVE_EVENTS_DELTA_LIMIT, buildLiveEventsPage, liveEventsQuery } from './live.js';

/**
 * Pure decision for the `since` cursor. Invalid or future cursors are not
 * errors for the client: they mean "do a full load" and are flagged as resync.
 */
export function resolveLiveEventsRequest({ sinceRaw, nowMs = Date.now() } = {}) {
  const parsed = parseSinceParam(sinceRaw);
  if (!parsed.ok) {
    return { sinceDate: null, full: true, resync: true, invalid: true };
  }
  if (parsed.date && parsed.date.getTime() > nowMs) {
    return { sinceDate: null, full: true, resync: true, future: true };
  }
  return { sinceDate: parsed.date, full: !parsed.date, resync: false, invalid: false, future: false };
}

/**
 * Loads the page from a Mongo model-like dependency. Full loads are
 * authoritative (no limit); deltas fetch `limit + 1` to detect truncation.
 */
export async function loadLiveEventsPage({
  LiveEvent,
  sinceRaw = null,
  eventId = null,
  source = 'default',
  nowMs = Date.now(),
  limit = LIVE_EVENTS_DELTA_LIMIT
} = {}) {
  const decision = resolveLiveEventsRequest({ sinceRaw, nowMs });
  const filter = liveEventsQuery(decision.sinceDate, { excludeSim: source !== 'sim' });
  if (source === 'sim') filter.source = 'sim';
  if (eventId != null) filter.eventId = Number(eventId);
  filter.expireAt = { $gt: new Date(nowMs) };

  const effectiveLimit = decision.full ? null : limit;
  const query = LiveEvent.find(filter, '-_id -expireAt')
    .sort({ ingestedAt: 1, seq: 1, _id: 1 });
  if (effectiveLimit) query.limit(effectiveLimit + 1);
  const docs = await query.lean();

  return buildLiveEventsPage({
    docs,
    since: decision.sinceDate,
    limit: effectiveLimit,
    resync: decision.resync
  });
}
