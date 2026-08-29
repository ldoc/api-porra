# Rendimiento y reducción de tráfico (B1+B2+F1+F2) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir >90% los bytes transferidos en uso habitual mediante ETag/304 + deltas (`since`) en la API (B1+B2) y SWR con localStorage + eliminación de cache-busters en la SPA (F1+F2).

**Architecture:** Backend: `sendJson()` calcula ETag débil SHA-1 sobre el JSON sin comprimir y responde 304 ante `If-None-Match`; `GET /api/match-stats` acepta `?since=` filtrando por `lastUpdated`. Frontend: nuevo módulo puro `js/cacheStore.js` (localStorage versionado + merge idempotente de deltas); `fetchMatchStats()` y `fetchAllPredictions()` pintan desde localStorage antes de revalidar. Todo aditivo y tolerante a desfases de despliegue.

**Tech Stack:** Node.js nativo (`http`, `crypto`, ES Modules), Mongoose/MongoDB Atlas, Vanilla JS ES6+ (SPA sin build step), `node:test`.

## Global Constraints

- **Prioridad absoluta: no romper nada.** Cambios aditivos; contratos existentes intactos cuando no hay `since`.
- **Despliegue en Vercel (serverless)**: prohibido asumir proceso long-lived (sin memoria compartida entre requests ni timers). Solo `crypto`/`zlib` nativos. No tocar `vercel.json` (ninguno de los cambios lo requiere).
- Orden de despliegue irrelevante: el frontend viejo funciona con backend nuevo (ignora `serverTime`) y el frontend nuevo funciona con backend viejo (`since` ignorado → respuesta completa → merge idempotente).
- Tests: `node --test tests/*.test.js` (glob, NO pasar el directorio: falla en este entorno).
  - Baseline api-porra: 20 tests / 0 fallos. Baseline porra-spa: 23 ficheros / 0 fallos.
- Cache-busting obligatorio (AGENTS.md de porra-spa): al tocar `js/main.js`, incrementar `?v=` en `index.html`.
- Sin comentarios en el código nuevo salvo JSDoc breve siguiendo el estilo existente del fichero.
- Commits frecuentes, uno por tarea, estilo conventional commits en español como el histórico (`feat:`, `fix:`, `docs:`, `test:`).

**Repositorios:** `api-porra` (rama `feat/rendimiento-cache` desde `master`) y `porra-spa` (rama `feat/rendimiento-cache` desde `main`). Rutas absolutas usadas por las tareas: `/home/ldoc/Proyectos/api-porra` y `/home/ldoc/Proyectos/porra-spa`.

---

### Task 0: Crear ramas de trabajo

**Files:** ninguno (solo git).

- [ ] **Step 1: Crear rama en api-porra**

```bash
cd /home/ldoc/Proyectos/api-porra && git checkout -b feat/rendimiento-cache master
```

Expected: `Switched to a new branch 'feat/rendimiento-cache'`

- [ ] **Step 2: Crear rama en porra-spa**

```bash
cd /home/ldoc/Proyectos/porra-spa && git checkout -b feat/rendimiento-cache main
```

Expected: `Switched to a new branch 'feat/rendimiento-cache'`

---

### Task 1 (api-porra): Módulo ETag puro + tests

**Files:**
- Create: `api/etag.js`
- Test: `tests/etag.test.js`

**Interfaces:**
- Consumes: nada (módulo hoja, solo `crypto` nativo).
- Produces: `computeWeakEtag(jsonString: string): string` → `W/"<sha1-hex-40>"`; `etagMatches(ifNoneMatchHeader: string|undefined, etag: string): boolean`. Usados por Task 2.

- [ ] **Step 1: Escribir el test fallido**

Crear `tests/etag.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWeakEtag, etagMatches } from '../api/etag.js';

test('computeWeakEtag es determinista y tiene formato débil', () => {
  const json = JSON.stringify({ ok: true });
  assert.equal(computeWeakEtag(json), computeWeakEtag(json));
  assert.match(computeWeakEtag(json), /^W\/"[0-9a-f]{40}"$/);
});

test('computeWeakEtag distingue payloads distintos', () => {
  assert.notEqual(computeWeakEtag('{"a":1}'), computeWeakEtag('{"a":2}'));
});

test('etagMatches acepta el mismo etag débil', () => {
  assert.equal(etagMatches('W/"abc"', 'W/"abc"'), true);
});

test('etagMatches compara débilmente (con y sin prefijo W/)', () => {
  assert.equal(etagMatches('"abc"', 'W/"abc"'), true);
  assert.equal(etagMatches('W/"abc"', '"abc"'), true);
});

test('etagMatches acepta listas de etags separadas por comas', () => {
  assert.equal(etagMatches('W/"x1", W/"abc"', 'W/"abc"'), true);
});

test('etagMatches acepta el comodín *', () => {
  assert.equal(etagMatches('*', 'W/"abc"'), true);
});

test('etagMatches rechaza etags distintos', () => {
  assert.equal(etagMatches('W/"zzz"', 'W/"abc"'), false);
});

test('etagMatches devuelve false sin cabecera', () => {
  assert.equal(etagMatches(undefined, 'W/"abc"'), false);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que FALLA**

Run: `cd /home/ldoc/Proyectos/api-porra && node --test tests/etag.test.js`
Expected: FAIL — `Cannot find module '/home/ldoc/Proyectos/api-porra/api/etag.js'`

- [ ] **Step 3: Implementación mínima**

Crear `api/etag.js`:

```js
import crypto from 'crypto';

