# Informe Exhaustivo de Análisis: `api-porra` y `porra-spa`

> **Fecha del análisis**: 30 de agosto de 2026  
> **Objetivo**: Identificar inconsistencias, problemas de seguridad, discrepancias con `AGENTS.md`, fallos lógicos y áreas de mejora entre el backend (`api-porra`) y el frontend (`porra-spa`) para su posterior resolución.

---

## 1. Resumen Ejecutivo

Ambos repositorios forman una arquitectura desacoplada orientada a una Single Page Application (SPA) móvil-vertical conectada a una API REST en Node.js puro con MongoDB Atlas. 

Aunque la arquitectura general está bien planteada (sistema de fases, ETag 304, JWT en localStorage, modelo de datos unificado), existen **inconsistencias críticas de seguridad, discrepancias entre las especificaciones documentadas en `AGENTS.md` y el código real, y bugs lógicos sutiles en el cálculo de clasificaciones y eliminatorias**.

---

## 2. Inconsistencias Críticas entre `AGENTS.md` y el Código Real

### 2.1. `PUT /api/predictions` NO bloquea si `predictionsConfirmed = true`
- **Documentación (`api-porra/AGENTS.md`)**:
  > *"Guardar predicciones de un usuario (username, predictions). Bloqueado si predictionsConfirmed=true"*
- **Realidad en código (`api-porra/server.js:691-778`)**:
  El endpoint `PUT /api/predictions` comprueba la fase del juego (`FASE_PRETEMPORADA` vs fases posteriores), pero **nunca comprueba si `user.predictionsConfirmed === true`**.
- **Impacto**: Un usuario que ya haya confirmado sus 144 pronósticos con `POST /api/predictions/confirm` puede seguir enviando peticiones `PUT` directas y sobreescribir sus predicciones durante la pretemporada.
- **Solución recomendada**: En `server.js` dentro de `PUT /api/predictions`:
  ```javascript
  if (user.predictionsConfirmed) {
    sendJson(req, res, 403, { ok: false, error: 'Los pronósticos de liga ya han sido confirmados y están bloqueados' });
    return;
  }
  ```

---

### 2.2. Inconsistencia en documentación de `GET /api/auth/profile`
- **Documentación (`api-porra/AGENTS.md`)**:
  > *"GET /api/auth/profile (usa el token JWT; NO acepta ?username=)"*
- **Realidad en código (`api-porra/server.js:1155`)**:
  La ruta de ayuda por defecto en el root de la API sigue listando:
  `getProfile: 'GET /api/auth/profile?username=xxxx'` y `getSquad: 'GET /api/squad?username=xxxx'`.
- **Solución recomendada**: Actualizar el JSON de endpoints devuelto por la ruta por defecto (`/`) en `server.js`.

---

### 2.3. Validación de Plantilla Ideal en Backend (`saveSquad`)
- **Documentación (`porra-spa/AGENTS.md` y `api-porra/AGENTS.md`)**:
  > *"Plantilla compuesta por un total de 25 jugadores: 3 porteros (G), 8 defensas (D), 8 centrocampistas (M) y 6 delanteros (F). No más de un jugador del mismo club."*
- **Realidad en código (`api-porra/api/auth.js:177-204`)**:
  La función `saveSquad` únicamente comprueba que `squad` sea un Array y que no haya clubes repetidos (`uniqueTeams.size === teams.length`). **No valida que el tamaño sea exactamente 25 ni que cumpla la formación 3-8-8-6**.
- **Impacto**: Una llamada manual al API permite registrar plantillas ilegales (ej. 11 delanteros o 50 jugadores).
- **Solución recomendada**: Validar en `saveSquad` la longitud y el conteo por posición (`G===3, D===8, M===8, F===6`).

---

### 2.4. Control de privacidad de `GET /api/squad/all`
- **Documentación (`api-porra/AGENTS.md`)**:
  > *"GET /api/squad/all - Obtener plantillas de todos los usuarios (para cálculo de puntos)"*
- **Código en `server.js:948-955`**:
  ```javascript
  if (isPublic || !auth.ok) {
    query = User.find({}, 'username squad');
  } else {
    query = User.find({ username: auth.username }, 'username squad');
  }
  ```
- **Fallo**: Si una petición llega en pretemporada **sin cabecera Authorization** (`!auth.ok`), entra por el `if` y **devuelve las plantillas de todos los usuarios**, saltándose la privacidad de pretemporada.
- **Solución recomendada**: Si `!isPublic`, requerir obligatoriamente `auth.ok`, o devolver `{ ok: true, squads: {} }` si no está autenticado.

---

