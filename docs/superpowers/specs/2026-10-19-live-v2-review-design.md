# Design: Live v2 — revisión, corrección y mejoras por fases

## Resumen

Auditoría del Live 2.0 (front `porra-spa` + back `api-porra`) y plan de mejora en
tres fases desplegables por separado:

1. **Corrección + seguridad**: que los puntos live no sean incorrectos por orden,
   estado, reloj o anulaciones; cerrar la XSS del avatar; aislar el simulador.
2. **UI / usabilidad**: estado y minuto por partido, abreviaturas únicas, estado de
   actualización/error, motivo fiable, accesibilidad y salida de pantalla completa.
3. **Rendimiento / operación**: scraper con menos peticiones y protegido; endpoint
   con ETag barato, una sola query, caché de cuerpo y límites.

Se mantiene la arquitectura actual (log de eventos `liveevents` + plegado en el
cliente) con dos cambios estructurales: **orden determinista** y **resync
auto-reparable**. La UI del Live se extrae de `main.js` a `js/live-v2-ui.js`.

## Objetivos

- Ningún partido `NS` mueve la clasificación.
- Un expulsado no cobra portería a cero.
- Un gol anulado revierte gol, marcador y asistencia.
- El orden de plegado es el mismo en todos los clientes y recargas.
- El reloj usa la hora del servidor y se congela en `FT`.
- Un evento insertado durante un poll no se pierde nunca.
- El simulador no puede mezclarse con el live real ni borrar matchstats reales.
- El avatar no puede ejecutar HTML.
- Scraper y endpoint reducen peticiones/CPU de forma medible.

## No-objetivos

- Prórroga y tanda de penaltis (fase de liga únicamente).
- Puntos autoritativos calculados en backend (se mantiene el cálculo en cliente).
- Cambiar la fuente de datos (Sofascore) ni el modelo de puntuación.
- Rediseño visual completo: la fase 2 ajusta lo necesario sobre el layout actual.

## Contexto de la auditoría

Hallazgos que motivan el diseño (prioridad alta):

- `main.js:2113` marca como `LIVE` todo partido no finalizado; `main.js:1988`
  evita puntuar solo si `status === 'NS'`, condición que nunca se cumple →
  un pronóstico 0-0 suma 15 puntos antes del kickoff.
- `liveV2.js:61` no saca del campo al expulsado → `minutesOf` sigue contando.
- `liveV2.js:47-59` no revierte asistencias al anular un gol.
- `liveV2.js:115` desempata solo por `ingestedAt`; eventos del mismo tick pueden
  plegarse en cualquier orden (marcador invertido o anulación perdida).
- `liveV2.js:84-94` deriva `kickoffTs` del primer estado observado (falla si el
  scraper arranca en descanso/2ª parte) y usa `Date.now()` (reloj del móvil).
- `api/liveEvents.js:106-114` + `scrapeLiveMatches.js:46`: `findGoalToCancel`
  recibe `teamId` indefinido y puede anular el gol del equipo contrario; falla si
  gol y VAR llegan en el mismo tick.
- `server.js:1280-1283`: `serverTime` es el máximo global, no el de los docs
  devueltos → el delta puede saltarse eventos para siempre.
- `main.js:2247`: `${r.avatar}` sin escapar en `innerHTML` → XSS almacenado.
- Simulador y scraper real comparten `liveevents`; `--force` borra `MatchStats`.
- Scraper: sin timeout/reintentos; ~4 endpoints/partido + 1 por portero cada 30 s.
- Endpoint: 2 queries + `JSON.stringify` + gzip por cliente; el 304 se decide
  después de consultar y serializar.

## Decisiones

- **Entrega por fases** independientes: 1 corrección+seguridad, 2 UI/usabilidad,
  3 rendimiento/operación.
- **Alcance de datos**: scraper real, fase de liga. Sin prórroga/tanda.
- **Corrección determinista** sobre la arquitectura actual (no autoridad en backend).
- **Extracción** de la UI del Live a `js/live-v2-ui.js`; la lógica pura sigue en
  `js/liveV2.js`.
- **Cursor y query única** entran en fase 1; el resto de rendimiento en fase 3.
- Spec espejo en `api-porra/docs/superpowers/specs/` (mismo contenido).

---

## 1. Contrato de eventos y orden determinista

