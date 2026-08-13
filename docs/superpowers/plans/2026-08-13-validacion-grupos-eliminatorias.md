# Validación de grupos de posiciones en Eliminatorias — Implementación (api-porra)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la validación de las predicciones de eliminatorias en el PUT `/api/final-predictions` para que el límite de 2 equipos por grupo de posiciones (A-D) se aplique al conjunto de cajas fuera de dieciseisavos, no por caja individual.

**Architecture:** Se crea un módulo puro y testeable `api/finalPredictions.js` con el validador `getFinalPredictionsViolations`. El handler PUT de `server.js` lo usa y devuelve `400` con el primer mensaje de violación. Se eliminan las constantes `POSITION_GROUPS` y `MAX_TEAMS_PER_GROUP_PER_ZONE` de `server.js` (ahora viven en el módulo). Se actualiza AGENTS.md.

**Tech Stack:** Node.js ES Modules (sin frameworks, `http` nativo). Tests con `node:test` (`import test from 'node:test'`, patrón `tests/matchStats.test.js`).

## Global Constraints

- TDD en cada tarea: test que falla → implementación mínima → test que pasa → commit.
- Módulos ES (`import`/`export`), nunca CommonJS.
- Naming en español (convención del repo).
- El validador debe tener exactamente la misma semántica que el de porra-spa (`getFinalPredictionsViolations` en `js/eliminatorias.js`).
- Los tests se ejecutan desde la raíz del repo: `node --test tests/<archivo>.test.js`.

---
### Task 1: Módulo `api/finalPredictions.js` con el validador + tests

**Files:**
- Create: `api/finalPredictions.js`
- Create: `tests/finalPredictions.test.js`
- Modify: — (nada)

**Interfaces:**
- Produces:
  - `POSITION_GROUPS` (constante `{ A: [9,10,23,24], B: [11,12,21,22], C: [13,14,19,20], D: [15,16,17,18] }`)
  - `MAX_TEAMS_PER_GROUP_PER_ZONE` (constante `2`)
  - `getFinalPredictionsViolations(finalPredictions, teamPositionMap) → Array<string>`. `finalPredictions` es `{ champion, runnerUp, semiFinalists, quarterFinalists, roundOf16, roundOf32 }` (single pueden ser `null`; arrays pueden tener placeholders falsy). `teamPositionMap` es `Map<teamId, posicion>` con posiciones 1-24. Devuelve `[]` si es válido, o los mensajes.

- [ ] **Step 1: Write the failing test**

Create `tests/finalPredictions.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getFinalPredictionsViolations } from '../api/finalPredictions.js';

// teamId == posición para simplificar los tests (mapa 1..24)
function posMap() {
  const map = new Map();
  for (let i = 1; i <= 24; i++) map.set(i, i);
  return map;
}

const fp = (over) => Object.assign(
  { champion: null, runnerUp: null, semiFinalists: [], quarterFinalists: [], roundOf16: [], roundOf32: [] },
  over
);

test('válido: grupo A repartido 2 en dieciseisavos + 2 fuera', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ champion: 10, runnerUp: 24, roundOf32: [9, 23] }), posMap()), []);
});

test('inválido: ejemplo reportado, 3 del grupo A fuera de dieciseisavos', () => {
  const v = getFinalPredictionsViolations(fp({ semiFinalists: [24], quarterFinalists: [23], roundOf16: [10], roundOf32: [9] }), posMap());
  assert.strictEqual(v.length, 1);
  assert.match(v[0], /fuera de dieciseisavos/);
});

test('inválido: 3 del mismo grupo en dieciseisavos', () => {
  const v = getFinalPredictionsViolations(fp({ roundOf32: [9, 10, 23] }), posMap());
  assert.strictEqual(v.length, 1);
  assert.match(v[0], /dieciseisavos/);
});

test('válido parcial: 2 fuera + 1 sin colocar', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ quarterFinalists: [23], roundOf16: [10], roundOf32: [9] }), posMap()), []);
});

test('límites: 2 en el resto ok, 3 error', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ quarterFinalists: [], roundOf16: [10, 23], roundOf32: [9, 24] }), posMap()), []);
  const v = getFinalPredictionsViolations(fp({ quarterFinalists: [23], roundOf16: [10, 24], roundOf32: [9] }), posMap());
  assert.strictEqual(v.length, 1);
});

test('grupos B, C y D respetan sus límites', () => {
  // Todos los grupos al límite 2/2: 2 en dieciseisavos + 2 fuera; top-8 (1-8) en octavos
  const ok = fp({
    champion: 23, runnerUp: 24,
    semiFinalists: [21, 22], quarterFinalists: [19, 20],
    roundOf16: [17, 18, 1, 2, 3, 4, 5, 6],
    roundOf32: [9, 10, 11, 12, 13, 14, 15, 16]
  });
  assert.deepEqual(getFinalPredictionsViolations(ok, posMap()), []);
});

test('nulls y placeholders falsy no cuentan', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ roundOf16: [null, 10], roundOf32: [9, null, 23] }), posMap()), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/finalPredictions.test.js`
Expected: FAIL con error de import (módulo `../api/finalPredictions.js` no existe / `getFinalPredictionsViolations` no exportado).

