# Live Scrapeo Periódico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `scripts/scrapeLiveMatches.js` en un script continuo que, cada 30s, scrapea los partidos en ventana live y rellena la colección `livematches` con estado real (LIVE/HT/FT) y minuto.

**Architecture:** El script contiene su propio bucle (sin daemon externo), corre en local y escribe en Mongo. Se reutiliza la descarga de `scrapMatchStats` extrayendo `scrapMatchFull` (stats + estado crudo + minuto) sin petición HTTP extra. Helpers puros en `api/live.js`.

**Tech Stack:** Node.js ES Modules, Mongoose, `node:test` + `node:assert/strict`.

## Global Constraints

- Rama `api-porra` `feature/live`.
- ES Modules (`import/export`), sin frameworks nuevos.
- Naming en español para funciones y variables nuevas.
- No cambiar el contrato de `scrapMatchStats(eventId) -> stats` (lo usa `server.js`).
- `INTERVAL_MS = 30_000` como constante en la cabecera del script.
- Sin peticiones HTTP extra: reutilizar la descarga de `scrapMatchFull`.
- `expireAt` sigue siendo 23:59:59 UTC del día del partido (TTL Mongo).
- Todos los comandos se ejecutan en el worktree `/home/ldoc/Proyectos/api-porra/.worktrees/feature-live`.

---

### Task 1: Mapeo de estado de Sofascore (`liveStatusFromSofascore`)

**Files:**
- Modify: `api/live.js` (añadir función tras `minuteToStatus`, línea ~20)
- Test: `tests/live.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `liveStatusFromSofascore(statusType) -> 'LIVE' | 'HT' | 'FT' | null` (la usa Task 4).

- [ ] **Step 1: Write the failing test**

Añadir al final de `tests/live.test.js`, y ampliar el import de la línea 3 para incluir `liveStatusFromSofascore`:

```js
import { isLiveWindow, getLiveRefreshSecs, buildLiveDoc, selectLiveMatches, buildLiveResponse, minuteToStatus, liveStatusFromSofascore } from '../api/live.js';