### 1.1 Campos nuevos en `liveevents`

- `seq` (Number): índice de emisión **dentro del tick** (0..n), asignado por
  `deriveEvents` en el orden canónico. Persistido.
- `source` (`'scraper' | 'sim'`): origen del evento. Default `'scraper'`.
- `ts` ya existe; se calcula con minuto + tiempo añadido (ver 1.3).

Índices:

- único `{ eventId, sourceId }` (se mantiene).
- `{ eventId, ts }` para la carga de `existing` del scraper.
- `{ ingestedAt: 1 }` para el delta.

### 1.2 Orden canónico dentro de un tick

`deriveEvents` emite en este orden y asigna `seq` incremental:

1. `status`
2. `lineup`
3. `goal` / `own_goal`
4. `goal_cancelled`
5. `penalty_saved` / `penalty_missed`
6. `card`
7. `substitution`
8. `assist`
9. `rating`
10. `score`
11. `match_final`

`score` y `match_final` van al final porque son reconciliación absoluta.

### 1.3 `ts` con tiempo añadido

- 1ª parte: `ts = kickoff + (minute + addedTime) * 60s`.
- 2ª parte: `ts = kickoff + (minute + 15 + addedTime) * 60s`.
- `HT`: `ts = kickoff + 45 min`.
- `match_final` y `score`: `ts` = instante de observación del servidor, para que
  queden después de los eventos del tick.

El backend guarda `payload.minute` y `payload.addedTime` cuando existan.

### 1.4 Orden de plegado en el cliente

Orden total: `(ts, ingestedAt, seq, sourceId)`.

- `ts` primero: respeta la cronología real aunque un evento llegue tarde.
- `ingestedAt` separa ticks.
- `seq` desempata eventos del mismo tick (arregla A8).
- `sourceId` es el último desempate estable.

Además, el plegado aplica `score` y `match_final` **después** del resto de tipos
del mismo `ts`, como cinturón y tirantes.

### 1.5 Eventos absolutos y correcciones

- `rating`, `assist`, `score`, `final` son **absolutos** y pueden reemitirse.
  `sourceId` incluye el valor y `seq`, de modo que una secuencia A→B→A inserta el
  tercer evento y el plegado termina en A.
- `goal`, `own_goal`, `card`, `substitution`, `penalty_*` usan `sourceId` estable
  por incidencia (id de Sofascore).
- `assist` se emite cuando el contador **cambia** (sube o baja), no solo cuando
  sube. El cliente ya lo aplica como valor absoluto. Esto elimina la necesidad de
  revertir asistencias dentro de `goal_cancelled`.

---

## 2. Fase 1 — Corrección + Seguridad

### 2.1 Front (`js/liveV2.js`, `main.js` → nuevo `js/live-v2-ui.js`)

- **`NS` no puntúa**: `liveV2Rows` usa `folded.states[id].status`; solo `LIVE`,
  `HT` y `FT` entran en el cálculo de puntos. `NS` se muestra como "próximo" en
  los chips, sin puntos.
- **Rojas**: `card` con `cardType` roja o segunda amarilla fija `onPitch = false` y
  `offMinute`; `minutesOf` deja de contar desde ese minuto.
- **VAR**: `goal_cancelled` revierte marcador y goles; la asistencia se corrige
  con el evento `assist` absoluto que emite el backend. El `goal` guarda
  `assistPlayerIds` para trazabilidad.
- **Reloj**: `matchClockAt` usa `serverTime` (hora del servidor) en vez de
  `Date.now()`; usa `kickoffTs` del partido, no el primer estado observado; se
  congela en `FT`/`match_final`; respeta periodo y añadido.
- **Carga completa autoritativa**: una carga full reemplaza el estado y limpia
  `_seenEventIds`, `_chipChanged`, `_chipScores` y `prevRanks`.
- **Resync**: full cada 10 min y al volver a `visible`; también si el delta
  devuelve `resync: true`.
- **Pantalla completa**: la salida (`⤡`) se mantiene visible durante skeleton y
  errores; `Escape` y `popstate` salen; en error de render se ofrece un botón de
  salida de emergencia.

### 2.2 Backend (`api/liveEvents.js`, `scrapeLiveMatches.js`, `server.js`)