/**
 * Calcula un ETag débil (W/"sha1") a partir del string JSON ya serializado.
 * Se calcula sobre el JSON SIN comprimir para ser independiente del transporte.
 */
export function computeWeakEtag(jsonString) {
  const hash = crypto.createHash('sha1').update(jsonString, 'utf8').digest('hex');
  return `W/"${hash}"`;
}

/**
 * Compara la cabecera If-None-Match con el ETag del recurso (comparación débil).
 * Acepta listas separadas por comas, valores con/sin prefijo W/ y '*'.
 */
export function etagMatches(ifNoneMatchHeader, etag) {
  if (!ifNoneMatchHeader) return false;
  const normalizedEtag = etag.replace(/^W\//, '');
  return ifNoneMatchHeader
    .split(',')
    .map(candidate => candidate.trim().replace(/^W\//, ''))
    .some(candidate => candidate === '*' || candidate === normalizedEtag);
}
```

- [ ] **Step 4: Ejecutar el test y verificar que PASA**

Run: `cd /home/ldoc/Proyectos/api-porra && node --test tests/etag.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Verificar baseline completa**

Run: `cd /home/ldoc/Proyectos/api-porra && node --test tests/*.test.js`
Expected: 28 tests (20 + 8), 0 fallos

- [ ] **Step 6: Commit**

```bash
cd /home/ldoc/Proyectos/api-porra && git add api/etag.js tests/etag.test.js && git commit -m "feat: modulo ETag debil con comparacion If-None-Match"
```

---

### Task 2 (api-porra): ETag + 304 en sendJson()

**Files:**
- Modify: `server.js:261-286` (función `sendJson`)
- Modify: `server.js:16` (zona de imports)

**Interfaces:**
- Consumes: `computeWeakEtag`, `etagMatches` de `api/etag.js` (Task 1).
- Produces: todos los `sendJson` GET con status 200 devuelven cabecera `ETag: W/"..."` y responden `304` sin cuerpo si `If-None-Match` coincide. POST/PUT/DELETE y errores 4xx/5xx sin ETag.

- [ ] **Step 1: Añadir el import en server.js**

En `server.js`, tras la línea 16 (`import { validateFasesFechas } ...`), añadir:

```js
import { computeWeakEtag, etagMatches } from './api/etag.js';
```

- [ ] **Step 2: Modificar sendJson**

Reemplazar la función `sendJson` (líneas 261-286) por:

```js
function sendJson(req, res, statusCode, data, cacheSeconds) {
  const json = JSON.stringify(data);
  const baseHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
  if (cacheSeconds) {
    baseHeaders['Cache-Control'] = `public, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
  }
  if (statusCode === 200 && req?.method === 'GET') {
    const etag = computeWeakEtag(json);
    baseHeaders['ETag'] = etag;
    if (etagMatches(req.headers['if-none-match'], etag)) {
      res.writeHead(304, baseHeaders);
      res.end();
      return;
    }
  }
  const acceptEncoding = req?.headers?.['accept-encoding'] || '';
  if (acceptEncoding.includes('gzip') && json.length > 1024) {
    zlib.gzip(json, (err, compressed) => {
      if (err) {
        res.writeHead(statusCode, baseHeaders);
        res.end(json);
        return;
      }
      res.writeHead(statusCode, {
        ...baseHeaders,
        'Content-Encoding': 'gzip',
        'Content-Length': compressed.length
      });
      res.end(compressed);
    });
  } else {
    res.writeHead(statusCode, baseHeaders);
    res.end(json);
  }
}
```

Notas de diseño:
- El ETag se calcula ANTES de decidir compresión → mismo ETag con o sin gzip (requisito del spec B1).
- La rama 304 responde inmediatamente sin comprimir (no hay cuerpo).
- Solo GET 200 llevan ETag; rate-limits (429), errores y mutaciones quedan intactos.
- Vercel comprime en el edge; el hash pre-compresión hace el ETag estable en local y producción.

- [ ] **Step 3: Verificación sintáctica y suite completa**

Run: `cd /home/ldoc/Proyectos/api-porra && node --check server.js && node --test tests/*.test.js`
Expected: sin salida de `--check` (OK), 28 tests, 0 fallos

- [ ] **Step 4: Verificación manual con curl (opcional, requiere Mongo local en .env)**

```bash
cd /home/ldoc/Proyectos/api-porra && (npm start &) && sleep 3 \
&& ETAG=$(curl -si http://localhost:3000/api/config | grep -i '^etag:' | cut -d' ' -f2 | tr -d '\r') \
&& echo "ETag: $ETAG" \
&& curl -si -H "If-None-Match: $ETAG" http://localhost:3000/api/config | head -1
```

Expected: primera respuesta `HTTP/1.1 200 OK` con cabecera `ETag: W/"..."`; segunda petición `HTTP/1.1 304`. Parar el servidor después (`pkill -f "node server.js"`). Si no hay Mongo disponible, omitir y verificar en producción tras desplegar.

- [ ] **Step 5: Commit**

```bash
cd /home/ldoc/Proyectos/api-porra && git add server.js && git commit -m "feat: ETag debil y 304 en sendJson para GET 200"
```

---

### Task 3 (api-porra): Delta `since` en GET /api/match-stats

**Files:**
- Create: `api/matchStatsFilter.js`
- Modify: `server.js:1036-1046` (handler `GET /api/match-stats`) e import (zona líneas 12-17)
- Modify: `db/models/MatchStats.js` (índice en `lastUpdated`)
- Test: `tests/matchStatsFilter.test.js`

**Interfaces:**
- Consumes: nada (helper puro).
- Produces: `parseSinceParam(raw: string|null): { ok: true, date: Date|null } | { ok: false }`. Respuesta del endpoint gana campo aditivo `serverTime` (ISO string). Sin `since` → comportamiento idéntico al actual (scripts/admin no se rompen).

- [ ] **Step 1: Escribir el test fallido**

Crear `tests/matchStatsFilter.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSinceParam } from '../api/matchStatsFilter.js';

test('acepta ausencia de since', () => {
  assert.deepEqual(parseSinceParam(null), { ok: true, date: null });
});

test('acepta since vacio', () => {
  assert.deepEqual(parseSinceParam(''), { ok: true, date: null });
});

test('acepta fecha ISO valida', () => {
  const result = parseSinceParam('2026-08-21T17:21:56.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.date.toISOString(), '2026-08-21T17:21:56.000Z');
});

test('rechaza valor no fecha', () => {
  assert.deepEqual(parseSinceParam('ayer'), { ok: false });
});

test('rechaza timestamp numerico crudo', () => {
  assert.deepEqual(parseSinceParam('1756000000000'), { ok: false });
});
```

Nota: `new Date('1756000000000')` es inválido en JS (los epoch ms numéricos no son parseables como string ISO), así que se rechaza — el cliente SIEMPRE envía `serverTime` ISO del backend (spec §7: nunca `Date.now()` del cliente).

- [ ] **Step 2: Ejecutar el test y verificar que FALLA**

Run: `cd /home/ldoc/Proyectos/api-porra && node --test tests/matchStatsFilter.test.js`
Expected: FAIL — `Cannot find module .../api/matchStatsFilter.js`

- [ ] **Step 3: Implementación mínima**

Crear `api/matchStatsFilter.js`:

```js
/**
 * Parsea el query param `since` de GET /api/match-stats.
 * Devuelve { ok: true, date } con date como Date|null,
 * o { ok: false } si el valor presente no es una fecha valida.
 */
export function parseSinceParam(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, date: null };
  const date = new Date(raw);
  if (isNaN(date.getTime())) return { ok: false };
  return { ok: true, date };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que PASA**

Run: `cd /home/ldoc/Proyectos/api-porra && node --test tests/matchStatsFilter.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Índice en el modelo MatchStats**

En `db/models/MatchStats.js`, cambiar el campo `lastUpdated` (líneas 14-17) por:

```js
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: -1
  }
