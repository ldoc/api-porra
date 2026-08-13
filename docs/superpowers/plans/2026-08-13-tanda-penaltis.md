# Campo tandaPenaltis en matchstats - Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar en la colección `matchstats` (MongoDB) si un partido se decidió en tanda de penaltis, añadiendo `tandaPenaltis` a la entrada de cada equipo cuando Sofascore expone `homeScore.penalties` / `awayScore.penalties`.

**Architecture:** Se añade un helper puro `buildTeamStats` en `scripts/matchStats.js` que construye el objeto de estadísticas de cada equipo y añade `tandaPenaltis` solo cuando el valor está definido. `scrapMatchStats` lo usa para construir el return, que `server.js` guarda tal cual en MongoDB.

**Tech Stack:** Node.js (ES Modules), `node:test` (runner integrado, sin dependencias nuevas).

## Global Constraints

- Usar ES Modules (`import`/`export`), no CommonJS.
- Naming en español para funciones y variables.
- Cuando Sofascore no expone `penalties`, el campo `tandaPenaltis` **se omite** (no se guarda `null` ni `0`).
- No añadir dependencias nuevas.
- No tocar `server.js` ni `db/models/MatchStats.js`.

---

### Task 1: Helper buildTeamStats y campo tandaPenaltis en scrapMatchStats

**Files:**
- Modify: `scripts/matchStats.js` (añadir helper antes de `scrapMatchStats`, y usar en el return, líneas 192-196)
- Create: `tests/matchStats.test.js`

**Interfaces:**
- Produces: `export function buildTeamStats(goles, tandaPenaltis)` → devuelve `{ goles }` y añade `tandaPenaltis` (número) solo cuando `tandaPenaltis !== undefined`.
- `scrapMatchStats` sigue exportando la misma función y devuelve la misma forma, con la única diferencia de que cada entrada de equipo puede incluir `tandaPenaltis`.

- [ ] **Step 1: Escribir el test que falla**

Create `tests/matchStats.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeamStats } from '../scripts/matchStats.js';

test('incluye tandaPenaltis cuando hay tanda', () => {
    assert.deepEqual(buildTeamStats(2, 4), { goles: 2, tandaPenaltis: 4 });
});

test('omite tandaPenaltis cuando no hubo tanda', () => {
    assert.deepEqual(buildTeamStats(2, undefined), { goles: 2 });
});

test('conserva tandaPenaltis 0 cuando Sofascore lo expone', () => {
    assert.deepEqual(buildTeamStats(2, 0), { goles: 2, tandaPenaltis: 0 });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `node --test tests/matchStats.test.js`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` o error al importar `buildTeamStats` (no existe aún).

- [ ] **Step 3: Implementar buildTeamStats y usarlo en scrapMatchStats**

En `scripts/matchStats.js`, añadir el helper justo antes de `scrapMatchStats`:

```js
export function buildTeamStats(goles, tandaPenaltis) {
    const stats = { goles };
    if (tandaPenaltis !== undefined) {
        stats.tandaPenaltis = tandaPenaltis;
    }
    return stats;
}
```

Sustituir el return actual de `scrapMatchStats` (líneas 192-196):

```js
    const homeTeamStats = buildTeamStats(homeGoals, ev.homeScore?.penalties);
    const awayTeamStats = buildTeamStats(awayGoals, ev.awayScore?.penalties);

    return {
        [homeId]: homeTeamStats,
        [awayId]: awayTeamStats,
        jugadores: allPlayers
    };
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `node --test tests/matchStats.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificar sintaxis del script modificado**

Run: `node --check scripts/matchStats.js`
Expected: sin salida de error (exit 0).

- [ ] **Step 6: Commit**

```bash
git add scripts/matchStats.js tests/matchStats.test.js
git commit -m "feat: añadir tandaPenaltis a las estadísticas de partidos"
```