- [ ] **Step 3: Write minimal implementation**

Create `api/finalPredictions.js`:

```js
/**
 * Validación de las predicciones de eliminatorias.
 * Grupos de posiciones A-D: máximo 2 equipos por grupo en dieciseisavos y
 * máximo 2 por grupo en el CONJUNTO de cajas fuera de dieciseisavos (campeón,
 * subcampeón, semifinalistas, cuartos y octavos combinadas).
 */

export const POSITION_GROUPS = {
  A: [9, 10, 23, 24],
  B: [11, 12, 21, 22],
  C: [13, 14, 19, 20],
  D: [15, 16, 17, 18]
};

export const MAX_TEAMS_PER_GROUP_PER_ZONE = 2;

/**
 * @param {Object} finalPredictions - { champion, runnerUp, semiFinalists, quarterFinalists, roundOf16, roundOf32 }
 * @param {Map<number,number>} teamPositionMap - teamId -> posición pronosticada (1-24)
 * @returns {Array<string>} Mensajes de violación (vacío = válido)
 */
export function getFinalPredictionsViolations(finalPredictions, teamPositionMap) {
  const fp = finalPredictions || {};
  const violations = [];

  const countGroupIn = (teamIds, positions) => (teamIds || [])
    .filter(id => {
      const pos = teamPositionMap.get(id);
      return pos && positions.includes(pos);
    })
    .length;

  const restTeams = [
    ...(fp.champion ? [fp.champion] : []),
    ...(fp.runnerUp ? [fp.runnerUp] : []),
    ...(fp.semiFinalists || []),
    ...(fp.quarterFinalists || []),
    ...(fp.roundOf16 || [])
  ];

  for (const positions of Object.values(POSITION_GROUPS)) {
    if (countGroupIn(fp.roundOf32, positions) > MAX_TEAMS_PER_GROUP_PER_ZONE) {
      violations.push(`Máximo ${MAX_TEAMS_PER_GROUP_PER_ZONE} equipos de posiciones ${positions.join(',')} en dieciseisavos.`);
    }
    if (countGroupIn(restTeams, positions) > MAX_TEAMS_PER_GROUP_PER_ZONE) {
      violations.push(`Máximo ${MAX_TEAMS_PER_GROUP_PER_ZONE} equipos de posiciones ${positions.join(',')} en el conjunto de cajas fuera de dieciseisavos.`);
    }
  }

  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/finalPredictions.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Run existing suite (no regresiones)**

Run: `node --test tests/matchStats.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add api/finalPredictions.js tests/finalPredictions.test.js
git commit -m "feat: validador de grupos de posiciones en eliminatorias (módulo api/finalPredictions.js)"
```

---
### Task 2: Usar el validador en el PUT `/api/final-predictions` de `server.js`

**Files:**
- Modify: `server.js:14` (imports), `server.js:28-34` (eliminar constantes), `server.js:864-897` (bloque de validación)
- Test: `tests/finalPredictions.test.js` (sin cambios), `tests/matchStats.test.js` (regresión)

**Interfaces:**
- Consumes: `getFinalPredictionsViolations(finalPredictions, teamPositionMap)` de `./api/finalPredictions.js`.
- Produces: handler PUT `/api/final-predictions` que valida los grupos de posiciones con la nueva semántica y responde `400 { ok:false, error }` con el primer mensaje de violación.

- [ ] **Step 1: Añadir el import**

En `server.js`, tras la línea 14 (`import { authenticate, ... } from './api/middleware.js';`), añadir:

```js
import { getFinalPredictionsViolations } from './api/finalPredictions.js';
```

- [ ] **Step 2: Eliminar las constantes locales de `server.js`**

Eliminar las líneas 28-34 de `server.js`:

```js
const POSITION_GROUPS = {
  A: [9, 10, 23, 24],
  B: [11, 12, 21, 22],
  C: [13, 14, 19, 20],
  D: [15, 16, 17, 18]
};
const MAX_TEAMS_PER_GROUP_PER_ZONE = 2;
```

(Verificar antes con grep que no se usan en otro sitio: `POSITION_GROUPS` y `MAX_TEAMS_PER_GROUP_PER_ZONE` solo aparecían en 28-34, 882, 888 y 891.)

- [ ] **Step 3: Sustituir el bucle de validación por el validador**

En `server.js`, reemplazar el bloque completo que empieza en `// Validación: restricciones por grupos de posiciones` (línea 864) y termina al cierre del `if (standings && standings.length >= 24) { ... }` (línea 897) por:

```js
    // Validación: restricciones por grupos de posiciones
    if (standings && standings.length >= 24) {
      const violations = getFinalPredictionsViolations(fp, teamPositionMap);
      if (violations.length > 0) {
        sendJson(req, res, 400, { ok: false, error: violations[0] });
        return;
      }
    }
```

Nota: el bloque anterior incluía el array `zones` con los labels `dieciseisavos/octavos/cuartos/semifinalistas/subcampeón/campeón`; ya no es necesario. El check Top-8 previo (líneas 855-862) y la creación de `teamPositionMap` (líneas 850-853) se mantienen intactos.

- [ ] **Step 4: Ejecutar tests (regresión)**

Run: `node --test tests/finalPredictions.test.js tests/matchStats.test.js`
Expected: ambos sin fallos.

- [ ] **Step 5: Verificación manual (curl)**

Con el servidor arrancado (`npm start`) y un usuario con 144 pronósticos confirmados:

1. Enviar un payload con 3 del grupo A fuera de dieciseisavos (p. ej. `semiFinalists:[24]`, `quarterFinalists:[23]`, `roundOf16:[10]`, `roundOf32:[9]`) → `400` con `Máximo 2 equipos de posiciones 9,10,23,24 en el conjunto de cajas fuera de dieciseisavos.`
2. Enviar un payload válido (grupo A 2/2: `champion:10`, `runnerUp:24`, `roundOf32:[9,23]`) → `200 { ok:true }`.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "fix: validar grupos de posiciones en PUT final-predictions (conjunto fuera de dieciseisavos)"
```

---
### Task 3: Aclarar la regla en AGENTS.md

**Files:**
- Modify: `AGENTS.md:513-537`

- [ ] **Step 1: Reescribir la restricción 3**

Reemplazar el punto `3. **Restricciones por grupos de posiciones**` (líneas 517-529, incluyendo las dos sub-secciones "En la caja de DIECISEISAVOS:" y "En el resto de las cajas ...") por:

```markdown
3. **Restricciones por grupos de posiciones**: Para limitar la concentración de equipos de ciertos rangos en una misma ronda, se aplican los siguientes límites máximos (2 equipos por grupo):

   **En la caja de DIECISEISAVOS:**
   - Máximo 2 equipos de los que acabaron en posiciones 9, 10, 23 y 24
   - Máximo 2 equipos de los que acabaron en posiciones 11, 12, 21 y 22
   - Máximo 2 equipos de los que acabaron en posiciones 13, 14, 19 y 20
   - Máximo 2 equipos de los que acabaron en posiciones 15, 16, 17 y 18

   **En el conjunto de las cajas fuera de dieciseisavos (campeón, subcampeón, semifinalistas, cuartos y octavos combinadas):**
   - Máximo 2 equipos de los que acabaron en posiciones 9, 10, 23 y 24
   - Máximo 2 equipos de los que acabaron en posiciones 11, 12, 21 y 22
   - Máximo 2 equipos de los que acabaron en posiciones 13, 14, 19 y 20
   - Máximo 2 equipos de los que acabaron en posiciones 15, 16, 17 y 18

   > El límite de las cajas fuera de dieciseisavos se aplica al CONJUNTO de todas ellas (no por caja individual). Ejemplo: con los equipos de posiciones 9, 10, 23 y 24, no se puede poner el 23 en cuartos, el 24 en semifinales y el 10 en octavos; 2 de ellos deben ir obligatoriamente a dieciseisavos.
```

Se mantiene intacta la tabla "Grupos de restricción:" (líneas 531-537).

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: aclarar regla de grupos en eliminatorias (2 por grupo en el conjunto fuera de dieciseisavos)"
```

---
## Criterios de aceptación

- `node --test tests/finalPredictions.test.js` → 7 tests PASS.
- `node --test tests/matchStats.test.js` → 3 tests PASS.
- PUT `/api/final-predictions` rechaza con `400` un payload con 3 equipos del mismo grupo fuera de dieciseisavos y acepta uno con la distribución 2/2.
- `server.js` ya no define `POSITION_GROUPS` ni `MAX_TEAMS_PER_GROUP_PER_ZONE` (los importa del módulo).
