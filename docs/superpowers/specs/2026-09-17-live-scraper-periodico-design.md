# Live — Scrapeo periódico a `livematches` (design)

Fecha: 2026-09-17 · Rama: `api-porra` `feature/live`
Estado: aprobado por el usuario en brainstorm

## 1. Objetivo

Rellenar la colección temporal `livematches` de MongoDB cada X tiempo para que
`porra-spa` (que ya lee `GET /api/live`) muestre el directo. El proceso corre en
**local**, lo lanza el usuario antes de los partidos y lo para con Ctrl+C.
No hay scheduler ni daemon separado: el propio script contiene el bucle.

Fuera de alcance: nueva información de scrapeo (tarjetas, etc.) y borrado de
docs de partidos aplazados/cancelados. El campo `stats` es `Mixed`, así que
añadir campos después no requiere tocar el bucle ni el schema.

## 2. `scripts/scrapeLiveMatches.js` (script continuo)

- Lee `data/sofascore/calendar.json` una vez y conecta Mongo una vez.
- Constante `INTERVAL_MS = 30_000` en la cabecera del fichero.
- Bucle:
  1. `selectLiveMatches(calendar, Date.now())` (ventana `[inicio−15min, inicio+120min]`).
  2. Si no hay partidos en ventana: log y dormir `INTERVAL_MS`.
  3. Por partido: `scrapMatchFull(eventId)`; si el estado es `null` (aún no
     empezado / no jugable) se omite; si no, `buildLiveDoc(...)` + `upsert` en
     `livematches`. Un error por partido se loguea y **no** corta el bucle.
  4. Log de resumen (`guardados/total`) y dormir `INTERVAL_MS`.
- **Optimización**: salta los partidos cuyo doc ya está en `FT` (evita
  re-scrapear un partido terminado durante el resto de la ventana).
- Flag `--once`: una sola pasada y sale (comportamiento one-shot actual, útil
  para probar; imprime `Partidos en ventana live: N` y `Guardados: k/N`).
- `SIGINT` (Ctrl+C): mensaje y salida limpia.

## 3. Estado real del partido (LIVE/HT/FT) + minuto

- `scripts/matchStats.js`: extraer `scrapMatchFull(eventId)` →
  `{ stats, statusType, minute }`, reutilizando la misma descarga (sin petición
  HTTP extra). `scrapMatchStats(eventId)` pasa a ser un envoltorio que devuelve
  solo `stats`, manteniendo intacto su contrato para `server.js` y tests.
  - `statusType` = `eventData.event.status.type` (crudo de Sofascore).
  - `minute` = `eventData.event.time.current ?? null`.
- `api/live.js`: añadir `liveStatusFromSofascore(statusType)` (pura):
  - `halftime` → `'HT'`
  - `finished` → `'FT'`
  - `inprogress` → `'LIVE'`
  - cualquier otro (`notstarted`, `willsoonstart`, `postponed`, `canceled`,
    `suspended`, `interrupted`) → `null` (no se escribe doc).
- El script no escribe doc cuando el estado es `null`, para no mostrar un
  partido como `EN JUEGO` antes de tiempo.

## 4. Modelo y documento

- `db/models/LiveMatch.js`: añadir `minute: { type: Number, default: null }`
  (el frontend ya lee `lm.minute` en `liveStatusLabel`). El enum actual
  `status: ['LIVE','HT','FT']` no cambia.
- `api/live.js` `buildLiveDoc(eventId, stats, status, nowMs, minute)` incorpora
  `minute`. `expireAt` sigue siendo 23:59:59 UTC del día; el índice TTL borra
  los docs a fin de día.

## 5. Operación

- Lanzar: `node --env-file=.env scripts/scrapeLiveMatches.js`.
- Para que `porra-spa` (prod) lo vea, `MONGODB_URI` del `.env` debe apuntar a
  `/prod`; con `/test` solo se ve en local.
- No hay limpieza manual: el TTL de Mongo borra `livematches` a fin de día UTC.

## 6. Tests

- `liveStatusFromSofascore`: mapeo de `halftime`/`finished`/`inprogress` y
  estados no jugables → `null`.
- `buildLiveDoc`: incluye `minute` (y sigue fijando `expireAt` a fin de día UTC).
- `selectLiveMatches`: ya cubierto por `tests/live.test.js`.
- El bucle infinito no se testea (se prueba con `--once`).

## 7. Interfaces

- `scrapMatchFull(eventId) -> { stats, statusType, minute }`
- `scrapMatchStats(eventId) -> stats` (sin cambios de contrato)
- `liveStatusFromSofascore(statusType) -> 'LIVE'|'HT'|'FT'|null`
- `buildLiveDoc(eventId, stats, status, nowMs, minute) -> doc`
- `LiveMatch.minute: Number|null`
