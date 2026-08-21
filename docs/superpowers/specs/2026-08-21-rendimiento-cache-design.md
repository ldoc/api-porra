# Diseño: Rendimiento y reducción de tráfico (api-porra + porra-spa)

**Fecha:** 2026-08-21
**Estado:** Propuesto (pendiente aprobación)
**Repositorios afectados:** `api-porra` (backend), `porra-spa` (frontend)
**Referencias:** [`porra-spa/docs/rendimiento-analisis.md`](../../../porra-spa/docs/rendimiento-analisis.md) (análisis previo 2026-08-13, hallazgos compatibles incorporados)

---

## 1. Contexto y problema

La app re-descarga repetidamente los mismos datos:

| Problema | Impacto actual |
|---|---|
| `GET /api/match-stats` sin ETag/304 ni delta | ~1.3 MB raw (144 partidos × ~40 jugadores) re-descargados en cada navegación tras TTL de 30 s |
| `GET /predictions/all` sin ETag | ~178 KB raw con 25 usuarios, misma cadencia |
| Cache-busters `?t=Date.now()` en `/config` y `/players` | Anulan la caché HTTP/CDN deliberadamente |
| Polling: al detectar cambio → refetch **completo** de match-stats | MBs por cada partido nuevo publicado |
| `GET /api/match-stats/:eventId` scrapea Sofascore siempre | 6-8 peticiones upstream por llamada aunque el dato esté en Mongo |
| `getFaseJuego()` consulta Atlas 2-3× por request | Latencia añadida en cada endpoint |
| Reglas `Cache-Control` de `vercel.json` rotas (falta `/` inicial en `source`) | Todo `data/*` se sirve con `max-age=0, must-revalidate` en producción |
| Sin caché persistente en cliente | Cada arranque en frío re-descarga ~400 KB+ (JS/CSS/JSON/API) |

**Restricciones aceptadas:**
- Despliegue conjunto front+back permitido (se puede romper compatibilidad, aunque el diseño evita necesitarlo).
- < 30 usuarios: el cálculo de puntos en cliente sigue siendo viable.
- **Vercel serverless**: nada puede asumir proceso long-lived (memoria compartida, timers, crons propios).

## 2. Objetivos

1. Reducir >90 % los bytes transferidos en uso habitual (navegación entre tabs, arranque tibio, polling sin novedades).
2. **Frescura garantizada**: el usuario siempre ve la última información disponible (revalidación en background + ticker ligero + deltas).
3. Compatibilidad 100 % con Vercel serverless: todo el estado vive en Mongo o en el cliente.
4. Orden de despliegue irrelevante (frontend tolerante con backend antiguo y viceversa).

## 3. No objetivos (explícitamente fuera de alcance)

- Mover el cálculo de puntos al backend.
- Code-splitting de `main.js`, service worker/PWA, minificación con build step.
- WebSockets/SSE (problemáticos en serverless; el polling del ticker es la opción correcta aquí).
- Rate limiting distribuido.
- Recálculos O(n²) del render (`calculateUserTotalPoints`, etc.) — futuro.
- Conversión PNG→WebP de imágenes, optimización de fonts, CLS — candidatos para un diseño posterior (ver análisis previo).

---

## 4. Diseño backend (`api-porra`)

### B1. ETag débil + 304 en `sendJson()`

- Calcular hash SHA-1 (crypto nativo) del **string JSON antes de comprimir** → cabecera `ETag: W/"<hash>"` en todos los GET JSON.
- Si la petición trae `If-None-Match` que coincide (parsear lista de ETags, comparación débil) → responder **304 sin cuerpo**, conservando las cabeceras de caché.
- No aplica a POST/PUT/DELETE ni a errores 4xx/5xx.
- Nota: Vercel comprime con Brotli en el edge; al calcular el ETag sobre el JSON sin comprimir, el hash es independiente del transporte.
- El navegador revalida solo con `fetch()` (caché HTTP estándar): cero cambios de contrato para el cliente.

