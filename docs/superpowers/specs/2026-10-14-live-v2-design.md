# Design: Live v2 — eventos por partido, clasificación dinámica y reproductor temporal

**Fecha:** 2026-10-14
**Rama:** `feature/live-v2` en `api-porra` y `porra-spa`
**Estado:** aprobado para implementación

## Resumen

Rediseño de la funcionalidad Live en los dos repos de la porra. El scraper pasa de
escribir *snapshots* de partidos a persistir un **log de eventos por partido** (con
minuto y segundo) en una colección Mongo nueva `liveevents`. El front **reconstruye el
estado de cada partido plegando esos eventos** (*event-sourcing puro*), calcula la
clasificación en vivo reutilizando las funciones de puntuación existentes y la muestra
en una pantalla dinámica con **animación de reordenación ("elevar 3D") y etiqueta de
motivo**. Se añade un **reproductor temporal global** para rebobinar la jornada y ver
marcadores y clasificación como una película.

No cambia el modelo de puntuación. El front deja de ser el almacén de eventos (hoy en
`localStorage`) y pasa a consumir el log del backend.

## Objetivos

- El backend registra todos los eventos relevantes por partido, ordenados por minuto y
  segundo; el front no persiste eventos.
- El front reconstruye marcador, notas, goles/asistencias y, por tanto, puntos, a partir
  de los eventos.
- Pantalla de live más dinámica: clasificación general que sube/baja con animación y
  motivo del cambio.
- Reproductor temporal global (scrub + play) que reconstruye el estado en cualquier
  instante de la jornada.
- Conservar las restricciones del proyecto: móvil vertical, determinismo, fase, ETag/304,
  polling, stack vanilla + http nativo, MongoDB Atlas.

## No-objetivos

- No se conserva histórico más allá de la jornada: retención con TTL a fin de día UTC
  (igual que `livematches`). El reproductor cubre la jornada en curso.
- No se reescriben las reglas de puntuación (`calculateMatchPoints`,
  `calculatePlayerMatchPoints`, `calculateStandings`).
- No se puntúan tarjetas ni criterios UEFA (solo ambientación / desempates existentes).
- No se introduce SSE ni WebSocket.

## Contexto (v1, a reemplazar)

- `api-porra/scripts/scrapeLiveMatches.js` recorre cada 30 s los partidos en ventana y
  hace upsert de snapshots en `livematches` (TTL fin de día). `GET /api/live` devuelve
  esos snapshots.
- Los incidentes de Sofascore se reducen a contadores en memoria
  (`scripts/matchStats.js:processIncidents`); no se persiste ni el minuto ni el tipo.
- `porra-spa` hace polling a `/api/live`, **detecta eventos comparando snapshots**
  (`js/live.js:diffLiveMatches`), los guarda en `localStorage` y re-renderiza todo el
  tab (`main.js:renderLiveTab`/`pollLiveOnce`). No hay animación de reordenación ni CSS
  de live (todo inline).
- Clasificación live = puntos oficiales + delta provisional de los partidos en juego,
  recalculado en cliente.

## Arquitectura

```text
Sofascore API
  │  (scraper local, cada 30 s)
  ▼
scripts/scrapeLiveMatches.js ── scrapMatchSource() ── deriveEvents()
  │
  ├─ insert (idempotente, índice único) ──► Mongo Atlas: colección `liveevents` (TTL fin día)
  └─ (respaldo) upsert snapshot ──────────► Mongo Atlas: colección `livematches`

GET /api/live/events  (full, al entrar)      ─┐
GET /api/live/events?since=<ISO>  (delta)     ├─► porra-spa (cada liveRefreshSecs, en 2º plano)
GET /api/live  (snapshots, respaldo/salud)   ─┘
  │
  ▼
js/liveV2.js: fold eventos → matchState → puntuación (funciones existentes)
  ├─ clasificación general + animación (elevar 3D) + motivo
  └─ reproductor temporal (playhead global sobre ts)
```

## 1. Modelo de eventos (`liveevents`)

Un documento por evento. Debe bastar para reconstruir marcador, notas y puntos en
cualquier instante:

```js
{
  _id,          // ObjectId
  eventId,      // partido Sofascore (ref a calendar)
  ingestedAt,   // ISO del instante de detección (monótono) → cursor de delta
  ts,           // ISO derivado del kickoff+minuto → eje del timeline global
  minute,       // reloj de partido (display + orden intrapartido)
  second,
  type,         // ver tipos
  teamId,       // equipo implicado (si aplica)
  playerId,     // jugador principal (si aplica)
  sourceId,     // id del incidente Sofascore (dedup) o clave sintética
  payload,      // datos específicos por tipo
  expireAt      // TTL: fin de día UTC (23:59:59) del día de `ts`
}
```

**Índices:** único `{ eventId: 1, sourceId: 1 }` (upsert idempotente: re-scrapear el mismo
tick no duplica), TTL `{ expireAt: 1 }` con `expireAfterSeconds: 0`, `{ ingestedAt: 1 }`
para el delta y `{ ts: 1 }` para el timeline. **El delta usa `ingestedAt` (instante de
detección, monótono), NO `ts`** (que va anclado al reloj del partido y por tanto no es
monótono en orden de inserción).

**Tipos y `payload`:**

| type | payload | Propósito |
|------|---------|-----------|
| `lineup` | `{ starters: [playerId] }` | quién está en el campo (minutos/GK) |
| `status` | `{ status, period }` | NS/LIVE/HT/FT, inicio de periodo |
| `goal` | `{ scorerId, isPenalty, isOwnGoal, scoreHome, scoreAway }` | marcador + goles |
| `goal_cancelled` | `{ ofSourceId }` | gol anulado (VAR) → revierte el gol referido |
| `assist` | `{ asistencias }` | asistencia de gol (contador por jugador, desde `fantasy`) |
| `penalty_saved` | `{ keeperId, takerId }` | +3 portero |
| `penalty_missed` | `{ takerId }` | ambientación |
| `card` | `{ cardType: yellow\|red\|yellowRed }` | ambientación |
| `substitution` | `{ inId, outId }` | cambios |
| `rating` | `{ rating }` | cambio de nota del jugador |
| `score` | `{ scoreHome, scoreAway }` | corrección autoritativa de marcador |
| `match_final` | `{ scoreHome, scoreAway, ratings: {}, minutes: {} }` | fija estado final al acabar |

**Reglas de reconstrucción:**

- **Orden global** por `ts` (absoluto); `minute`/`second` para el reloj intrapartido
  (los minutos no son comparables entre partidos simultáneos).
- **`ts` anclado al calendario**: el `ts` de cada evento se deriva del `fecha` programado
  del partido + el minuto de juego (`fecha + minuto·60s`, ajustando descanso), **no** del
  instante de detección del scraper. Así el eje temporal y el reloj son fieles aunque el
  scraper arranque con el partido ya empezado (los eventos previos no se apilan en `now`).
- **Marcador calculado**: se pliega `goal` **menos** `goal_cancelled`; `payload.scoreHome/
  scoreAway` es solo pista/validación, nunca fuente de verdad. `score` es un ajuste
  autoritativo de seguridad.
- **Anulación**: el scraper detecta `varDecision` de anulación y emite `goal_cancelled`
  con `ofSourceId` apuntando al `sourceId` del `goal`. Como el log es *append-only*,
  aunque Sofascore elimine el gol del feed, conservamos el gol original y su cancelación.
- **Gol en propia** (`isOwnGoal`): suma al equipo contrario en el marcador y no suma gol
  al jugador.
- **Asistencias**: el incidente de gol **no** trae asistente fiable
  (`footballPassingNetworkAction` es la red de pases, no el asistente). Por eso la
  asistencia se deriva del endpoint `fantasy` (contador de asistencias por jugador) como
  eventos `assist`; el reducer del front fija `asistencias` del jugador a ese contador.