```

(Colección pequeña; Mongoose crea el índice al arrancar. Serverless-safe.)

- [ ] **Step 6: Modificar el handler en server.js**

Añadir import junto a los demás (después del import de `etag.js` de Task 2):

```js
import { parseSinceParam } from './api/matchStatsFilter.js';
```

Reemplazar el handler (líneas 1036-1046):

```js
  // Endpoint: Obtener todos los matchstats
  if (reqUrl.pathname === '/api/match-stats' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    try {
      const sinceResult = parseSinceParam(reqUrl.searchParams.get('since'));
      if (!sinceResult.ok) {
        sendJson(req, res, 400, { ok: false, error: 'Parámetro since inválido' });
        return;
      }
      const filter = sinceResult.date ? { lastUpdated: { $gt: sinceResult.date } } : {};
      const matchStats = await MatchStats.find(filter);
      sendJson(req, res, 200, { ok: true, matchStats, serverTime: new Date().toISOString() });
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al obtener estadísticas' });
    }
    return;
  }
```

Notas:
- `serverTime` SIEMPRE presente (campo aditivo; clientes viejos lo ignoran).
- El filtro usa `$gt` estricto: un partido actualizado exactamente en `serverTime` se recogería en el siguiente delta por resolución de milisegundos de ISO (idempotente en cliente de todas formas).
- Sin `since`: `find({})` igual que hoy.

- [ ] **Step 7: Suite completa**

Run: `cd /home/ldoc/Proyectos/api-porra && node --check server.js && node --test tests/*.test.js`
Expected: 33 tests, 0 fallos

- [ ] **Step 8: Commit**

```bash
cd /home/ldoc/Proyectos/api-porra && git add api/matchStatsFilter.js db/models/MatchStats.js server.js tests/matchStatsFilter.test.js && git commit -m "feat: delta since en GET /api/match-stats con serverTime e indice lastUpdated"
```

---

### Task 4 (porra-spa): Módulo cacheStore.js + tests

**Files:**
- Create: `js/cacheStore.js`
- Test: `tests/cacheStore.test.js`

**Interfaces:**
- Consumes: `window.localStorage`.
- Produces (global `window.porraCache` + `module.exports`):
  - `KEYS.matchstats` = `'porra_cache_matchstats_v1'`
  - `predKey(username)` → `'porra_cache_predall_v1_<username>'` (clave por usuario: evita servir datos de un usuario a otro en el mismo navegador durante fases PRE)
  - `cacheGet(key)` → `{ payload, serverTime } | null` (null si corrupto/ausente)
  - `cacheSet(key, payload, serverTime)` → boolean (false si supera ~2 MB o cuota; reintenta purgando claves propias)
  - `cacheRemove(key)` → void
  - `clearPorraCaches()` → void (borra SOLO claves `porra_cache_*`)
  - `mergeMatchStats(current, delta)` → array fusionado por `eventId` (delta sobreescribe; nuevos al final; idempotente)

- [ ] **Step 1: Escribir el test fallido**

Crear `tests/cacheStore.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this._map = new Map(); }
  getItem(k) { return this._map.has(k) ? this._map.get(k) : null; }
  setItem(k, v) { this._map.set(k, String(v)); }
  removeItem(k) { this._map.delete(k); }
  key(i) { return Array.from(this._map.keys())[i] ?? null; }
  get length() { return this._map.size; }
}
globalThis.localStorage = new MemoryStorage();

import { KEYS, predKey, cacheGet, cacheSet, cacheRemove, clearPorraCaches, mergeMatchStats } from '../js/cacheStore.js';

test('predKey versiona por usuario', () => {
  assert.equal(predKey('ana'), 'porra_cache_predall_v1_ana');
});

test('cacheSet/cacheGet roundtrip con serverTime', () => {
  assert.equal(cacheSet(KEYS.matchstats, { matchStats: [{ eventId: 9 }] }, '2026-08-25T00:00:00Z'), true);
  const got = cacheGet(KEYS.matchstats);
  assert.equal(got.serverTime, '2026-08-25T00:00:00Z');
  assert.deepEqual(got.payload.matchStats, [{ eventId: 9 }]);
});

test('cacheGet devuelve null con datos corruptos', () => {
  localStorage.setItem(predKey('pepe'), '{corrupto');
  assert.equal(cacheGet(predKey('pepe')), null);
});

test('cacheGet devuelve null si no existe la clave', () => {
  assert.equal(cacheGet(predKey('nadie')), null);
});

test('cacheRemove elimina la clave', () => {
  cacheSet(KEYS.matchstats, {}, null);
  cacheRemove(KEYS.matchstats);
  assert.equal(cacheGet(KEYS.matchstats), null);
});

test('cacheSet rechaza payloads mayores de 2MB', () => {
  const grande = { blob: 'x'.repeat(3 * 1024 * 1024) };
  assert.equal(cacheSet(predKey('gordo'), grande, null), false);
});

test('clearPorraCaches borra solo las claves propias', () => {
  cacheSet(KEYS.matchstats, {}, null);
  cacheSet(predKey('ana'), {}, null);
  localStorage.setItem('session_token', 't');
  localStorage.setItem('porra_ucl_user', '{}');
  clearPorraCaches();
  assert.equal(cacheGet(KEYS.matchstats), null);
  assert.equal(cacheGet(predKey('ana')), null);
  assert.equal(localStorage.getItem('session_token'), 't');
  assert.equal(localStorage.getItem('porra_ucl_user'), '{}');
});

test('mergeMatchStats añade partidos nuevos al final', () => {
  const merged = mergeMatchStats([{ eventId: 1, stats: {} }], [{ eventId: 2, stats: {} }]);
  assert.deepEqual(merged.map(m => m.eventId), [1, 2]);
});

test('mergeMatchStats sobreescribe por eventId manteniendo posicion', () => {
  const merged = mergeMatchStats(
    [{ eventId: 1, stats: { goles: 0 } }, { eventId: 2, stats: {} }],
    [{ eventId: 1, stats: { goles: 3 } }]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].stats.goles, 3);
  assert.equal(merged[1].eventId, 2);
});

test('mergeMatchStats es idempotente con delta completo', () => {
  const completo = [{ eventId: 1, stats: { goles: 1 } }, { eventId: 2, stats: { goles: 2 } }];
  const una = mergeMatchStats([], completo);
  const dos = mergeMatchStats(una, completo);
  assert.deepEqual(dos, una);
});

test('mergeMatchStats tolera current/delta ausentes', () => {
  assert.deepEqual(mergeMatchStats(null, []), []);
  assert.deepEqual(mergeMatchStats([], undefined), []);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que FALLA**

Run: `cd /home/ldoc/Proyectos/porra-spa && node --test tests/cacheStore.test.js`
Expected: FAIL — `Cannot find module '/home/ldoc/Proyectos/porra-spa/js/cacheStore.js'`

- [ ] **Step 3: Implementación mínima**

Crear `js/cacheStore.js` (patrón IIFE idéntico a `js/apiData.js`):

```js
(function (global) {
  const KEYS = {
    matchstats: 'porra_cache_matchstats_v1'
  };
  const PREDALL_PREFIX = 'porra_cache_predall_v1_';
  const MAX_BYTES = 2 * 1024 * 1024;

  function predKey(username) {
    return `${PREDALL_PREFIX}${username}`;
  }

  function serialize(payload, serverTime) {
    return JSON.stringify({ payload, serverTime: serverTime || null });
  }

  function cacheGet(key) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !('payload' in parsed)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function cacheSet(key, payload, serverTime) {
    try {
      const wrapped = serialize(payload, serverTime);
      if (wrapped.length > MAX_BYTES) return false;
      global.localStorage.setItem(key, wrapped);
      return true;
    } catch (e) {
      try {
        clearPorraCaches();
        const wrapped = serialize(payload, serverTime);
        if (wrapped.length <= MAX_BYTES) {
          global.localStorage.setItem(key, wrapped);
          return true;
        }
      } catch (e2) {
        // Cuota insuperable: seguir sin cache
      }
      return false;
    }
  }

  function cacheRemove(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (e) {
      // noop
    }
  }

  function clearPorraCaches() {
    try {
      const toRemove = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const k = global.localStorage.key(i);
        if (k && (k === KEYS.matchstats || k.indexOf(PREDALL_PREFIX) === 0)) toRemove.push(k);
      }
      toRemove.forEach(k => global.localStorage.removeItem(k));
    } catch (e) {
      // noop
    }
  }

  /**
   * Fusiona un delta de match-stats sobre el array actual.
   * El delta sobreescribe por eventId; los nuevos se añaden al final.
   * Idempotente: aplicar el conjunto completo dos veces da el mismo resultado.
   */
  function mergeMatchStats(current, delta) {
    const map = new Map((Array.isArray(current) ? current : []).map(m => [m.eventId, m]));
    if (Array.isArray(delta)) {
      for (const item of delta) map.set(item.eventId, item);
    }
    return Array.from(map.values());
  }

  const porraCache = { KEYS, predKey, cacheGet, cacheSet, cacheRemove, clearPorraCaches, mergeMatchStats };

  global.porraCache = porraCache;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = porraCache;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Ejecutar el test y verificar que PASA**

