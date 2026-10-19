export const EVENT_TYPES = [
  'lineup', 'status', 'goal', 'goal_cancelled', 'assist', 'penalty_saved',
  'penalty_missed', 'card', 'substitution', 'rating', 'score', 'match_final'
];

export function expireAtEndOfDayUTC(nowMs) {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 0));
}

const TYPE_RANK = {
  status: 1, lineup: 2, goal: 3, own_goal: 3, goal_cancelled: 4,
  penalty_saved: 5, penalty_missed: 5, card: 6, substitution: 7,
  assist: 8, rating: 9, score: 10, match_final: 11
};

function tsOfMinute(kickoffMs, minute, addedTime, fallbackMs) {
  if (kickoffMs == null) return new Date(fallbackMs);
  const m = (minute || 0) + (addedTime || 0) + ((minute || 0) > 45 ? 15 : 0);
  return new Date(kickoffMs + m * 60000);
}

export function foldScore(events) {
  const sorted = [...events].sort((a, b) => {
    const t = new Date(a.ts).getTime() - new Date(b.ts).getTime();
    if (t) return t;
    const s = (a.seq || 0) - (b.seq || 0);
    if (s) return s;
    return (TYPE_RANK[a.type] ?? 99) - (TYPE_RANK[b.type] ?? 99);
  });
  const byId = new Map(sorted.map(e => [e.sourceId, e]));
  let home = 0, away = 0;
  for (const e of sorted) {
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

let _rev = 0;
function rev() { _rev += 1; return `${Date.now().toString(36)}-${_rev.toString(36)}`; }

function isNewer(a, b) {
  const t = new Date(a.ts).getTime() - new Date(b.ts).getTime();
  if (t) return t > 0;
  return (a.seq || 0) >= (b.seq || 0);
}

function latestEvent(events, type) {
  let best = null;
  for (const e of events) {
    if (e.type !== type) continue;
    if (!best || isNewer(e, best)) best = e;
  }
  return best;
}

function latestByPlayer(events, type) {
  const map = new Map();
  for (const e of events) {
    if (e.type !== type) continue;
    const key = String(e.playerId);
    const prev = map.get(key);
    if (!prev || isNewer(e, prev)) map.set(key, e);
  }
  return map;
}

export function deriveEvents(obs, existing = [], nowMs = Date.now()) {
  const have = new Set(existing.map(e => e.sourceId));
  const out = [];
  const expireAt = expireAtEndOfDayUTC(obs.kickoffMs != null ? obs.kickoffMs : nowMs);
  const source = obs.source || 'scraper';
  let seq = 0;
  const push = (ev) => {
    if (have.has(ev.sourceId)) return;
    have.add(ev.sourceId);
    out.push({
      eventId: obs.eventId, ingestedAt: new Date(nowMs),
      ts: ev.ts ?? tsOfMinute(obs.kickoffMs, ev.minute, ev.addedTime, nowMs),
      second: 0, minute: ev.minute ?? null, type: ev.type,
      teamId: ev.teamId ?? null, playerId: ev.playerId ?? null,
      sourceId: ev.sourceId, seq: seq++, source,
      payload: ev.payload ?? {}, expireAt
    });
  };

  if (obs.status) {
    const p2 = obs.period && obs.period !== 'period1';
    const sm = obs.status === 'NS' ? 0
      : obs.status === 'HT' ? 45
      : obs.status === 'LIVE' ? (p2 ? 45 : 0)
      : (obs.minute ?? 90);
    const breakMin = (obs.status === 'LIVE' && p2) || obs.status === 'FT' ? 15 : 0;
    const sts = obs.kickoffMs != null ? new Date(obs.kickoffMs + (sm + breakMin) * 60000) : undefined;
    push({ sourceId: 'status|' + obs.status + '|' + (obs.period ?? ''), type: 'status', minute: sm, ts: sts,
      payload: { status: obs.status, period: obs.period ?? null,
        kickoffTs: obs.kickoffMs != null ? new Date(obs.kickoffMs).toISOString() : null } });
  }

  if (Array.isArray(obs.starters) && obs.starters.length) {
    push({ sourceId: 'lineup|' + [...obs.starters].sort((a, b) => a - b).join(','), type: 'lineup', minute: 0,
      payload: { starters: obs.starters } });
  }

  // Incidencias minuto-mayor: (time, TYPE_RANK). El eje temporal es ts; TYPE_RANK solo desempata mismo minuto.
  const incidents = [...(obs.incidents || [])].sort((a, b) => {
    const d = (a.time ?? 0) - (b.time ?? 0);
    return d || ((TYPE_RANK[a.type] ?? 99) - (TYPE_RANK[b.type] ?? 99));
  });
  for (const inc of incidents) {
    if (inc.type === 'goal') {
      push({ sourceId: 'goal|' + inc.sourceId, type: 'goal', teamId: inc.teamId, playerId: inc.playerId, minute: inc.time ?? null, addedTime: inc.addedTime ?? null,
        payload: { scorerId: inc.playerId, isPenalty: inc.class === 'penalty', isOwnGoal: inc.class === 'ownGoal', isHome: !!inc.isHome, scoreHome: inc.homeScore ?? null, scoreAway: inc.awayScore ?? null } });
    } else if (inc.type === 'penalty_saved') {
      push({ sourceId: 'psave|' + inc.sourceId, type: 'penalty_saved', teamId: inc.teamId, playerId: inc.keeperId, minute: inc.time ?? null, addedTime: inc.addedTime ?? null,
        payload: { keeperId: inc.keeperId ?? null, takerId: inc.takerId ?? null } });
    } else if (inc.type === 'penalty_missed') {
      push({ sourceId: 'pmiss|' + inc.sourceId, type: 'penalty_missed', teamId: inc.teamId, playerId: inc.takerId, minute: inc.time ?? null, addedTime: inc.addedTime ?? null,
        payload: { takerId: inc.takerId ?? null } });
    } else if (inc.type === 'card') {
      push({ sourceId: 'card|' + inc.sourceId, type: 'card', teamId: inc.teamId, playerId: inc.playerId, minute: inc.time ?? null, addedTime: inc.addedTime ?? null,
        payload: { cardType: inc.cardType ?? inc.class ?? 'yellow' } });
    } else if (inc.type === 'substitution') {
      push({ sourceId: 'sub|' + inc.sourceId, type: 'substitution', teamId: inc.teamId, minute: inc.time ?? null, addedTime: inc.addedTime ?? null,
        payload: { inId: inc.inId ?? null, outId: inc.outId ?? null } });
    } else if (inc.type === 'goal_cancelled') {
      push({ sourceId: 'cancel|' + inc.sourceId, type: 'goal_cancelled', teamId: inc.teamId, playerId: inc.playerId, minute: inc.time ?? null, addedTime: inc.addedTime ?? null,
        payload: { ofSourceId: findGoalToCancel(inc, existing, out) } });
    }
  }

  const prevAssists = latestByPlayer(existing, 'assist');
  for (const [pid, count] of Object.entries(obs.assists || {})) {
    const prev = prevAssists.get(String(pid));
    const prevCount = prev ? (prev.payload?.asistencias ?? 0) : 0;
    if (Number(count) === prevCount) continue;
    push({ sourceId: `assist|${pid}|${count}|${rev()}`, type: 'assist', playerId: Number(pid), minute: obs.minute ?? null, payload: { asistencias: Number(count) } });
  }

  const prevRatings = latestByPlayer(existing, 'rating');
  for (const [pid, rating] of Object.entries(obs.ratings || {})) {
    const prev = prevRatings.get(String(pid));
    if (prev && Number(prev.payload?.rating) === Number(rating)) continue;
    push({ sourceId: `rating|${pid}|${rating}|${rev()}`, type: 'rating', playerId: Number(pid), minute: obs.minute ?? null, payload: { rating } });
  }

  const after = foldScore([...existing, ...out]);
  const lastScore = latestEvent(existing, 'score');
  const lastScoreMatches = !!lastScore && !!obs.score &&
    Number(lastScore.payload?.scoreHome) === Number(obs.score.home) &&
    Number(lastScore.payload?.scoreAway) === Number(obs.score.away);
  const tickHasGoal = out.some(e => e.type === 'goal' || e.type === 'own_goal' || e.type === 'goal_cancelled');
  if (obs.score && (after.home !== obs.score.home || after.away !== obs.score.away) &&
      (!lastScoreMatches || tickHasGoal)) {
    const lastOutTs = out.reduce((m, e) => Math.max(m, new Date(e.ts).getTime()), -Infinity);
    push({ sourceId: `score|${obs.score.home}-${obs.score.away}|${rev()}`, type: 'score', minute: obs.minute ?? null,
      ts: new Date(Math.max(nowMs, lastOutTs + 1000)),
      payload: { scoreHome: obs.score.home, scoreAway: obs.score.away } });
  }

  if (obs.status === 'FT') {
    push({ sourceId: 'final', type: 'match_final', minute: obs.minute ?? 90,
      payload: { scoreHome: obs.score?.home ?? null, scoreAway: obs.score?.away ?? null, ratings: obs.ratings || {}, minutes: obs.minutes || {} } });
  }

  return out;
}

function findGoalToCancel(inc, existing, out) {
  if (inc.teamId == null || inc.time == null) return null;
  const all = [...existing, ...out];
  const cancelled = new Set(all.filter(e => e.type === 'goal_cancelled').map(e => e.payload?.ofSourceId));
  const goals = all.filter(e => e.type === 'goal' && !cancelled.has(e.sourceId));
  const mine = goals.filter(e => {
    if (e.teamId !== inc.teamId) return false;
    if (e.minute != null && Math.abs(e.minute - inc.time) > 5) return false;
    return true;
  });
  if (!mine.length) return null;
  mine.sort((a, b) => (new Date(a.ts).getTime() - new Date(b.ts).getTime()) || ((a.seq || 0) - (b.seq || 0)));
  return mine[mine.length - 1].sourceId;
}