## 3. Vulnerabilidades y Problemas de Seguridad

### 3.1. Endpoint `DELETE /api/match-stats/:eventId` desprotegido
- **Ubicación (`api-porra/server.js:1068-1085`)**:
  El endpoint `DELETE /api/match-stats/:eventId` **no tiene verificación de autenticación ni de permisos de administrador (`verifyAdmin`)**.
- **Impacto**: Cualquier persona o script externo en Internet puede enviar un `DELETE /api/match-stats/12345` y borrar estadísticas de partidos en MongoDB Atlas sin token.
- **Solución recomendada**: Añadir verificación de administrador:
  ```javascript
  const admin = await verifyAdmin(req);
  if (!admin) {
    sendJson(req, res, 403, { ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
    return;
  }
  ```

---

### 3.2. Validación de Username en `register` (`api/auth.js` vs `middleware.js`)
- **Ubicación (`api-porra/api/auth.js:23-77` y `api-porra/server.js:331-336`)**:
  `server.js` ejecuta `validateUsername(body.username)`, pero `register()` en `api/auth.js` solo comprueba `username.length < 3`. Si en tests o scripts auxiliares se llama a `register()` directamente, pueden crearse usuarios con espacios, caracteres especiales o inyecciones.
- **Solución recomendada**: Incorporar `validateUsername` dentro de `register()` en `api/auth.js`.

---

### 3.3. Configuración de CORS rígida para entornos Vercel Preview
- **Ubicación (`api-porra/server.js:226-241`)**:
  `setCorsHeaders` solo permite `localhost:*` y el dominio fijo de producción `https://porra-spa.vercel.app`. Cualquier despliegue de preview de Vercel (`https://porra-spa-git-*.vercel.app` o `https://porra-spa-*.vercel.app`) es bloqueado por CORS.
- **Solución recomendada**: Permitir dominios que terminen en `.vercel.app` para el proyecto de porra:
  ```javascript
  if (origin && (origin === FRONTEND_URL || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  ```

---

## 4. Bugs Lógicos y Discrepancias de Algoritmo

### 4.1. Bug en `calculatePredictedStandings()` en `porra-spa/js/main.js`
- **Ubicación (`porra-spa/js/main.js:5633-5634`)**:
  Al calcular la clasificación pronosticada del usuario actual para desempatar por el criterio de rivales (criterios 6-8):
  ```javascript
  // LÍNEAS 5633-5634 (ERRÓNEO):
  const aRivals = getRealRivalsStats(a.teamId, statsCache);
  const bRivals = getRealRivalsStats(b.teamId, statsCache);
  ```
  Está llamando a `getRealRivalsStats` (que consulta `AppState.matchStats` reales) en lugar de `getRivalsStats(a.teamId, statsCache)` (que consulta las predicciones del usuario).
- **Impacto**: Si dos equipos empatan en puntos, DG, GF, etc. en el pronóstico, el criterio 6-8 de desempate se calcula con partidos reales en vez de con los partidos pronosticados.
- **Solución recomendada**: Cambiar `getRealRivalsStats` por `getRivalsStats` en esa función.

---

### 4.2. Discrepancia de Desempate Final: Backend vs Frontend
- **Backend (`api-porra/server.js:146`)**:
  En `calculateUserStandings`: si dos equipos empatan en todos los 9 criterios UEFA, la función devuelve `0` (orden no determinista o según orden de iteración).
- **Frontend (`porra-spa/js/main.js:5039-5041`, `5394-5396`, `5549-5551`)**:
  Si dos equipos empatan en los 9 criterios, desempata por orden alfabético: `aName.localeCompare(bName)`.
- **Impacto**: En casos de empate idéntico entre dos equipos, el backend y el frontend podrían calcular posiciones 1-24 distintas (ej. posición 8 vs 9), afectando a si un equipo pasa o no directamente a octavos o a qué grupo pertenece en `finalPredictions`.
- **Solución recomendada**: Sincronizar el desempate alfabético en el backend (`server.js`).

---

### 4.3. Validación de Grupos de Posición en `finalPredictions` con pronósticos incompletos
- **Backend (`api-porra/server.js:898`)**:
  ```javascript
  if (standings && standings.length >= 24) {
    const violations = getFinalPredictionsViolations(fp, teamPositionMap);
    if (violations.length > 0) { ... }
  }
  ```
- **Fallo**: Si el usuario no ha completado los 144 pronósticos (por ejemplo, ha rellenado 20 partidos), `standings.length` puede ser menor a 24. El backend se salta la validación `getFinalPredictionsViolations` y permite guardar combinaciones ilegales de eliminatorias.
- **Solución recomendada**: Requerir que la clasificación pronosticada esté completa antes de guardar `finalPredictions`, o validar contra los equipos presentes.