### B2. Delta en `GET /api/match-stats`

- Nuevo query param `since` (fecha ISO): filtra `{ lastUpdated: { $gt: new Date(since) } }`.
- La respuesta añade `serverTime` (timestamp del servidor); el cliente lo usará como próximo `since` (**nunca** `Date.now()` del cliente, para tolerar relojes desfasados).
- `since` malformado → 400. Ausente → comportamiento actual (scripts/admin no se rompen).
- Añadir índice `{ lastUpdated: -1 }` al modelo MatchStats (colección pequeña, pero barato y ya recomendado).

### B3. Scrapeo cache-first en `GET /api/match-stats/:eventId`

- Leer Mongo primero. Si el doc existe:
  - `?force=1` (admin) → re-scrapeo incondicional.
  - `statusType === 'finished'` → servir siempre de Mongo (nunca re-scrapear).
  - En vivo o estado desconocido → servir si `lastUpdated` < 90 s; si no, re-scrapear y upsert.
- Extender `scrapMatchStats()` para persistir `statusType` (estado del evento según Sofascore) junto a `stats`. Docs antiguos sin `statusType` se tratan como desconocidos (TTL 90 s, conservador).
- Beneficio directo aunque el SPA no use hoy este endpoint: elimina el riesgo de bloqueo por Sofascore y lo deja listo para uso futuro.

### B4. Deduplicación request-scoped de `getFaseJuego()`

- `checkPhaseConsistency()` ya lee la fase: propagarla en el objeto request (p. ej. `req.faseJuego`) para que los handlers no reconsulten Atlas. Sin memoria entre requests → serverless-safe.
- Opcional: `Cache-Control: public, max-age=0, s-maxage=60` en `GET /api/config` para caché en el Edge de Vercel (endpoint público; el flujo existente `PHASE_CHANGED` 409 actúa de red de seguridad ante desfases).

### B5. Limpiezas (del análisis previo)

- Eliminar `octokit` (dependencia muerta).
- `.lean()` + proyecciones (`-_id -__v -passwordHash -clave`) en lecturas masivas: `predictions/all`, `squad/all`, `match-stats`, `players`.
- Verificar/excluir `sharp` y `scripts/` del bundle de la función serverless (cold starts).

---

## 5. Diseño frontend (`porra-spa`)

### F1. Eliminar cache-busters

- Quitar `?t=Date.now()` de `GET /config` y `GET /players` → URLs estables para que ETag/304 funcionen. La frescura la da la revalidación automática.

### F2. SWR con localStorage para payloads pesados

- Helpers `cacheGet/cacheSet` (localStorage, claves versionadas: `porra_cache_matchstats_v1`, `porra_cache_predall_v1`).
- **match-stats**: pintar al instante desde localStorage; en background `GET /api/match-stats?since=<serverTime guardado>` → merge delta → si hubo cambios, recalcular puntos y re-render. Guardar `serverTime` junto al payload.
- **predictions/all**: pintar desde localStorage + revalidar en background (304 ≈ gratis si no cambió).
- Tolerancia: payload corrupto → try/catch → descarga completa. No guardar si el JSON supera ~2 MB (quota); capturar `QuotaExceededError` purgando las claves propias.
- Invalidación: tras `PUT` propios (predictions/squad/final-predictions) limpiar las claves afectadas (equivalente a la invalidación de TTLs actual).

### F3. Deduplicación de peticiones en vuelo

- Mapa `inflight[clave] → Promise` compartido en `fetchAllPredictions`, `fetchMatchStats`, `fetchPlayers`; se elimina al resolverse. Evita los dobles fetch por cambios rápidos de tab.

### F4. Polling adaptativo + delta

- Ticker `GET /api/match-stats/updated` cada 60 s con pestaña visible (igual que hoy; <100 B).
- Adaptativo: si `calendar.json` (local) no tiene ningún partido en las próximas 24 h → intervalo de 5 min.
- Al detectar cambio: `GET /api/match-stats?since=...` (delta) en vez de refetch completo; merge + re-render + toast (UX actual intacta).
- Tolerancia de despliegue: si el backend aún no soporta `since` (devuelve todo), el merge es idempotente → funciona igual.

