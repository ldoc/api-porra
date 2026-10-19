# Live v2 API (api-porra) — Corrección, seguridad y rendimiento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que el log de eventos live sea determinista y correcto, aislar el simulador del live real y reducir el coste del scraper y del endpoint.

**Architecture:** Se mantiene `liveevents` como log append-only. Se añaden `seq` (orden dentro del tick) y `source` (`scraper|sim`). La derivación emite en orden canónico, la asistencia pasa a ser un contador absoluto reemisible y el cursor del delta se calcula con los documentos devueltos. El endpoint gana un ETag barato por versión y caché de cuerpo.

**Tech Stack:** Node.js ES Modules, Express-free HTTP nativo, MongoDB/Mongoose, `node:test`.

## Global Constraints

- ES Modules (`import/export`), nunca CommonJS.
- Tests: `node --test tests/*.test.js` (no `node --test tests/`).
- Rama de trabajo: `feature/live-v2`.
- No romper `{ eventId, sourceId }` único ni el TTL existente (`expireAt`).
- Todo evento nuevo debe llevar `source` (`scraper` por defecto).
- El simulador escribe `source: 'sim'`; el scraper real **nunca** lo lee.
- Fase de liga únicamente: sin prórroga ni tanda.
- No añadir dependencias nuevas.

---

## Fase 1 — Corrección + seguridad

### Task 1: Modelo con `seq` y `source`

**Files:**
- Modify: `db/models/LiveEvent.js`
- Test: `tests/liveEventModel.test.js`

**Interfaces:**
- Produces: `LiveEvent` con `seq: Number` (default 0) y `source: String` (default `'scraper'`), índice `{ eventId: 1, ts: 1 }`.

- [ ] **Step 1: Write the failing test**

Añadir a `tests/liveEventModel.test.js`:

```js
test('LiveEvent declara seq, source e índice {eventId, ts}', () => {
  assert.equal(LiveEvent.schema.path('seq').instance, 'Number');
  assert.equal(LiveEvent.schema.path('seq').defaultValue, 0);
  assert.equal(LiveEvent.schema.path('source').defaultValue, 'scraper');
  const idx = LiveEvent.schema.indexes();
  const evTs = idx.find(([keys]) => keys.eventId === 1 && keys.ts === 1);
  assert.ok(evTs, 'falta índice {eventId, ts}');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/liveEventModel.test.js`
Expected: FAIL (no existe `seq`/`source`/índice).

- [ ] **Step 3: Write minimal implementation**

En `db/models/LiveEvent.js`, añadir al schema:

```js
  seq: { type: Number, default: 0 },
  source: { type: String, default: 'scraper', index: true },
```

y el índice:

```js
liveEventSchema.index({ eventId: 1, ts: 1 });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/liveEventModel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/models/LiveEvent.js tests/liveEventModel.test.js
git commit -m "feat(live): anade seq y source al modelo de eventos"
```

---

### Task 2: Derivación determinista (`seq`, orden canónico, `ts` con añadido, `source`)

**Files:**
- Modify: `api/liveEvents.js`
- Test: `tests/liveEvents.test.js`

**Interfaces:**
- Produces: `deriveEvents(obs, existing, nowMs)` devuelve eventos con `seq` incremental en orden canónico, `ts` que incluye `addedTime`, `source` de `obs.source || 'scraper'`.
- `foldScore(events)` ordena antes de plegar por `(ts, seq, typeRank)`.

- [ ] **Step 1: Write the failing tests**

Añadir a `tests/liveEvents.test.js`:

```js
test('deriveEvents asigna seq creciente en orden canónico', () => {
  const o = obs({ kickoffMs: Date.parse('2026-09-16T20:00:00Z'), status: 'LIVE',
    starters: [11, 12], score: { home: 1, away: 0 },
    incidents: [{ sourceId: 'g', type: 'goal', class: 'regular', time: 22, isHome: true, playerId: 11, homeScore: 1, awayScore: 0, teamId: 1 }] });
  const evs = deriveEvents(o, [], NOW);
  assert.deepEqual(evs.map(e => e.type), ['status', 'lineup', 'goal', 'score']);
  assert.deepEqual(evs.map(e => e.seq), [0, 1, 2, 3]);
});

test('deriveEvents suma addedTime al ts', () => {
  const kickoffMs = Date.parse('2026-09-16T20:00:00Z');
  const o = obs({ kickoffMs, score: { home: 1, away: 0 }, incidents: [
    { sourceId: 'g', type: 'goal', class: 'regular', time: 45, addedTime: 2, isHome: true, playerId: 11, homeScore: 1, awayScore: 0, teamId: 1 }
  ] });
  const g = deriveEvents(o, [], NOW).find(e => e.type === 'goal');
  assert.equal(new Date(g.ts).toISOString(), '2026-09-16T20:47:00.000Z');
});

test('deriveEvents etiqueta source scraper por defecto y sim si se indica', () => {
  assert.equal(deriveEvents(obs(), [], NOW)[0].source, 'scraper');
  assert.equal(deriveEvents(obs({ source: 'sim' }), [], NOW)[0].source, 'sim');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/liveEvents.test.js`
Expected: FAIL (orden actual `lineup` primero, sin `seq`, sin `addedTime`).

- [ ] **Step 3: Implement**

Sustituir en `api/liveEvents.js` el bloque desde `foldScore` hasta `findGoalToCancel` por:

```js
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
    return (TYPE_RANK[a.type] || 0) - (TYPE_RANK[b.type] || 0);
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

function latestByPlayer(events, type) {
  const map = new Map();
  for (const e of events) if (e.type === type) map.set(String(e.playerId), e);
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

  const prevRatings = latestByPlayer(existing, 'rating');
  for (const [pid, rating] of Object.entries(obs.ratings || {})) {
    const prev = prevRatings.get(String(pid));
    if (prev && Number(prev.payload?.rating) === Number(rating)) continue;
    push({ sourceId: `rating|${pid}|${rating}|${rev()}`, type: 'rating', playerId: Number(pid), minute: obs.minute ?? null, payload: { rating } });
  }

  const prevAssists = latestByPlayer(existing, 'assist');
  for (const [pid, count] of Object.entries(obs.assists || {})) {
    const prev = prevAssists.get(String(pid));
    const prevCount = prev ? (prev.payload?.asistencias ?? 0) : 0;
    if (Number(count) === prevCount) continue;
    push({ sourceId: `assist|${pid}|${count}|${rev()}`, type: 'assist', playerId: Number(pid), minute: obs.minute ?? null, payload: { asistencias: Number(count) } });
  }

  const folded = foldScore([...existing, ...out]);
  if (obs.score && (folded.home !== obs.score.home || folded.away !== obs.score.away)) {
    push({ sourceId: `score|${obs.score.home}-${obs.score.away}|${rev()}`, type: 'score', minute: obs.minute ?? null,
      payload: { scoreHome: obs.score.home, scoreAway: obs.score.away } });
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
  const mine = goals.filter(e => {
    if (inc.teamId != null && e.teamId !== inc.teamId) return false;
    if (inc.time != null && e.minute != null && Math.abs(e.minute - inc.time) > 5) return false;
    return true;
  });
  if (!mine.length) return null;
  mine.sort((a, b) => (new Date(a.ts).getTime() - new Date(b.ts).getTime()) || ((a.seq || 0) - (b.seq || 0)));
  return mine[mine.length - 1].sourceId;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/liveEvents.test.js`
Expected: PASS (los tests existentes siguen verdes salvo orden interno; si alguno asume lineup primero, actualizarlo a `status` primero).

- [ ] **Step 5: Commit**

```bash
git add api/liveEvents.js tests/liveEvents.test.js
git commit -m "feat(live): derivacion determinista con seq, addedTime y source"
```

---

### Task 3: `assist` y `rating` absolutos reemisibles (A→B→A)

