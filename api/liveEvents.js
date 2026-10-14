export const EVENT_TYPES = [
  'lineup', 'status', 'goal', 'goal_cancelled', 'penalty_saved',
  'penalty_missed', 'card', 'substitution', 'rating', 'score', 'match_final'
];

export function expireAtEndOfDayUTC(nowMs) {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 0));
}

export function foldScore(events) {
  const byId = new Map(events.map(e => [e.sourceId, e]));
  let home = 0, away = 0;
  for (const e of events) {
    if (e.type === 'goal') {
      if (e.payload?.isHome) home++; else away++;
    } else if (e.type === 'score') {
      home = e.payload?.scoreHome ?? home;
      away = e.payload?.scoreAway ?? away;
    } else if (e.type === 'goal_cancelled') {
      const g = byId.get(e.payload?.ofSourceId);
      if (g) { if (g.payload?.isHome) home--; else away--; }
    }
  }
  return { home: Math.max(0, home), away: Math.max(0, away) };
}

export function deriveEvents(obs, existing = [], nowMs = Date.now()) {
  const have = new Set(existing.map(e => e.sourceId));
  const out = [];
  const expireAt = expireAtEndOfDayUTC(nowMs);
  const evTs = (minute) => obs.kickoffMs != null
    ? new Date(obs.kickoffMs + (minute || 0) * 60000 + ((minute || 0) > 45 ? 15 * 60000 : 0))
    : new Date(nowMs);
  const push = (ev) => {
    if (have.has(ev.sourceId)) return;
    have.add(ev.sourceId);
    out.push({
      eventId: obs.eventId, ts: ev.ts ?? evTs(ev.minute), second: 0,
      minute: ev.minute ?? null, type: ev.type,
      teamId: ev.teamId ?? null, playerId: ev.playerId ?? null,
      sourceId: ev.sourceId, payload: ev.payload ?? {}, expireAt
    });
  };

  if (Array.isArray(obs.starters) && obs.starters.length) {
    push({ sourceId: 'lineup|' + [...obs.starters].sort((a, b) => a - b).join(','), type: 'lineup', minute: 0, payload: { starters: obs.starters } });
  }

  for (const inc of obs.incidents || []) {
    if (inc.type === 'goal') {
      push({ sourceId: 'goal|' + inc.sourceId, type: 'goal', teamId: inc.teamId, playerId: inc.playerId, minute: inc.time ?? null,
        payload: { scorerId: inc.playerId, assistId: inc.assistId ?? null, isPenalty: inc.class === 'penalty', isOwnGoal: inc.class === 'ownGoal', isHome: !!inc.isHome, scoreHome: inc.homeScore ?? null, scoreAway: inc.awayScore ?? null } });
    }
  }

  if (obs.status) {
    const p2 = obs.period && obs.period !== 'period1';
    const sm = obs.status === 'HT' ? 45 : obs.status === 'LIVE' ? (p2 ? 45 : 0) : (obs.minute ?? 90);
    const breakMin = (obs.status === 'LIVE' && p2) || obs.status === 'FT' ? 15 : 0;
    const sts = obs.kickoffMs != null ? new Date(obs.kickoffMs + (sm + breakMin) * 60000) : undefined;
    push({ sourceId: 'status|' + obs.status + '|' + (obs.period ?? ''), type: 'status', minute: sm, ts: sts, payload: { status: obs.status, period: obs.period ?? null } });
  }

  for (const [pid, rating] of Object.entries(obs.ratings || {})) {
    push({ sourceId: `rating|${pid}|${rating}`, type: 'rating', playerId: Number(pid), minute: obs.minute ?? null, payload: { rating } });
  }

  const folded = foldScore([...existing, ...out]);
  if (obs.score && (folded.home !== obs.score.home || folded.away !== obs.score.away)) {
    push({ sourceId: `score|${obs.score.home}-${obs.score.away}`, type: 'score', minute: obs.minute ?? null, payload: { scoreHome: obs.score.home, scoreAway: obs.score.away } });
  }

  return out;
}