### F5. `squadsCache` con expiración

- Guardar timestamp junto a cada plantilla ajena; expira a los 5 min (hoy no expira nunca y puede mostrar datos obsoletos indefinidamente).

### F6. Fix de `vercel.json` (del análisis previo)

- Añadir la `/` inicial a los `source` de `data/imgJugadores/(.*)`, `data/imgEquipos/(.*)` y `data/(.*)\.json` para que las reglas de caché matcheen de verdad. Verificar con `curl -I` tras redeploy.

---

## 6. Flujos resultantes

| Escenario | Antes | Después |
|---|---|---|
| Navegar Clasificación → Resultados → Estadísticas | Refetch completo (MBs) tras 30 s de TTL | 0 bytes (304) o nada (datos en memoria) |
| Arranque en frío (2ª visita) | ~400 KB+ | Pintado instantáneo desde localStorage + revalidación (headers) |
| Partido nuevo publicado | Ticker 100 B + refetch ~1.3 MB | Ticker 100 B + delta ~15-25 KB |
| Día sin partidos | Ticker cada 60 s | Ticker cada 5 min |
| `match-stats/:eventId` repetido | 6-8 upstream a Sofascore | 0 (servicio de Mongo) |

## 7. Errores y casos límite

- **304**: el navegador lo gestiona; `fetch` resuelve ok con cuerpo vacío → mantener datos existentes.
- **localStorage corrupto/ausente**: ignorar y descargar completo (fail-open).
- **Reloj del cliente desfasado**: `since` proviene siempre de `serverTime` del backend.
- **Delta vacío**: sin re-render.
- **`PHASE_CHANGED` 409**: flujo existente intacto.
- **Multi-dispositivo**: la revalidación en background corrige cualquier staleness local en ≤ 1 round-trip.

## 8. Testing

- **Backend**: tests node unitarios nuevos para (a) generación/comparación de ETag, (b) filtro `since` (mock de `Model.find`). Los tests existentes deben seguir pasando.
- **Verificación manual con curl**: 1ª petición 200 + ETag → 2ª con `If-None-Match` → 304; `?since=` devuelve solo partidos posteriores; `:eventId` dos veces → la 2ª sin tráfico upstream (latencia de Mongo).
- **Frontend**: los ~23 ficheros de tests node existentes siguen pasando; añadir tests unitarios para merge de delta y helpers de caché SWR (módulos puros exportables).
- **Producción**: DevTools Network — navegación entre tabs sin body (304); 2º arranque sin descarga masiva; `curl -I` a `data/*.json` mostrando `max-age` correcto.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Quota de localStorage en dispositivos limitados | Cap ~2 MB + captura de `QuotaExceededError` con purga de claves propias |
| Coste CPU del SHA-1 sobre payloads ~1 MB por request | Sub-milisegundo en lambda; aceptable. Alternativa futura: ETag derivado de `max(lastUpdated)` |
| Desfase de despliegue front/back | Front tolerante: `since` no soportado → respuesta completa → merge idempotente; ETag es transparente |
| Edge cache de `/api/config` sirviendo fase vieja ≤ 60 s | Aceptable: `X-Client-Phase` + 409 `PHASE_CHANGED` ya resuelven el desfase |

## 10. Criterios de éxito

1. Segunda visita consecutiva a Clasificación/Resultados/Estadísticas transfiere 0 bytes de body (304).
2. Arranque en frío repetido transfiere < 50 KB de API (vs ~400 KB+ actual).
3. Publicación de un resultado mueve ~15-25 KB (delta), no ~1.3 MB.
4. `GET /api/match-stats/:eventId` repetido no genera tráfico a Sofascore.
5. Ningún cambio visible de UX: toasts, tiempos de refresco y flujos actuales se mantienen.