test('liveStatusFromSofascore mapea estados de Sofascore', () => {
  assert.equal(liveStatusFromSofascore('inprogress'), 'LIVE');
  assert.equal(liveStatusFromSofascore('halftime'), 'HT');
  assert.equal(liveStatusFromSofascore('finished'), 'FT');
  assert.equal(liveStatusFromSofascore('notstarted'), null);
  assert.equal(liveStatusFromSofascore('postponed'), null);
  assert.equal(liveStatusFromSofascore('canceled'), null);
  assert.equal(liveStatusFromSofascore(undefined), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live.test.js`
Expected: FAIL (`liveStatusFromSofascore is not a function`).

- [ ] **Step 3: Write minimal implementation**

En `api/live.js`, tras `minuteToStatus`:

```js
export function liveStatusFromSofascore(statusType) {
  if (statusType === 'halftime') return 'HT';
  if (statusType === 'finished') return 'FT';
  if (statusType === 'inprogress') return 'LIVE';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live.test.js`
Expected: PASS (todos los tests, incluido el nuevo).

- [ ] **Step 5: Commit**

```bash
git add api/live.js tests/live.test.js
git commit -m "feat(live): mapeo de estado de Sofascore a LIVE/HT/FT"
```

---

### Task 2: `minute` en `buildLiveDoc` y en el modelo

**Files:**
- Modify: `api/live.js` (`buildLiveDoc`, línea ~22)
- Modify: `db/models/LiveMatch.js` (schema, línea ~7)
- Test: `tests/live.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `buildLiveDoc(eventId, stats, status, nowMs, minute = null) -> {eventId, stats, status, minute, lastUpdated, expireAt}` (la usa Task 4).
  - `LiveMatch.minute: Number|null`.

- [ ] **Step 1: Write the failing test**

Añadir a `tests/live.test.js`:

```js
test('buildLiveDoc incluye minute y lo deja null si falta', () => {
  const conMinuto = buildLiveDoc(1, { a: 1 }, 'LIVE', nowMs, 37);
  assert.equal(conMinuto.minute, 37);
  assert.equal(conMinuto.expireAt.toISOString(), '2026-09-16T23:59:59.000Z');
  const sinMinuto = buildLiveDoc(1, { a: 1 }, 'HT', nowMs);
  assert.equal(sinMinuto.minute, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live.test.js`
Expected: FAIL (`conMinuto.minute` es `undefined`, esperado `37`).

- [ ] **Step 3: Implementar**

En `api/live.js`, sustituir `buildLiveDoc`:

```js
export function buildLiveDoc(eventId, stats, status, nowMs, minute = null) {
  const day = new Date(nowMs);
  const expireAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59));
  return { eventId, stats, status, minute, lastUpdated: new Date(nowMs), expireAt };
}
```

En `db/models/LiveMatch.js`, añadir el campo dentro del schema (tras `status`):

```js
  minute: { type: Number, default: null },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/live.js db/models/LiveMatch.js tests/live.test.js
git commit -m "feat(live): minuto del partido en LiveMatch y buildLiveDoc"
```

---

### Task 3: Extraer `scrapMatchFull` sin romper `scrapMatchStats`

Refactor que preserva comportamiento. No hay test unitario sin red: se verifica con la suite existente (el contrato de `scrapMatchStats` no cambia) y con un chequeo de forma del módulo.

**Files:**
- Modify: `scripts/matchStats.js` (función `scrapMatchStats`, línea ~138 y su `return`, línea ~216-220)
- Test: `tests/matchStats.test.js` (no se añaden tests de red; solo se confirma que sigue verde)

**Interfaces:**
- Consumes: `fetchSofascore` (interno existente).
- Produces:
  - `scrapMatchFull(eventId) -> { stats, statusType, minute }` (la usa Task 4).
  - `statusType` = `eventData.event.status.type` o `null`.
  - `minute` = `eventData.event.time.current` o `null`.
  - `scrapMatchStats(eventId) -> stats` (contrato intacto).

- [ ] **Step 1: Renombrar la función y devolver metadatos**

En `scripts/matchStats.js`, renombrar `export async function scrapMatchStats(eventId)` a `export async function scrapMatchFull(eventId)` y sustituir el `return` final (el objeto `{ [homeId]: ..., [awayId]: ..., jugadores: allPlayers }`) por:

```js
    const stats = {
        [homeId]: homeTeamStats,
        [awayId]: awayTeamStats,
        jugadores: allPlayers
    };

    return {
        stats,
        statusType: ev.status?.type ?? null,
        minute: ev.time?.current ?? null
    };
}

export async function scrapMatchStats(eventId) {
    const { stats } = await scrapMatchFull(eventId);
    return stats;
}
```

No cambiar nada más del cuerpo (la variable `ev` ya existe en la línea ~161).

- [ ] **Step 2: Verificar forma del módulo y suite existente**

Run: `node -e "import('./scripts/matchStats.js').then(m => console.log(typeof m.scrapMatchFull, typeof m.scrapMatchStats))"`
Expected: `function function`

Run: `node --test tests/matchStats.test.js`
Expected: PASS (los 3 tests de `buildTeamStats`).

- [ ] **Step 3: Smoke test real opcional (red)**

Run: `node --env-file=.env -e "import('./scripts/matchStats.js').then(async m => { const r = await m.scrapMatchFull(14566909); console.log(Object.keys(r), r.statusType, r.minute); })"`
Expected: imprime `[ 'stats', 'statusType', 'minute' ]` y un estado/minuto (o `null` si aún no jugado).

- [ ] **Step 4: Commit**

```bash
git add scripts/matchStats.js
git commit -m "refactor(live): scrapMatchFull expone estado y minuto; scrapMatchStats intacto"
```

---

### Task 4: Script continuo `scrapeLiveMatches.js`

**Files:**
- Modify (reescritura completa): `scripts/scrapeLiveMatches.js`
- Modify: `AGENTS.md` (sección "Funciones de Scraping" y "Notas Importantes")
- Test: manual (`--once`)

**Interfaces:**
- Consumes: `scrapMatchFull` (Task 3), `liveStatusFromSofascore` (Task 1), `buildLiveDoc`/`selectLiveMatches` (Task 2 y existentes), `connectDB`/`LiveMatch`.
- Produces: proceso continuo; flag `--once` para una pasada.

- [ ] **Step 1: Reescribir el script**

Contenido completo de `scripts/scrapeLiveMatches.js`:

```js
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, LiveMatch } from '../db/index.js';
import { scrapMatchFull } from './matchStats.js';
import { selectLiveMatches, buildLiveDoc, liveStatusFromSofascore } from '../api/live.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTERVAL_MS = 30_000;
const ONCE = process.argv.includes('--once');

const calendar = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/sofascore/calendar.json'), 'utf-8'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString();

async function tick() {
  const live = selectLiveMatches(calendar, Date.now());
  console.log(`${stamp()} Partidos en ventana live: ${live.length}`);
  if (live.length === 0) return;

  const existing = await LiveMatch.find({ eventId: { $in: live.map(m => m.id) } }, 'eventId status').lean();
  const finished = new Set(existing.filter(d => d.status === 'FT').map(d => d.eventId));

  let ok = 0;
  for (const m of live) {
    if (finished.has(m.id)) continue;
    try {
      const { stats, statusType, minute } = await scrapMatchFull(m.id);
      const status = liveStatusFromSofascore(statusType);
      if (!status) continue;
      await LiveMatch.findOneAndUpdate(
        { eventId: m.id },
        buildLiveDoc(m.id, stats, status, Date.now(), minute),
        { upsert: true, new: true }
      );
      ok++;
    } catch (e) {
      console.error(`${stamp()} Fallo scrapeo ${m.id}: ${e.message}`);
    }
  }
  console.log(`${stamp()} Guardados: ${ok}/${live.length}`);
}

await connectDB();

if (ONCE) {
  await tick();
  process.exit(0);
}

process.on('SIGINT', () => {
  console.log('\nParando scrapeo live...');
  process.exit(0);
});

console.log(`Scrapeo live cada ${INTERVAL_MS / 1000}s. Ctrl+C para parar.`);
while (true) {
  await tick();
  await sleep(INTERVAL_MS);
}
```

- [ ] **Step 2: Verificar sin partidos en ventana (--once)**

Run: `node --env-file=.env scripts/scrapeLiveMatches.js --once`
Expected: imprime `Partidos en ventana live: 0` y sale con código 0. (Si hoy hay partidos en ventana, imprimirá `Guardados: k/N`; ambos son correctos.)

- [ ] **Step 3: Actualizar `AGENTS.md`**

En la sección "Funciones de Scraping (scripts/)", añadir bajo el bloque de `scrapMatchStats`:

```js
import { scrapMatchFull } from './scripts/matchStats.js';

// Scraping completo de un partido: stats + estado crudo de Sofascore + minuto
const { stats, statusType, minute } = await scrapMatchFull(eventId);
// statusType: 'inprogress' | 'halftime' | 'finished' | 'notstarted' | ...
// Traducir con liveStatusFromSofascore(statusType) -> 'LIVE' | 'HT' | 'FT' | null
```

En "Notas Importantes", añadir:

```markdown
- **Scrapeo live periódico (local)**: `node --env-file=.env scripts/scrapeLiveMatches.js` rellena la colección `livematches` cada 30s (ventana `[inicio−15min, inicio+120min]`). Corre en local y escribe en Mongo; usar el `MONGODB_URI` de `/prod` para que lo vea `porra-spa` en producción. `--once` hace una sola pasada. `Ctrl+C` lo para. El TTL de Mongo borra los docs a fin de día UTC.
```

- [ ] **Step 4: Suite completa**

Run: `node --test tests/*.test.js`
Expected: PASS (mismo baseline que antes del cambio + tests nuevos de Task 1 y 2).

- [ ] **Step 5: Commit**

```bash
git add scripts/scrapeLiveMatches.js AGENTS.md
git commit -m "feat(live): scrapeLiveMatches continuo cada 30s con estado real"
```

---

## Notas de verificación final

- `scrapMatchStats` sigue devolviendo exactamente `{ [homeId]: {...}, [awayId]: {...}, jugadores: [...] }` (lo consume `server.js`); no añadir claves nuevas a ese objeto.
- Prueba end-to-end local del directo: `node --env-file=.env scripts/scrapeLiveMatches.js` + `node --env-file=.env scripts/seedLiveDemo.js --user <tu_usuario>` (o un día real de partidos) y comprobar `curl http://localhost:3000/api/live`.
- `porra-spa` no requiere cambios: ya lee `status` y `minute` (`js/main.js:1899`).