Run: `cd /home/ldoc/Proyectos/porra-spa && node --test tests/cacheStore.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Suite completa de la SPA**

Run: `cd /home/ldoc/Proyectos/porra-spa && node --test tests/*.test.js`
Expected: 24 ficheros, 0 fallos

- [ ] **Step 6: Commit**

```bash
cd /home/ldoc/Proyectos/porra-spa && git add js/cacheStore.js tests/cacheStore.test.js && git commit -m "feat: modulo cacheStore con SWR localStorage y merge de deltas"
```

---

### Task 5 (porra-spa): fetchMatchStats con SWR + delta

**Files:**
- Modify: `js/main.js:502-522` (función `fetchMatchStats`)
- Modify: `js/main.js` objeto `AppState` (declaración, líneas 17-55): añadir `_matchStatsServerTime: null`

**Interfaces:**
- Consumes: `porraCache.*` (Task 4), `fetchWithPhase()`, `invalidateClassificationCache()` existentes.
- Produces: `AppState._matchStatsServerTime` (ISO string|null, proveniente SIEMPRE de `serverTime` del backend). Comportamiento externo de `fetchMatchStats(force)` sin cambios (misma firma, mismos efectos colaterales: `invalidateClassificationCache()` cuando hay datos).

- [ ] **Step 1: Añadir el campo a AppState**

En el objeto `AppState` (bloque líneas 17-55), junto a `_matchStatsTime` si existe o cerca de `matchStats`, añadir:

```js
  _matchStatsServerTime: null,
```

- [ ] **Step 2: Reemplazar fetchMatchStats**

Reemplazar la función (líneas 502-522) por:

```js
async function fetchMatchStats(force = false) {
  // Usar caché en memoria si tiene menos de 30 segundos (salvo force)
  if (!force && AppState.matchStats.length > 0 && AppState._matchStatsTime && Date.now() - AppState._matchStatsTime < CACHE_TTL) {
    return;
  }
  // SWR: pintar al instante desde localStorage si la memoria está vacía
  let cachedServerTime = null;
  if (AppState.matchStats.length === 0) {
    const cached = porraCache.cacheGet(porraCache.KEYS.matchstats);
    if (cached?.payload?.matchStats?.length > 0) {
      AppState.matchStats = cached.payload.matchStats;
      cachedServerTime = cached.serverTime || null;
    }
  }
  const since = AppState._matchStatsServerTime || cachedServerTime;
  try {
    const url = since
      ? `${API_BASE}/api/match-stats?since=${encodeURIComponent(since)}`
      : `${API_BASE}/api/match-stats`;
    const res = await fetchWithPhase(url);
    const data = await res.json().catch(() => null);
    if (data?.ok && Array.isArray(data.matchStats)) {
      const isDelta = Boolean(since);
      if (!isDelta) {
        AppState.matchStats = data.matchStats;
      } else if (data.matchStats.length > 0) {
        AppState.matchStats = porraCache.mergeMatchStats(AppState.matchStats, data.matchStats);
      }
      AppState._matchStatsTime = Date.now();
      AppState._matchStatsServerTime = data.serverTime || since || new Date().toISOString();
      porraCache.cacheSet(porraCache.KEYS.matchstats, { matchStats: AppState.matchStats }, AppState._matchStatsServerTime);
      invalidateClassificationCache();
    }
  } catch (e) {
    console.error('Error cargando matchstats:', e);
  }
}
```

Notas de diseño (críticas para no romper nada):
- **No re-renderiza dentro**: el polling (`fetchMatchStatsUpdated`, línea 605) ya re-renderiza y muestra toast tras llamar `fetchMatchStats(true)`; navegar de tab siempre re-renderiza con el estado en memoria. Duplicar el render aquí provocaría doble trabajo.
- **Tolerancia a backend viejo**: si el backend ignora `since` y devuelve TODO, `mergeMatchStats` sobreescribe cada `eventId` con el dato completo → resultado idéntico a un refetch total (spec §7).
- `invalidateClassificationCache()` se llama dentro de `data.ok`, igual que hoy.
- Delta vacío: no toca `AppState.matchStats`, pero avanza `_matchStatsServerTime` y repersiste (barato) → siguiente delta aún más pequeño.
- Fallback `new Date().toISOString()` solo si el backend viejo no envía `serverTime`: el merge sigue siendo idempotente, único riesgo menor de delta algo mayor.

- [ ] **Step 3: Suite completa**

Run: `cd /home/ldoc/Proyectos/porra-spa && node --test tests/*.test.js`
Expected: 24 ficheros, 0 fallos

- [ ] **Step 4: Verificación sintáctica del bundle de navegador**

Run: `cd /home/ldoc/Proyectos/porra-spa && node --check js/main.js`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
cd /home/ldoc/Proyectos/porra-spa && git add js/main.js && git commit -m "feat: SWR con localStorage y delta since en fetchMatchStats"
```

---

### Task 6 (porra-spa): fetchAllPredictions con SWR + invalidaciones

**Files:**
- Modify: `js/main.js:525-549` (función `fetchAllPredictions`) + helper `predAllKey()` justo encima
- Modify: `js/main.js` objeto `AppState`: añadir `_allPredictionsSeeded: false`
- Modify: `js/main.js:358` aprox (éxito de `savePredictionsToBackend`)
- Modify: `js/main.js:4211` aprox (éxito de `confirmPredictions`)
- Modify: `js/main.js:4654-4660` (éxito de `saveSquadToBackend`)
- Modify: `js/main.js:6069-6075` aprox (éxito de `saveFinalPredictionsToBackend`)
- Modify: `js/main.js:3647-3663` (logout del modal de perfil)

**Interfaces:**
- Consumes: `porraCache.*` (Task 4), `unwrapAllPredictions()` (js/apiData.js), `authHeaders()`.
- Produces: invalidación coherente — cualquier PUT propio (predictions/confirm/squad/final-predictions) limpia la entrada localStorage de `predictions/all` y resetea `_allPredictionsTime`, forzando refetch completo en la próxima lectura (equivale a la invalidación por TTL actual). Logout limpia TODAS las claves `porra_cache_*`.

- [ ] **Step 1: Helper predAllKey + campo AppState**

Añadir `_allPredictionsSeeded: false` al objeto `AppState`.

Justo encima de `fetchAllPredictions` (línea 525) añadir:

```js
function predAllKey() {
  const name = AppState.currentUser?.name;
  return name ? porraCache.predKey(name) : null;
}

function invalidatePredAllCache() {
  AppState._allPredictionsTime = 0;
  AppState._allPredictionsSeeded = false;
  const key = predAllKey();
  if (key) porraCache.cacheRemove(key);
}
```

- [ ] **Step 2: Reemplazar fetchAllPredictions**

Reemplazar `fetchAllPredictions` (líneas 525-549) por:

```js
async function fetchAllPredictions() {
  if (AppState._allPredictionsTime && Date.now() - AppState._allPredictionsTime < CACHE_TTL) {
    return;
  }
  // SWR: pintar al instante desde localStorage si la memoria está vacía (clave por usuario)
  const cacheKey = predAllKey();
  if (cacheKey && !AppState._allPredictionsSeeded) {
    const cached = porraCache.cacheGet(cacheKey);
    if (cached?.payload) {
      const { allPredictions, finalPredictionsCache, squadsCache } = unwrapAllPredictions({ predictions: cached.payload });
      AppState.allPredictions = allPredictions;
      if (!AppState.finalPredictionsCache) AppState.finalPredictionsCache = {};
      Object.assign(AppState.finalPredictionsCache, finalPredictionsCache);
      if (!AppState.squadsCache) AppState.squadsCache = {};
      Object.assign(AppState.squadsCache, squadsCache);
    }
    AppState._allPredictionsSeeded = true;
  }
  try {
    const res = await fetchWithPhase(`${API_BASE}/api/predictions/all`, { headers: authHeaders() });
    const data = await res.json();
    if (data.ok && data.predictions) {
      const { allPredictions, finalPredictionsCache, squadsCache } = unwrapAllPredictions(data);
      AppState.allPredictions = allPredictions;
      if (!AppState.finalPredictionsCache) AppState.finalPredictionsCache = {};
      Object.assign(AppState.finalPredictionsCache, finalPredictionsCache);
      if (!AppState.squadsCache) AppState.squadsCache = {};
      Object.assign(AppState.squadsCache, squadsCache);
      if (!AppState._finalPredictionsCacheTime) AppState._finalPredictionsCacheTime = {};
      const now = Date.now();
      for (const username of Object.keys(finalPredictionsCache)) {
        AppState._finalPredictionsCacheTime[username] = now;
      }
      AppState._allPredictionsTime = now;
      if (cacheKey) porraCache.cacheSet(cacheKey, data.predictions, null);
    }
  } catch (e) {
    console.error('Error cargando todas las predicciones:', e);
  }
}
```

La clave de caché es POR USUARIO (`porra_cache_predall_v1_<user>`) para no mostrar datos de otro usuario en fases PRE durante la revalidación.

- [ ] **Step 3: Invalidaciones tras PUT propios**

Añadir una llamada a `invalidatePredAllCache();` dentro del bloque `if (data.ok) { ... }` de cada una de estas 4 funciones:

| Función (main.js) | Dónde insertar |
|---|---|
| `savePredictionsToBackend` (~línea 358) | tras `AppState.hasUnsavedChanges = false;` |
| `confirmPredictions` (~línea 4211) | en su bloque de éxito |
| `saveSquadToBackend` (~líneas 4654-4660) | junto a `AppState._allPredictionsTime = 0;` (sustituye a ese reset puntual, que `invalidatePredAllCache` ya hace) |
| `saveFinalPredictionsToBackend` (~línea 6069) | dentro de `data.ok`, tras actualizar `finalPredictionsCache` |

- [ ] **Step 4: Logout**

En el handler del botón logout del modal de perfil (líneas 3647-3663), justo tras `localStorage.removeItem('session_token');`:

```js
    porraCache.clearPorraCaches();
    AppState._allPredictionsSeeded = false;
```

(NOTA preexistente fuera de alcance: `logout()` se invoca en 6 sitios de main.js pero NUNCA está definida — bug preexistente; NO tocarlo.)

- [ ] **Step 5: Suite completa**

Run: `cd /home/ldoc/Proyectos/porra-spa && node --test tests/*.test.js && node --check js/main.js`
Expected: 24 ficheros, 0 fallos

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: SWR con localStorage por usuario en fetchAllPredictions e invalidacion en PUTs"
```

---

### Task 7 (porra-spa): Eliminar cache-busters (F1) + cache-busting index.html

**Files:**
- Modify: `js/main.js:301` (loadInitialData)
- Modify: `js/main.js:2690` (refetch config tras cambio de fase admin)
- Modify: `js/main.js:3490` (fetchPlayers)
- Modify: `index.html` (añadir script cacheStore.js, subir versión de main.js)

- [ ] **Step 1: Quitar los tres cache-busters**

- Línea 301: `` `${API_BASE}/api/config?t=${Date.now()}` `` → `` `${API_BASE}/api/config` ``
- Línea 2690: `` `${API_BASE}/api/config?t=${Date.now()}` `` → `` `${API_BASE}/api/config` ``
- Línea 3490: `` `${API_BASE}/api/players?t=${Date.now()}` `` → `` `${API_BASE}/api/players` ``

Seguro porque B1 (ETag) revalida: si el contenido cambió, el navegador recibe 200 con cuerpo nuevo; si no, 304.

- [ ] **Step 2: index.html**

Añadir ANTES de `<script src="js/apiData.js?v=1"></script>` (línea 320):

```html
  <script src="js/cacheStore.js?v=1"></script>
```

Y subir la versión de main.js (línea 324): `js/main.js?v=111` → `v=112`. CSS sin cambios (no se toca styles.css).

- [ ] **Step 3: Suite completa + sintaxis**

Run: `cd /home/ldoc/Proyectos/porra-spa && node --test tests/*.test.js && node --check js/main.js`
Expected: 24 ficheros, 0 fallos

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "perf: eliminar cache-busters y registrar cacheStore en index.html (v=112)"
```

---

### Task 8: Integración final y verificación

**Files:** ninguno nuevo.

- [ ] **Step 1: Suites completas**

```bash
cd /home/ldoc/Proyectos/api-porra && node --test tests/*.test.js
cd /home/ldoc/Proyectos/porra-spa && node --test tests/*.test.js && node --check js/main.js && node --check js/cacheStore.js
```

Expected: api-porra ≥33 tests / 0 fallos; porra-spa ≥24 ficheros / 0 fallos.

- [ ] **Step 2: Verificación manual (requiere .env local con MONGODB_URI)**

```bash
cd /home/ldoc/Proyectos/api-porra && npm start &
# 1ª peticion: 200 + ETag
curl -si http://localhost:3000/api/match-stats | head -20
# 2ª con If-None-Match: 304
ETAG=$(curl -si http://localhost:3000/api/match-stats | grep -i '^etag' | tr -d '\r' | cut -d' ' -f2)
curl -si -H "If-None-Match: $ETAG" http://localhost:3000/api/match-stats | head -5
# delta: solo partidos posteriores + serverTime
curl -s "http://localhost:3000/api/match-stats?since=$(date -u +%Y-%m-%dT%H:%M:%SZ)" | python3 -m json.tool | head -10
# since invalido: 400
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/match-stats?since=basura"
```

Expected: 200 con `ETag: W/"..."`; segunda petición `HTTP/304`; delta con `serverTime`; `since=basura` → `400`.

- [ ] **Step 3: Criterios de éxito (spec §10, subset aplicable)**

1. Segunda petición con `If-None-Match` → 304 sin cuerpo.
2. `?since=` devuelve solo partidos posteriores + `serverTime`.
3. Segunda visita: pintado instantáneo desde localStorage + delta pequeño.
4. Sin cambios visibles de UX (toasts/tiempos actuales intactos).

- [ ] **Step 4: Commit final**

```bash
git add -A && git commit -m "feat: rendimiento B1+B2+F1+F2 (ETag/304, delta since, SWR localStorage, sin cache-busters)"
```

---

## Riesgos y mitigaciones (recordatorio del spec, aplicados a este scope)

| Riesgo | Mitigación |
|---|---|
| Quota localStorage | Cap 2 MB en `cacheSet` + purga de claves propias; fail-open |
| Payload match-stats ~1.3 MB cerca del cap | Si excede 2 MB, `cacheSet` devuelve false y simplemente no cachea (degradación elegante) |
| Escritura síncrona de ~1.3 MB en localStorage ocasional | Aceptable (<30 usuarios); ocurre solo al detectarse cambios |
| Desfase de despliegue front/back | `since` ignorado → respuesta completa → merge idempotente; ETag transparente; `serverTime` ausente → fallback reloj cliente (solo empeora tamaño de delta, nunca corrupción) |
| Quitar `?t=` de `/api/config` si el FRONT despliega antes que el BACK | Sin `Cache-Control` previo el navegador no heurísticamente cachea APIs JSON sin `Last-Modified`; con ETag revalida barato. Desplegar BACK primero si duda |
| `logout()` indefinida en 6 llamadas (bug preexistente detectado) | Fuera de alcance; NO tocar |

## Notas de despliegue (Vercel)

- Solo `crypto`/`zlib` nativos en backend; sin estado long-lived añadido (serverless-safe).
- El índice `lastUpdated` lo crea Mongoose al arrancar la función.
- localStorage es cliente; nada nuevo server-side.
- No se toca ningún `vercel.json`.
- Orden de despliegue recomendado: primero BACKEND, después FRONTEND (tolerante en ambos sentidos, pero así el front nuevo ya encuentra ETag/`since` disponibles).