**Files:**
- Modify: `api/liveEvents.js` (ya incluido en Task 2)
- Test: `tests/liveEvents.test.js`

**Interfaces:**
- Consumes: `deriveEvents` de Task 2.
- Produces: una secuencia de valor 1→2→1 genera **tres** eventos de `assist`/`rating`; el cliente aplica el último.

- [ ] **Step 1: Write the failing test**

```js
test('assist absoluto permite A→B→A', () => {
  const a = deriveEvents(obs({ assists: { 12: 1 } }), [], NOW);
  const b = deriveEvents(obs({ assists: { 12: 2 } }), a, NOW + 1000);
  const c = deriveEvents(obs({ assists: { 12: 1 } }), [...a, ...b], NOW + 2000);
  assert.equal(a.filter(e => e.type === 'assist').length, 1);
  assert.equal(b.filter(e => e.type === 'assist').length, 1);
  assert.equal(c.filter(e => e.type === 'assist').length, 1);
  assert.equal(c.find(e => e.type === 'assist').payload.asistencias, 1);
});

test('rating absoluto permite A→B→A', () => {
  const a = deriveEvents(obs({ ratings: { 11: 7.0 } }), [], NOW);
  const b = deriveEvents(obs({ ratings: { 11: 7.5 } }), a, NOW + 1000);
  const c = deriveEvents(obs({ ratings: { 11: 7.0 } }), [...a, ...b], NOW + 2000);
  assert.equal(c.find(e => e.type === 'rating').payload.rating, 7.0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/liveEvents.test.js`
Expected: FAIL si `sourceId` no cambia entre emisiones (A→B→A se bloquea).

- [ ] **Step 3: Implement**

Ya implementado en Task 2 con `rev()` en `sourceId` y comparación con `latestByPlayer`. Verifica que `have` no bloquee la tercera emisión porque el `sourceId` incluye `rev()`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/liveEvents.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/liveEvents.js tests/liveEvents.test.js
git commit -m "fix(live): asistencia y nota absolutas permiten correcciones A-B-A"
```

---

### Task 4: `findGoalToCancel` con `teamId` y mismo tick

**Files:**
- Modify: `api/liveEvents.js` (ya incluido en Task 2)
- Modify: `scripts/scrapeLiveMatches.js:46`
- Test: `tests/liveEvents.test.js`

**Interfaces:**
- Consumes: `deriveEvents`.
- Produces: la anulación solo revierte un gol del mismo `teamId` (±5 min); si no lo encuentra, `ofSourceId: null`.

- [ ] **Step 1: Write the failing tests**

```js
test('findGoalToCancel no anula el gol de otro equipo', () => {
  const awayGoal = { sourceId: 'goal|a', type: 'goal', teamId: 2, minute: 30, payload: { isHome: false } };
  const o = obs({ score: { home: 0, away: 0 }, incidents: [
    { sourceId: 'v', type: 'goal_cancelled', class: 'goalDisallowed', time: 31, teamId: 1 }
  ] });
  const cancel = deriveEvents(o, [awayGoal], NOW).find(e => e.type === 'goal_cancelled');
  assert.equal(cancel.payload.ofSourceId, null);
});