- **Minutos de jugador** (`minutos`, decide portería a cero > 70'): se **derivan en el
  front** del reloj del partido + `lineup`/`substitution` (no se emite un evento por
  minuto).
- **Nota inicial** 6.0 (baseline Sofascore) y se sobrescribe con cada evento `rating`.

**Arranque tardío (resiliencia):** si el scraper empieza con el partido ya en juego,
`/incidents` devuelve el historial completo, así que goles, asistencias, tarjetas, cambios,
penaltis y anulaciones previos se emiten igualmente (dedup por `sourceId`), con su `ts`
derivado del minuto real. La reconciliación de marcador (`score`) corrige cualquier hueco.
Si arranca tras el final (dentro de ventana), `status FT` + `match_final` capturan de golpe
notas, minutos y marcador finales. **Limitación aceptada:** Sofascore no expone el
histórico de la nota, por lo que solo se captura la nota actual; el replay no muestra los
cambios intermedios de nota ocurridos antes del arranque.

## 2. Scraper (`api-porra`)

- Se conserva el patrón: `scripts/scrapeLiveMatches.js` en bucle cada **30 s**,
  `selectLiveMatches(calendar, now)` para los partidos en ventana.
- Nuevo módulo puro **`api/liveEvents.js`**: constantes de tipos y
  `deriveEvents(observation, existingEvents, nowMs) → newEvents[]`. El `ts` de cada evento
  se calcula como `observation.kickoffMs + minute·60s` (kickoff = `fecha` del calendario
  pasado por el scraper), con `nowMs` solo como respaldo si no hay minuto.
- Nueva **`scrapMatchSource(eventId)`** en `scripts/matchStats.js` que devuelve una
  observación normalizada de Sofascore sin perder atribución:

  ```js
  { eventId, kickoffMs, status, minute, score: { home, away },
    incidents: [{ sourceId, type, class, time, addedTime, playerId, assistId,
                  keeperId, inId, outId, cardType, teamId }],
    ratings: { [playerId]: nota },
    assists: { [playerId]: num },
    minutes: { [playerId]: min },
    starters: [playerId],
    stats }  // se mantiene para el snapshot livematches
  ```

- **Cada tick**, por partido: `scrapMatchSource` → cargar eventos del partido
  (`find({ eventId })`) → `deriveEvents` → insertar solo los nuevos (upsert con índice
  único; se ignoran claves duplicadas).
- Derivación:
  - Incidentes (`goal`, `varDecision`, `inGamePenalty`, `card`, `substitution`, `period`)
    → `goal` / `goal_cancelled` / `penalty_saved` / `penalty_missed` / `card` /
    `substitution` / `status`. `sourceId` = id de incidente Sofascore.
  - `ratings`: diff contra las notas representadas por eventos → `rating` por jugador
    cambiado. `sourceId = rating|playerId|valor` (idempotente).
  - `assists`: contador de asistencias por jugador desde `fantasy` → `assist` cuando
    sube. `sourceId = assist|playerId|valor` (idempotente).
  - `lineup` al primer avistamiento de alineaciones.
  - **`match_final`** al detectar FT: `{ scoreHome, scoreAway, ratings: {}, minutes: {} }`
    para fijar de forma autoritativa notas y minutos (portería a cero > 70').
  - **Seguridad de marcador**: si el marcador autoritativo difiere del plegado →
    `score`.
- **`livematches`**: se sigue escribiendo (reutiliza `scrapMatchFull`) como respaldo/salud;
  la UI v2 **no depende** de él.

## 3. API (`api-porra/server.js`)

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/api/live/events` | Carga inicial + timeline: eventos de hoy (ventana live). |
| `GET` | `/api/live/events?since=<ISO>` | Delta en segundo plano: `ingestedAt > since`; devuelve `serverTime = max(ingestedAt)`. El front deduplica por `_id` (solape inocuo). |
| `GET` | `/api/live` | Se mantiene: snapshots `livematches` (respaldo/salud). |
| `GET` | `/api/config` | Ya expone `liveRefreshSecs`; sin cambios. |
| `DELETE` | `/api/live/events/:eventId` | Admin: limpieza/debug (espejo del delete de matchstats). |

- Respuesta delta: `{ ok, events: [...], serverTime }`; sin `since` → día completo.
  Reutiliza `parseSinceParam` (patrón de `/api/match-stats`).
- `checkPhaseConsistency` como el resto; sin auth (igual que `/api/live` hoy).
- **ETag/304**: respuesta determinista salvo `serverTime`, que cambia solo cuando hay
  evento nuevo → el 304 evita re-descargas sin cambios.
- Orden de rutas: `/api/live/events` se evalúa **antes** que `/api/live`.
- Volumen estimado: ~18 partidos/día; decenas de incidentes + cambios de nota por partido
  → unos miles de eventos/día. El `full` (cientos de KB) se pide una vez al entrar.

## 4. Front — reducer y estado (`js/liveV2.js`)

El front pliega eventos → estado del partido → puntos. Lógica pura, testeable.

- `applyEvent(state, event, ctx)` — aplica un evento (marcador, goles, asistencias,
  penaltis, tarjetas, cambios, nota). `goal_cancelled` revierte el gol referido; `score`
  corrige el marcador; `match_final` fija estado final.
- `foldMatch(events, ctx)` / `foldAll(events, ctx)` — estado por partido.
- `stateAt(events, T, ctx)` — pliega solo `ts <= T` (clave del timeline).
- `matchStateToStats(state)` — devuelve la forma `stats` que ya consume
  `calculatePlayerMatchPoints` (reutiliza la puntuación sin tocarla).
- `matchClockAt(state, playheadTs)` — reloj de partido; deriva `minutos` de titulares y
  cambios (portería a cero > 70').
- `computeLiveClassification(...)` — filas con `livePoints`, rango y delta vs. playhead
  anterior.

`ctx` = datos estáticos que ya tiene el front (`AppState.matches`, `AppState.players`,
equipos).

**Cálculo** (reutiliza lo existente):
- Base oficial: `main.js:liveOfficialRows()` (puntos reales de partidos finalizados).
- Delta live: por cada partido en juego en el playhead, `calculateMatchPoints`
  (pronóstico) + `calculatePlayerMatchPoints` (plantilla) sobre el `matchState` plegado.
- Orden: `clasificacionApi.compareClasificacionJugadores`.

**Estado por jugador** en `matchState`: `{ rating, goals, assists, penaltyScored,
penaltySaved, cards, minutes, onPitch, goalsReceived }`; a nivel partido:
`{ status, score, clock }`.

**Módulo**: `js/liveV2.js` (reducer + fold + clasificación + renderer incremental + FLIP +
timeline). Se carga antes de `main.js`, que solo cablea fetch/poll y monta. Si crece
demasiado, se parte en `liveV2.js` (lógica) + `liveV2View.js` (DOM).

## 5. Front — pantalla dinámica (layout A, "clasificación protagonista")

Sustituye el subtab `🔴 Live` actual dentro de Resultados. Composición vertical (480px):

- Cabecera: estado `EN DIRECTO`/`REPRODUCIENDO` + reloj.
- **Hero**: tus puntos live (con delta).
- **Chips de partidos en directo**: marcador corto por partido.
- **Clasificación general** (protagonista): lista de todos los usuarios con posición,
  avatar, nombre, puntos y flecha de delta.
- **Reproductor temporal** (sección 7).
- **Feed de última hora**: eventos recientes.

El poll (`liveRefreshSecs`, por defecto 30 s) se hace **en segundo plano** y actualiza el
DOM **incrementalmente** (clave por usuario), sin re-render completo ni recargar la página.

## 6. Front — animación ("elevar 3D") y motivo

Estilo elegido entre tres opciones: **Elevar 3D**.

- Reordenación con técnica **FLIP** (medir posiciones, mutar orden, invertir con
  `transform`, animar a 0). Filas con clave = usuario.
- La fila que sube **se despega** (sombra + glow esmeralda + escala ~1.09) y el resto se
  atenúa (opacity ~0.5) mientras vuela; aterriza con `ease`.
- Destello esmeralda al subir y rojo al bajar; los puntos hacen *count-up*.
- **Etiqueta de motivo**: al cambiar de puesto aparece un tooltip flotante sobre la fila
  con el evento y los puntos, p. ej. `⚽ 67' Gol de Mbappé (RMA) · +14` (verde) o
  `↩️ 67' Gol anulado · VAR · −14` (rojo). Se desvanece tras la animación.
- Motivos previstos: gol, asistencia, penalti parado, sube/baja nota, gol anulado.

## 7. Front — reproductor temporal

- **Global**: un único playhead sobre el eje `ts` abarca todos los partidos en juego.
- Control definitivo (**estilo 1, sin velocidad**): botón ▶/❚❚, línea temporal con
  **marcas de color por tipo de evento** (gol, penalti, tarjeta, anulado), reloj, badge
  de estado y botón **⏭ Volver al directo**.
- Al mover el playhead al pasado entra en `REPRODUCIENDO` (el badge cambia); el botón
  Volver al directo se activa y salta al presente. Al alcanzar el final, vuelve solo a
  `EN DIRECTO`.
- En cualquier instante T se reconstruyen: reloj, puntos del hero, marcadores de los
  partidos, clasificación (con animación) y feed de eventos (`ts <= T`).

## 8. Testing

Runner `node:test` (como en ambos repos).

**Backend (`api-porra`):**
- `tests/liveEvents.test.js`: `deriveEvents` (gol, anulado, penalti parado, tarjetas,
  cambios, diff de notas, corrección de marcador, dedup por `sourceId`, idempotencia).
- Endpoint `/api/live/events` (full + `?since`, ETag/304).
- Se conservan `tests/live.test.js` y el resto.

**Front (`porra-spa`):**
- `tests/liveV2.test.js`: `applyEvent` por tipo, `foldMatch`, `stateAt`, `matchClockAt`
  (minutos / portería a cero), `matchStateToStats`, `computeLiveClassification`
  (orden + deltas).
- Se conservan `tests/live.test.js` y `tests/sound.test.js`.

## 9. Ramas, base de datos, rollout y docs

- **Ramas**: `feature/live-v2` en `api-porra` y `porra-spa` (aislamiento con worktrees).
- **BD**: colección `liveevents` + índices (único `{eventId, sourceId}`, TTL `{expireAt}`,
  `{ts}`) creados por `scripts/ensureLiveEventsIndexes.js` (espejo de `fixLiveIndex.js`).
- **Rollout** (el scraper es local, no Vercel):
  1. Deploy backend: modelo + scraper de eventos + endpoints (aditivos; no rompe v1).
  2. Deploy front: sustituye el subtab Live; bump de `?v=` en `index.html` para
     `liveV2.js` y `main.js`.
  3. Rollback = revertir el front (el backend solo añade).
- **Docs**: `api-porra/AGENTS.md` (endpoint + scraper), `porra-spa/AGENTS.md` §5.3.3,
  `pantallas-usuarios-fases.md` §4 (añadir Live), `DESIGN.md` (sección live).

## Riesgos y casos límite

- **Completitud del log** (event-sourcing puro): si el scraper se detiene o arranca tarde,
  los incidentes previos se recuperan de `/incidents` y la reconciliación `score` corrige el
  marcador; el `ts` se ancla al kickoff programado. Mitigación adicional: `livematches` de
  respaldo. Limitación: la nota solo se captura a partir del primer scrapeo.
- **Atribución de anulación**: si Sofascore ya había quitado el gol antes del primer
  scrapeo, no hay `goal` que revertir; lo cubre el evento `score`.
- **Cambios de nota**: dependen del polling (granularidad ~30 s); la nota del timeline es
  escalonada por evento, no continua.
- **Minutos derivados** vs. Sofascore: pueden diferir ligeramente en el tiempo de
  descuento; `match_final` fija el valor final.
- **Dos pollings** (match-stats + live events): mantener el render incremental para no
  degradar el rendimiento móvil.

## Fases de implementación

1. Modelo `liveevents` + `deriveEvents` + scraper (+ tests).
2. Endpoints `/api/live/events` + índices (+ tests).
3. `js/liveV2.js` reducer/fold/clasificación (+ tests).
4. Pantalla dinámica + animación + motivo (render incremental).
5. Reproductor temporal.
6. Docs + bump de versiones + rollout.