---

### 4.4. Índice de Mongoose en `MatchStats.js`
- **Ubicación (`api-porra/db/models/MatchStats.js:18`)**:
  `lastUpdated: { type: Date, default: Date.now, index: -1 }`
  En Mongoose, definir `index: -1` en las opciones del campo es una sintaxis anómala (suele ser `index: true` o a nivel de esquema `matchStatsSchema.index({ lastUpdated: -1 })`).
- **Solución recomendada**: Declarar el índice descendente explícitamente:
  ```javascript
  matchStatsSchema.index({ lastUpdated: -1 });
  ```

---

## 5. Inconsistencias en el Frontend (`porra-spa`)

### 5.1. Cache-Busting y Control de Versiones
- En `porra-spa/index.html`:
  - `styles.css?v=81`
  - `main.js?v=117`
  - `eliminatorias.js?v=6`
  - `cacheStore.js?v=1`
  - `apiData.js?v=1`
  - `stats.js?v=3`
  - `fasesFechas.js?v=2`
  - `hoyPartidos.js?v=1`
- **Riesgo**: Varios scripts tienen versiones bajas (`?v=1`, `?v=2`) y si se modifican sin incrementar la versión en `index.html`, los clientes móviles mantendrán versiones cacheadas obsoletas.

---

### 5.2. Manejo de Errores en `fetchWithPhase`
- **Ubicación (`porra-spa/js/main.js:87-112`)**:
  Cuando `fetchWithPhase` detecta `409 PHASE_CHANGED`, muestra el modal y recarga tras 3 segundos. Sin embargo, devuelve `new Response(...)` que el código llamador a veces no captura si espera campos específicos (ej. `data.predictions`), lo que podría provocar errores transitorios en consola antes del reload.

---

### 5.3. Tamaño del archivo `main.js` (Más de 6.200 líneas)
- `porra-spa/js/main.js` concentra más de 230 KB de código en un único fichero monolítico: estado global, routing, DOM rendering de todas las pestañas, modales, cálculos de puntos y autenticación.
- **Riesgo para agentes de IA**: Los agentes pueden perder contexto o cometer errores al editar bloques grandes debido al tamaño del archivo.
- **Recomendación**: Modularizar progresivamente en ficheros auxiliares (ej. `js/standings.js`, `js/squad.js`, `js/points.js`).

---

## 6. Lista Priorizada de Tareas para Próximos Agentes

| Prioridad | Tarea | Fichero(s) | Descripción |
|---|---|---|---|
| **ALTA (P0)** | Proteger `DELETE /api/match-stats/:eventId` | `api-porra/server.js` | Exigir `verifyAdmin` para evitar borrado anónimo de datos. |
| **ALTA (P0)** | Bloquear `PUT /api/predictions` si confirmado | `api-porra/server.js` | Comprobar `if (user.predictionsConfirmed)` y responder 403. |
| **ALTA (P0)** | Corregir cálculo de rivales en `calculatePredictedStandings` | `porra-spa/js/main.js` | Cambiar `getRealRivalsStats` por `getRivalsStats` en L5633-5634. |
| **ALTA (P0)** | Corregir fuga de privacidad en `GET /api/squad/all` | `api-porra/server.js` | En pretemporada, requerir `auth.ok` obligatoriamente. |
| **MEDIA (P1)** | Añadir validación completa en `saveSquad` | `api-porra/api/auth.js` | Validar 25 jugadores y formación 3-8-8-6 en backend. |
| **MEDIA (P1)** | Sincronizar desempate alfabético en backend | `api-porra/server.js` | Añadir `localeCompare` como 10º criterio en `calculateUserStandings`. |
| **MEDIA (P1)** | Corregir índice Mongoose en `MatchStats` | `api-porra/db/models/MatchStats.js` | Declarar `matchStatsSchema.index({ lastUpdated: -1 })`. |
| **MEDIA (P1)** | Validar username dentro de `register()` | `api-porra/api/auth.js` | Asegurar integridad en cualquier vía de llamada. |
| **BAJA (P2)** | Actualizar CORS para preview URLs de Vercel | `api-porra/server.js` | Permitir subdominios dinámicos de Vercel. |
| **BAJA (P2)** | Actualizar descripción de endpoints en `/` | `api-porra/server.js` | Quitar parámetros query obsoletos en la info de bienvenida. |
| **BAJA (P2)** | Modularización de `main.js` | `porra-spa/js/` | Separar cálculo de puntos y standings en módulos independientes. |