- **`findGoalToCancel`**: cargar `teamId` en la proyección de `existing`;
  procesar incidencias en orden ascendente (gol antes que su anulación); mismo
  tick resuelto por `seq`; devolver `assistPlayerIds` para el payload del gol
  (trazabilidad, no para revertir); si el gol no está en el log, emitir la
  anulación con los datos del incidente.
- **`assist` absoluto** (ver 1.5): emitir altas y bajas.
- **`score` reconciliación** al final del tick.
- **Cursor**: `serverTime = max(ingestedAt)` **de los docs devueltos**; eliminar
  la segunda query (`findOne` global). Si no hay docs, mantener el cursor.
- **Respuesta**: añadir `resync` cuando el cliente deba hacer full (delta
  demasiado grande o cursor inválido).
- **`source`**: `deriveEvents`/inserción etiquetan `scraper`; el simulador,
  `sim`. El scraper real lee `{ source: { $ne: 'sim' } }` (incluye docs antiguos
  sin el campo).

### 2.3 Seguridad

- **XSS**: escapar todo campo remoto con un único helper `esc()` en
  `liveV2RowHtml` (incluido `avatar`). Validar el avatar en
  `POST /api/auth/profile`: emoji o URL `https://` (defensa en profundidad).
- **CORS**: allowlist exacta de orígenes + `Vary: Origin`. No aceptar
  `http://localhost.evil.com`.
- **Rate limit**: clave basada en IP real (`trust proxy`); límite específico para
  el `full`.
- **JWT**: en producción, fallar al arrancar si `JWT_SECRET` es el placeholder.
- **`GET /api/live/events`**: público, pero filtrado a la ventana live, con
  `limit` y rate limit; documentado como datos no sensibles.

### 2.4 Aislamiento del simulador

- `source: 'sim'` en todos los eventos del simulador.
- El scraper real nunca lee `sim`.
- La API devuelve todo salvo `sim` por defecto; `?source=sim` solo fuera de
  producción.
- `--force` exige `--yes`; se niega si la DB no es `test` salvo `--allow-prod`.
- `--force` **no** borra `MatchStats` salvo `--force-matchstats` explícito.

### 2.5 Scraper (mínimo de fase 1)

- Timeout por petición (8 s), 2 reintentos con backoff + jitter, circuit breaker.
- Log estructurado de errores (sin silenciar `/incidents`/`/fantasy`).
- El tick nunca queda colgado por una petición.

### 2.6 Tests fase 1

- `NS` no puntúa; `LIVE/HT/FT` sí.
- Roja deja de contar minutos; portero expulsado no cobra portería a cero.
- VAR: gol anulado revierte marcador y asistencia (evento absoluto).
- Orden same-tick: `goal`+`goal_cancelled`, `goal`+`score`, `score` antes/después.
- Reloj: arranque en `HT`/2ª parte, añadido, congelado en `FT`, sin depender del
  reloj del dispositivo.
- `findGoalToCancel` con `teamId` y mismo tick.
- Cursor: no pierde el evento insertado entre query y cálculo.
- Escape de avatar; `sim` no aparece en el live real.

---

## 3. Fase 2 — UI / Usabilidad

- **Chips por partido**: `NS`, `LIVE 63'`, `HT`, `FT`; color/borde por estado;
  nombre completo accesible (`title`/`aria-label`); minuto visible.
- **Abreviaturas únicas**: mapa curado (`MCI/MUN`, `BET/RMA`…) en
  `data/teams.json` o `data/teamCodes.json`, con fallback al algoritmo.
- **Cabecera**: "Actualizado hace Xs"; banner de error/sin conexión con
  **Reintentar**; estado "sin partidos en directo"; fuera el "EN DIRECTO"
  permanente.
- **Motivo**: explicar el evento concreto y el delta atribuible; cubrir `score`,
  `match_final` y sustituciones; no usar el delta total del poll.
- **Feed**: filtrar antes de recortar; mostrar 3–5 eventos; ampliable.
- **Accesibilidad**: `aria-live` en clasificación/motivo/feed; tabs con
  `role="tab"`/`aria-selected`; objetivos ≥44 px; texto de equipos 10–11 px;
  permitir zoom; contraste en chips `FT`.
- **Pantalla completa**: ancho contenido a la app, salida siempre visible y
  accesible por teclado/gesto.

---

## 4. Fase 3 — Rendimiento / Operación

