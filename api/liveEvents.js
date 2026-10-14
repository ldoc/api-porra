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
    } else if (inc.type === 'penalty_saved') {
      push({ sourceId: 'psave|' + inc.sourceId, type: 'penalty_saved', teamId: inc.teamId, playerId: inc.keeperId, minute: inc.time ?? null,
        payload: { keeperId: inc.keeperId ?? null, takerId: inc.takerId ?? null } });
    } else if (inc.type === 'penalty_missed') {
      push({ sourceId: 'pmiss|' + inc.sourceId, type: 'penalty_missed', teamId: inc.teamId, playerId: inc.takerId, minute: inc.time ?? null,
        payload: { takerId: inc.takerId ?? null } });
    } else if (inc.type === 'card') {
      push({ sourceId: 'card|' + inc.sourceId, type: 'card', teamId: inc.teamId, playerId: inc.playerId, minute: inc.time ?? null,
        payload: { cardType: inc.cardType ?? inc.class ?? 'yellow' } });
    } else if (inc.type === 'substitution') {
      push({ sourceId: 'sub|' + inc.sourceId, type: 'substitution', teamId: inc.teamId, minute: inc.time ?? null,
        payload: { inId: inc.inId ?? null, outId: inc.outId ?? null } });
    } else if (inc.type === 'goal_cancelled') {
      const ofSourceId = findGoalToCancel(inc, existing, out);
      push({ sourceId: 'cancel|' + inc.sourceId, type: 'goal_cancelled', teamId: inc.teamId, playerId: inc.playerId, minute: inc.time ?? null,
        payload: { ofSourceId } });
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

  if (obs.status === 'FT') {
    push({ sourceId: 'final', type: 'match_final', minute: obs.minute ?? 90,
      payload: { scoreHome: obs.score?.home ?? null, scoreAway: obs.score?.away ?? null, ratings: obs.ratings || {}, minutes: obs.minutes || {} } });
  }

  return out;
}

function findGoalToCancel(inc, existing, out) {
  const all = [...existing, ...out];
  const cancelled = new Set(all.filter(e => e.type === 'goal_cancelled').map(e => e.payload?.ofSourceId));
  const goals = all.filter(e => e.type === 'goal' && !cancelled.has(e.sourceId));
  const mine = goals.filter(e => !inc.teamId || e.teamId === inc.teamId);
  const pool = mine.length ? mine : goals;
  const last = pool[pool.length - 1];
  return last ? last.sourceId : null;
}