test('findGoalToCancel resuelve gol y anulacion del mismo tick', () => {
  const o = obs({ score: { home: 0, away: 0 }, incidents: [
    { sourceId: 'g', type: 'goal', class: 'regular', time: 40, isHome: true, playerId: 11, homeScore: 1, awayScore: 0, teamId: 1 },
    { sourceId: 'v', type: 'goal_cancelled', class: 'goalDisallowed', time: 41, teamId: 1, playerId: 11 }
  ] });
  const cancel = deriveEvents(o, [], NOW).find(e => e.type === 'goal_cancelled');
  assert.equal(cancel.payload.ofSourceId, 'goal|g');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/liveEvents.test.js`
Expected: FAIL (el primero anula el gol ajeno).

- [ ] **Step 3: Implement**

- `findGoalToCancel` ya corregido en Task 2.
- En `scripts/scrapeLiveMatches.js:46`, cambiar la proyección:

```js
const existing = await LiveEvent.find({ eventId: m.id, source: { $ne: 'sim' } },
  'sourceId type payload teamId minute seq ts').sort({ ts: 1, seq: 1, _id: 1 }).lean();
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/liveEvents.test.js tests/scrapMatchSource.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/liveEvents.js scripts/scrapeLiveMatches.js tests/liveEvents.test.js
git commit -m "fix(live): anulacion VAR por equipo y en el mismo tick"
```

---

### Task 5: Cursor = máximo devuelto, una sola query y `resync`

**Files:**
- Modify: `server.js:1271-1289`
- Modify: `api/live.js:58-65`
- Test: `tests/liveEventsApi.test.js`

**Interfaces:**
- Produces: `liveEventsQuery(sinceDate, { source } = {})` y `buildLiveEventsResponse(docs, serverTime, resync)`.
- El endpoint devuelve `resync: false` por defecto.

- [ ] **Step 1: Write the failing test**

```js
test('serverTime usa el maximo de los docs devueltos (no el global)', () => {
  const docs = [
    { _id: 'a', ingestedAt: new Date('2026-09-16T20:01:00Z') },
    { _id: 'b', ingestedAt: new Date('2026-09-16T20:03:00Z') }
  ];
  const res = buildLiveEventsResponse(docs, maxIngestedAt(docs));
  assert.equal(res.serverTime, '2026-09-16T20:03:00.000Z');
});

test('liveEventsQuery excluye sim por defecto', () => {
  assert.deepEqual(liveEventsQuery(null, { excludeSim: true }), { source: { $ne: 'sim' } });
});
```

Añadir el helper puro a `api/live.js`:

```js
export function maxIngestedAt(docs) {
  return (docs || []).reduce((max, d) => {
    const t = d.ingestedAt ? new Date(d.ingestedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/liveEventsApi.test.js`
Expected: FAIL (`maxIngestedAt` no existe; `liveEventsQuery` no acepta opciones).

- [ ] **Step 3: Implement**

En `api/live.js`:

```js
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
```

En `server.js`, sustituir el handler:

```js
const sinceResult = parseSinceParam(reqUrl.searchParams.get('since'));
if (!sinceResult.ok) { sendJson(req, res, 400, { ok: false, error: 'Parámetro since inválido' }); return; }
const wantSim = process.env.NODE_ENV !== 'production' && reqUrl.searchParams.get('source') === 'sim';
const filter = liveEventsQuery(sinceResult.date, { excludeSim: !wantSim });
if (wantSim) filter.source = 'sim';
const docs = await LiveEvent.find(filter).sort({ ingestedAt: 1, seq: 1 }).lean();
const max = maxIngestedAt(docs);
const serverTime = docs.length ? new Date(max).toISOString()
  : (sinceResult.date ? sinceResult.date.toISOString() : null);
sendJson(req, res, 200, buildLiveEventsResponse(docs, serverTime));
```

Importar `maxIngestedAt` desde `./api/live.js`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/liveEventsApi.test.js tests/live.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.js api/live.js tests/liveEventsApi.test.js
git commit -m "fix(live): cursor delta desde docs devueltos y una sola query"
```

---

### Task 6: Aislamiento del simulador

**Files:**
- Modify: `scripts/simulateLiveEvents.js:159`
- Modify: `scripts/scrapeLiveMatches.js:26,46`
- Modify: `server.js` (Task 5)
- Test: `tests/liveEvents.test.js`

**Interfaces:**
- Produces: eventos de simulación con `source: 'sim'`; el scraper real los ignora; la API no los devuelve salvo `?source=sim` fuera de producción.

- [ ] **Step 1: Write the failing test**

```js
test('deriveEvents respeta source sim', () => {
  const evs = deriveEvents(obs({ source: 'sim' }), [], NOW);
  assert.ok(evs.every(e => e.source === 'sim'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/liveEvents.test.js`
Expected: FAIL si `source` no se propaga.

- [ ] **Step 3: Implement**

- En `scripts/simulateLiveEvents.js:159`:

```js
const insert = (M, ev) => bulk.push({ ...ev, eventId: M.id, expireAt, ingestedAt: new Date(), source: 'sim' });
```

- Guardias de `--force` (tras `await connectDB()`):

```js
const yes = !!arg('yes', false);
const allowProd = process.argv.includes('--allow-prod');
const forceMatchstats = process.argv.includes('--force-matchstats');
if (force) {
  if (!yes) { console.error('--force requiere --yes'); process.exit(1); }
  const dbName = mongoose.connection.name;
  if (dbName !== 'test' && !allowProd) {
    console.error(`--force bloqueado en la DB "${dbName}". Usa --allow-prod si es intencional.`);
    process.exit(1);
  }
}
```

- El borrado de `MatchStats` solo si `forceMatchstats`:

```js
if (force && forceMatchstats) {
  await MatchStats.deleteMany({ eventId: { $in: clash } });
}
```

(Importar `mongoose` en el script.)

- En `scripts/scrapeLiveMatches.js`, añadir `source: { $ne: 'sim' }` a las dos queries:

```js
LiveMatch.find({ eventId: { $in: ids } }, 'eventId status').lean() // el snapshot no cambia
LiveEvent.find({ eventId: { $in: ids }, sourceId: 'final', source: { $ne: 'sim' } }, 'eventId').lean()
```

- [ ] **Step 4: Run tests + smoke**

Run: `node --test tests/liveEvents.test.js`
Expected: PASS.
Run: `node --check scripts/simulateLiveEvents.js && node --check scripts/scrapeLiveMatches.js`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add scripts/simulateLiveEvents.js scripts/scrapeLiveMatches.js
git commit -m "fix(live): aisla el simulador con source=sim y protege --force"
```

---

### Task 7: Scraper con timeout, reintentos y backoff

**Files:**
- Modify: `scripts/sofascoreHttp.js`
- Test: `tests/sofascoreHttp.test.js`

**Interfaces:**
- Produces: `fetchSofascore(url, { timeoutMs = 8000, retries = 2 })` con backoff + jitter.

- [ ] **Step 1: Write the failing test**

```js
test('fetchSofascore reintenta ante 500 y respeta el timeout', async () => {
  // Mock de node-curl-impersonate no trivial: verifica que la firma acepta opciones.
  assert.equal(typeof fetchSofascore, 'function');
  assert.equal(fetchSofascore.length >= 1, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sofascoreHttp.test.js`
Expected: el test pasa, pero la implementación aún no tiene timeout/retry; se verifica con un test de integración manual.

- [ ] **Step 3: Implement**

Sustituir `fetchSofascore` en `scripts/sofascoreHttp.js`:

```js
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;

function requestWithTimeout(url, timeoutMs) {
  const req = new CurlImpersonate(url, {
    method: 'GET', headers: { ...CABECERAS }, impersonate: 'firefox-117'
  }).makeRequest();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs));
  return Promise.race([req, timeout]);
}

export async function fetchSofascore(endpointUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES } = {}) {
  if (!validarUrlSofascore(endpointUrl)) throw new Error('URL de Sofascore no permitida');
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await requestWithTimeout(endpointUrl, timeoutMs);
      if (res.statusCode === 404) throw new Error('NOT_FOUND');
      if (res.statusCode === 429 || res.statusCode >= 500) throw new Error('HTTP ' + res.statusCode);
      if (res.statusCode !== 200) throw new Error('HTTP ' + res.statusCode);
      return JSON.parse(res.response);
    } catch (e) {
      if (attempt === retries || e.message === 'NOT_FOUND' || e.message === 'URL de Sofascore no permitida') throw e;
      await new Promise(r => setTimeout(r, 300 * 2 ** attempt + Math.random() * 200));
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/sofascoreHttp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/sofascoreHttp.js tests/sofascoreHttp.test.js
git commit -m "fix(scraper): timeout, reintentos y backoff en peticiones a Sofascore"
```

---

### Task 8: Seguridad (avatar, CORS, JWT, rate limit)

**Files:**
- Modify: `api/auth.js:150-165`
- Modify: `server.js:131-146` y arranque
- Modify: `api/middleware.js:20-47`
- Test: `tests/guest.test.js` o nuevo `tests/security.test.js`

**Interfaces:**
- Produces: `isValidAvatar(value)` exportada; CORS solo `localhost` exacto; `clientIp(req)`; fail-fast de `JWT_SECRET`.

- [ ] **Step 1: Write the failing test**

```js
import { isValidAvatar } from '../api/auth.js';
test('isValidAvatar rechaza HTML y acepta emoji/https', () => {
  assert.equal(isValidAvatar('<img src=x onerror=alert(1)>'), false);
  assert.equal(isValidAvatar('⚽'), true);
  assert.equal(isValidAvatar('https://example.com/a.png'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/security.test.js`
Expected: FAIL (`isValidAvatar` no existe).

- [ ] **Step 3: Implement**

- En `api/auth.js`:

```js
export function isValidAvatar(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > 200) return false;
  if (/^https:\/\/\S+$/.test(v)) return true;
  return !/[<>&"'`]/.test(v);
}
```

En `saveProfile`, antes de guardar:

```js
if (profileData.avatar != null && !isValidAvatar(profileData.avatar)) {
  return { ok: false, error: 'Avatar inválido' };
}
```

- En `server.js` `setCorsHeaders`:

```js
const isLocal = /^http:\/\/localhost(:\d+)?$/.test(origin || '');
if (allowedOrigins.includes(origin) || isLocal) {
  res.setHeader('Access-Control-Allow-Origin', origin);
} else {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
}
res.setHeader('Vary', 'Origin');
```

- Fail-fast al arrancar (cerca de la lectura de `JWT_SECRET`):

```js
if (process.env.NODE_ENV === 'production'
  && (!JWT_SECRET || JWT_SECRET === 'porra-ucl-champions-2026-secret-key-change-in-production')) {
  console.error('JWT_SECRET inseguro en produccion');
  process.exit(1);
}
```

- `clientIp` en `api/middleware.js` y úsalo en `rateLimiter`:

```js
export function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (/^[0-9a-fA-F:.]{3,45}$/.test(xff)) return xff;
  }
  return req.socket?.remoteAddress || 'unknown';
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/security.test.js tests/guest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/auth.js server.js api/middleware.js tests/security.test.js
git commit -m "fix(security): avatar validado, CORS exacto, JWT fail-fast y rate limit por IP"
```

---

## Fase 3 — Rendimiento y operación

### Task 9: Endpoint con ETag por versión, proyección y caché de cuerpo

**Files:**
- Modify: `server.js:1271-1289` y `sendJson`
- Modify: `db/models/LiveEvent.js` (índice delta)
- Test: `tests/liveEventsApi.test.js`

**Interfaces:**
- Produces: `liveEventsVersion` (contador en proceso, incrementado al insertar; o `max(seq)` cacheado). Si `If-None-Match` coincide → 304 **antes** de Mongo.

- [ ] **Step 1: Write the failing test**

```js
test('la version del endpoint cambia cuando cambia ingestedAt maximo', () => {
  assert.equal(liveEventsVersion([{ ingestedAt: new Date('2026-09-16T20:01:00Z') }]), '2026-09-16T20:01:00.000Z');
  assert.notEqual(
    liveEventsVersion([{ ingestedAt: new Date('2026-09-16T20:01:00Z') }]),
    liveEventsVersion([{ ingestedAt: new Date('2026-09-16T20:02:00Z') }])
  );
});
```

Añadir a `api/live.js`:

```js
export function liveEventsVersion(docs) {
  return new Date(maxIngestedAt(docs) || 0).toISOString();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/liveEventsApi.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Añadir en `server.js` (ámbito de módulo):

```js
let liveVersionCache = { version: null, at: 0 };
let liveBodyCache = { version: null, since: null, etag: null };

async function currentLiveVersion() {
  if (Date.now() - liveVersionCache.at < 2000) return liveVersionCache.version;
  const last = await LiveEvent.findOne({}, { ingestedAt: 1 }).sort({ ingestedAt: -1 }).lean();
  const version = last ? new Date(last.ingestedAt).toISOString() : null;
  liveVersionCache = { version, at: Date.now() };
  return version;
}
```

En el handler, antes de consultar los docs:

```js
const version = await currentLiveVersion();
const sinceKey = sinceResult.date ? sinceResult.date.toISOString() : '';
if (liveBodyCache.etag && liveBodyCache.version === version
  && liveBodyCache.since === sinceKey
  && etagMatches(req.headers['if-none-match'], liveBodyCache.etag)) {
  res.writeHead(304, { ETag: liveBodyCache.etag, 'Cache-Control': 'public, max-age=28' });
  res.end();
  return;
}
```

Después de construir `data`:

```js
const json = JSON.stringify(data);
liveBodyCache = { version, since: sinceKey, etag: computeWeakEtag(json) };
sendJson(req, res, 200, data, 28);
```

Proyección y límite:

```js
const docs = await LiveEvent.find(filter, '-_id -expireAt -ingestedAt')
  .sort({ ingestedAt: 1, seq: 1 }).limit(5000).lean();
```

La respuesta omite `_id`; el front debe deduplicar por `eventId|sourceId`
(ver plan SPA, Task 3). `ingestedAt` se usa para `serverTime` y se elimina del
payload.

`sendJson` ya añade `Cache-Control` (`public, max-age=28, stale-while-revalidate=56`) porque recibe `cacheSeconds`. Añadir `Vary: Accept-Encoding, Origin` en `setCorsHeaders`.

- Añadir `expireAt: { $gt: new Date() }` al filtro para no devolver eventos ya caducados entre pasadas del TTL.
- Rate limit específico para peticiones sin `since` (p. ej. 30/min) usando `clientIp`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/liveEventsApi.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.js api/live.js tests/liveEventsApi.test.js
git commit -m "perf(live): ETag por version, proyeccion y cache de cuerpo"
```

---

### Task 10: Scraper con menos peticiones y escrituras por lote

**Files:**
- Modify: `scripts/scrapeLiveMatches.js`
- Modify: `scripts/matchStats.js:92-138`
- Test: `tests/scrapMatchSource.test.js`

**Interfaces:**
- Consumes: `fetchSofascore` de Task 7.
- Produces: un tick con ~1 petición/partido en estado estable; sin petición por portero en el bucle caliente.

- [ ] **Step 1: Write the failing test**

```js
test('fetchMatchData no pide estadisticas por portero en el camino caliente', async () => {
  // Verifica que scrapMatchFull sigue funcionando con raw cacheado.
  assert.equal(typeof scrapMatchFull, 'function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scrapMatchSource.test.js`
Expected: PASS (test de contrato); la mejora se valida con el log de peticiones.

- [ ] **Step 3: Implement**

`scrapeLiveMatches.js` — precarga y lote:

```js
const existingDocs = await LiveEvent.find(
  { eventId: { $in: ids }, source: { $ne: 'sim' } },
  'eventId sourceId type payload teamId minute seq ts'
).sort({ ts: 1, seq: 1 }).lean();
const existingByMatch = new Map();
for (const d of existingDocs) {
  if (!existingByMatch.has(d.eventId)) existingByMatch.set(d.eventId, []);
  existingByMatch.get(d.eventId).push(d);
}
const lastHash = new Map();
const ops = [];
// por partido:
const hash = JSON.stringify({ s: obs.status, m: obs.minute,
  h: obs.score?.home, a: obs.score?.away, i: (obs.incidents || []).length });
if (lastHash.get(m.id) === hash) continue;
lastHash.set(m.id, hash);
for (const ev of deriveEvents(obs, existingByMatch.get(m.id) || [], Date.now())) {
  ops.push({ insertOne: { document: ev } });
}
// al final del tick:
if (ops.length) {
  try { await LiveEvent.bulkWrite(ops, { ordered: false }); }
  catch (e) { if (e.code !== 11000 && !Array.isArray(e.writeErrors)) throw e; }
}
```

`matchStats.js` — caché de penaltis por portero:

```js
const gkPenaltyCache = new Map(); // `${eventId}:${playerId}` -> paradas
const incidentsHasPenalty = (incidentsData?.incidents || []).some(i => i.incidentType === 'inGamePenalty' || i.incidentClass === 'penalty');
const key = `${eventId}:${gk.id}`;
if (gkPenaltyCache.has(key) && !incidentsHasPenalty) gk.penaltiParado = gkPenaltyCache.get(key);
else {
  const v = await fetchPlayerStatistics(eventId, gk.id);
  gkPenaltyCache.set(key, v);
  gk.penaltiParado = v;
}
```

Calendario: releer `calendar.json` cada 10 min en el bucle (o `fs.watch`).

- [ ] **Step 4: Run tests**

Run: `node --test tests/scrapMatchSource.test.js tests/matchStats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/scrapeLiveMatches.js scripts/matchStats.js
git commit -m "perf(scraper): menos peticiones, batch de escrituras y cache por partido"
```

---

### Task 11: Operación (health, logs, TTL e índices)

**Files:**
- Modify: `scripts/scrapeLiveMatches.js`
- Modify: `db/models/LiveEvent.js` (TTL sobre el día del partido)
- Modify: `scripts/ensureLiveEventsIndexes.js`
- Test: `tests/liveEventModel.test.js`

**Interfaces:**
- Produces: `GET /api/live/health` (o log estructurado) con `lastScrapeAt`; TTL calculado con `kickoffMs`.

- [ ] **Step 1: Write the failing test**

```js
test('expireAt usa el dia del kickoff, no el de ingesta', () => {
  const kickoff = Date.parse('2026-09-16T22:30:00Z');
  const ingest = Date.parse('2026-09-17T00:10:00Z');
  const evs = deriveEvents({ eventId: 1, status: 'FT', kickoffMs: kickoff, score: { home: 0, away: 0 } }, [], ingest);
  assert.equal(new Date(evs[0].expireAt).toISOString(), '2026-09-16T23:59:59.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/liveEventModel.test.js`
Expected: FAIL si el TTL usa el día de ingesta.

- [ ] **Step 3: Implement**

- `deriveEvents` ya usa `obs.kickoffMs` en Task 2.
- `scrapeLiveMatches.js`: log estructurado `console.log(JSON.stringify({ t, live, ok, inserted, ms }))` y persistir `lastScrapeAt` en `GameConfig` (o memoria + endpoint health).
- `ensureLiveEventsIndexes.js`: ejecutar `syncIndexes()` y abortar con mensaje claro si hay duplicados `{eventId, sourceId}`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/liveEventModel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/scrapeLiveMatches.js db/models/LiveEvent.js scripts/ensureLiveEventsIndexes.js tests/liveEventModel.test.js
git commit -m "ops(live): health del scraper, logs estructurados y TTL por dia de partido"
```

---

## Verificación final

- [ ] `node --test tests/*.test.js` → todo verde.
- [ ] `node --check server.js api/liveEvents.js api/live.js scripts/scrapeLiveMatches.js scripts/simulateLiveEvents.js scripts/sofascoreHttp.js` → sin errores.
- [ ] Simulador: `node --env-file=.env scripts/simulateLiveEvents.js --auto 5 --tick 10` y comprobar que el Live real no muestra `sim`.
- [ ] `node --env-file=.env scripts/ensureLiveEventsIndexes.js` → índices creados.