### 4.1 Scraper (de ~60 a ~10–15 req/min)

- **Tick barato**: `/event/{id}` siempre; `incidents` solo si cambió el marcador o
  el minuto; `lineups` una vez al inicio + sustituciones; `fantasy`/`statistics`
  con TTL (60 s / 10 min).
- **Quitar la petición por portero** del bucle: derivar de `incidents` o cachear.
- **Caché condicional** (`If-None-Match`/`If-Modified-Since`) o TTL por
  `eventId+endpoint`.
- **Concurrencia acotada** (3–4) + timeout + retries + backoff + jitter.
- **Escrituras por lote**: una query de `existing` para todos los partidos y un
  `bulkWrite`/`insertMany(ordered:false)` por tick.
- **Saltar sin cambios**: hash de `(estado, minuto, marcador, rojas, incidencias)`.
- **Calendario** refrescado cada 10 min; **lock de líder** si hay varios procesos.

### 4.2 Endpoint `/api/live/events`

- **ETag por versión antes de Mongo**: `liveEventsVersion` monótona (contador o
  `max(seq)` cacheado). Si `If-None-Match` coincide → 304 sin query ni
  serialización.
- **Una query**: `serverTime` de los docs devueltos.
- **Proyección + límite + ventana**: excluir `_id`/`expireAt`/`ingestedAt` del
  payload; `?eventId`; `limit`.
- **Caché de cuerpo**: `JSON.stringify` + gzip una vez por versión (LRU).
- **`Cache-Control`** corto (`max-age = liveRefreshSecs − 2`) + `Vary`.
- **Delta acotado** con señal de full si el cliente va muy atrasado.
- **Front**: cachear el último full en memoria y usar `?since`; full solo en
  resync.

### 4.3 Operación

- Logs estructurados; health `lastScrapeAt`; badge "datos obsoletos" si el tick
  no avanza.
- TTL calculado sobre el **día del partido** (`ts`), no sobre el día de ingesta
  (evita borrar a mitad de un partido que cruza medianoche).
- Creación/verificación de índices al arrancar (o en CI).
- Rate limit por IP real; CORS exacto; secretos por entorno.

---

## 5. Testing

- Lógica pura (`js/liveV2.js`): casos de fase 1 y orden determinista.
- Backend (`api/liveEvents.js`): `deriveEvents`, `findGoalToCancel`, `assist`
  absoluto, `ts` con añadido, cursor.
- Integración manual con el simulador: 5 partidos, comprobar chips, orden,
  puntos, motivo, audio, fullscreen y error de red simulado.
- `node --test tests/*.test.js` en ambos repos antes de cada commit.

## 6. Criterios de aceptación

1. Un partido `NS` no mueve la clasificación.
2. Un expulsado no cobra portería a cero.
3. Un gol anulado quita gol y asistencia; el marcador no depende del orden de
   llegada.
4. El reloj coincide con el minuto real (±1) y se congela en `FT`.
5. Un avatar con HTML no ejecuta nada.
6. Un evento insertado durante un poll no se pierde (resync).
7. El simulador no aparece en el live real y `--force` no borra matchstats reales.
8. Scraper y endpoint muestran la reducción esperada de peticiones/CPU.
9. `node --test` verde en ambos repos.

## 7. Riesgos y mitigación

- **Datos antiguos sin `seq`/`source`**: TTL diario; defaults (`seq: 0`,
  `source: 'scraper'`) y el orden sigue siendo determinista.
- **Índices**: crearlos/verificarlos al desplegar; si hay duplicados previos,
  limpiar antes de `syncIndexes`.
- **Simulación en prod**: guardia de entorno + `source` + `--yes`.
- **Regresión de UI al extraer el módulo**: la extracción va al final de la fase 1
  con los mismos tests y verificación manual.
- **Medición**: comparar req/min del scraper y latencia/CPU del endpoint antes y
  después de la fase 3.

## 8. Repos, ramas y rollout

- `porra-spa` y `api-porra`, rama `feature/live-v2` hasta cerrar la fase 1.
- Spec espejo en ambos repos.
- Cada fase se puede desplegar por separado; la fase 1 es la única bloqueante
  para usar el Live con datos reales.
- Planes de implementación por repo se generan con `writing-plans` a partir de
  este spec.
