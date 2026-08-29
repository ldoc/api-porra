# Corrección de errores críticos — api-porra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar los crashes remotos del servidor, cerrar el endpoint sin autenticación y (opcional, requiere aprobación) reactivar las validaciones dormidas por la import assertion rota.

**Architecture:** Servidor HTTP nativo Node.js (`server.js`, handler async único) + módulos en `api/`. Sin frameworks. Despliegue: Vercel serverless → toda corrección debe ser agnóstica al entorno (nada de dependencias nuevas, nada que asuma proceso long-lived).

**Tech Stack:** Node.js ES Modules, Mongoose/MongoDB Atlas, jsonwebtoken, node:test.

## Global Constraints

- NO añadir dependencias npm.
- NO cambiar el formato de las respuestas HTTP existentes (el frontend depende de ellas).
- Compatibilidad con cualquier runtime Node de Vercel (20/22/24): prohibido `import(..., { assert }` y APIs experimentales.
- Verificación mínima por tarea: `node --check <archivo>` + suite de tests (`node --test tests/`).
- NO hacer commit salvo petición explícita del usuario.
- Tareas marcadas **[COMPORTAMIENTO]** activan validaciones documentadas en AGENTS.md que hoy están inactivas: requieren aprobación explícita del usuario antes de ejecutarse.

---

## FASE 1 — Correcciones seguras (sin cambio de comportamiento para usuarios legítimos)

### Task 1: Blindar el parseo de URL contra cabecera Host malformada [CRÍTICO]

**Files:**
- Modify: `server.js:290-291`

**Contexto:** `new URL(req.url, \`http://${req.headers.host}\`)` lanza `TypeError` si `Host` es inválido → rechazo no gestionado → muerte del proceso/invocación. Verificado empíricamente.

- [ ] **Step 1: Sustituir la línea 291 por parseo protegido**

```js
const server = http.createServer(async (req, res) => {
  let reqUrl;
  try {
    reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJson(req, res, 400, { ok: false, error: 'Cabecera Host inválida' });
    return;
  }
```

(el resto del handler queda igual; `reqUrl` ya está declarado arriba así que eliminar la declaración original de la línea 291)

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check server.js`
Expected: sin salida (OK)

---

### Task 2: Wrapper global try/catch del handler + red de seguridad de promesas [CRÍTICO]

**Files:**
- Modify: `server.js:290` (handler), y zona superior del fichero para `process.on`

**Contexto:** Cualquier excepción en endpoints sin try/catch (register, login, avatars/taken, players, predictions GET/PUT, confirm, final-predictions GET/PUT, squad GET) mata el proceso. Ejemplos explotables: `PUT /api/squad` con `{"squad":[null]}` (crash en `api/auth.js:191`), Mongoose CastError con IDs inválidos.

- [ ] **Step 1: Envolver el cuerpo completo del handler**

Renombrar el callback actual a función nombrada y envolverla:

```js
async function handleRequest(req, res, reqUrl) {
  // ... TODO el cuerpo actual del handler (desde setCorsHeaders hasta el sendJson por defecto) ...
}

const server = http.createServer(async (req, res) => {
  let reqUrl;
  try {
    reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJson(req, res, 400, { ok: false, error: 'Cabecera Host inválida' });
    return;
  }
  try {
    await handleRequest(req, res, reqUrl);
  } catch (err) {
    console.error('Error no gestionado en petición:', err);
    if (!res.headersSent) {
      sendJson(req, res, 500, { ok: false, error: 'Error interno del servidor' });
    } else {
      res.end();
    }
  }
});
```

Nota: `handleRequest` recibe `reqUrl` ya parseado (Task 1). El catch usa `sendJson` solo si no se han enviado cabeceras (evita ERR_HTTP_HEADERS_SENT).

- [ ] **Step 2: Añadir red de seguridad de promesas (junto a `server.listen`)**

```js
process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada no gestionada:', reason);
});
```

- [ ] **Step 3: Verificar sintaxis y tests**

Run: `node --check server.js && node --test tests/`
Expected: OK, 20+ tests pasan

- [ ] **Step 4: Smoke test manual (opcional, requiere .env con Mongo)**

```bash
node server.js & sleep 2
curl -s -o /dev/null -w "%{http_code}" --header "Host: ///evil" http://localhost:3000/api/config   # esperado 400
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/config                            # esperado 200
kill %1
```

---

### Task 3: Guardia anti-null en saveSquad [ALTO]

**Files:**
- Modify: `api/auth.js:191`

**Contexto:** `squad.map(p => p.equipo)` lanza TypeError si algún elemento es null/primitivo. Crash determinista provocable por cualquier usuario autenticado (mitigado por Task 2, pero debe responder 400 limpio).

- [ ] **Step 1: Validar elementos antes de mapear**

Insertar antes de la línea 191:

```js
  const elementosValidos = squad.every(p => p && typeof p === 'object' && typeof p.equipo === 'number');
  if (!elementosValidos) {
    return { ok: false, error: 'Cada jugador debe incluir un equipo válido' };
  }

  const teams = squad.map(p => p.equipo);
```

- [ ] **Step 2: Verificar**

Run: `node --check api/auth.js && node --test tests/`
Expected: OK

---

### Task 4: DELETE /api/match-stats/:eventId requiere admin [ALTO]

**Files:**
- Modify: `server.js:1049-1050`

**Contexto:** Único endpoint de escritura sin autenticación. Ningún script ni el frontend lo invocan (verificado con grep en ambos repos): añadir auth no rompe nada.

- [ ] **Step 1: Añadir verificación admin al inicio de la rama DELETE**

```js
  // Endpoint: Eliminar un matchstat por eventId (admin)
  if (reqUrl.pathname.startsWith('/api/match-stats/') && req.method === 'DELETE') {
    const admin = await verifyAdmin(req);
    if (!admin) {
      sendJson(req, res, 403, { ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
      return;
    }
    const eventId = parseInt(reqUrl.pathname.split('/api/match-stats/')[1]);
```

- [ ] **Step 2: Verificar**

Run: `node --check server.js`
Expected: OK

---

### Task 5: Consumo atómico de invitación + E11000 controlado [MEDIO]

**Files:**
- Modify: `api/auth.js:56-64`

**Contexto:** Check-then-write no atómico permite consumir un código dos veces con registros concurrentes. Además, una carrera en username duplicado propaga E11000 sin capturar (crash antes de Task 2; ahora error 500 genérico).

- [ ] **Step 1: Sustituir el bloque de creación/consumo**

```js
  let newUser;
  try {
    newUser = await User.create({
      clave,
      username: username.toLowerCase(),
      passwordHash,
      createdAt: new Date()
    });
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'El nombre de usuario ya existe' };
    }
    throw err;
  }

  // Consumo atómico: solo tiene éxito si usedBy sigue null
  const consumed = await Invitation.findOneAndUpdate(
    { code: clave, usedBy: null },
    { $set: { usedBy: username.toLowerCase() } },
    { new: true }
  );
  if (!consumed) {
    await User.deleteOne({ _id: newUser._id }); // rollback
    return { ok: false, error: 'Este código de invitación ya ha sido utilizado' };
  }
```

(Eliminar el antiguo `invitation.usedBy = ...; await invitation.save();`)

- [ ] **Step 2: Verificar**

Run: `node --check api/auth.js && node --test tests/`
Expected: OK

---

## FASE 2 — Reactivación de validaciones dormidas **[COMPORTAMIENTO — requerir aprobación]**

> Estas tareas restauran el comportamiento documentado en AGENTS.md pero LLEVAN MESOS INACTIVO en producción. Al activarlas: (a) nadie podrá editar predicciones de fases ya jugadas, (b) las restricciones top-8/grupos A-D se aplicarán al guardar eliminatorias, (c) las predicciones de la fase oculta volverán a filtrarse en `/api/predictions/all`.

### Task 6: Sustituir import assertion rota por lectura fs cacheada [CRÍTICO][COMPORTAMIENTO]

**Files:**
- Modify: `server.js:39-41`, `server.js:729-735`, `server.js:1087-1098`

**Contexto:** `{ assert: { type: 'json' } }` falla en Node moderno (sintaxis eliminada; debe ser `with`) y los `.catch(() => null)` lo silencian. Se usa `fs.readFileSync` cacheado en vez de `with` para máxima compatibilidad con cualquier runtime de Vercel.

- [ ] **Step 1: Añadir helper cacheado tras la línea 222 (tras FASES_VALIDAS)**

```js
let _calendarCache = null;
function loadCalendar() {
  if (_calendarCache) return _calendarCache;
  try {
    _calendarCache = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'sofascore', 'calendar.json'), 'utf8')
    );
  } catch {
    _calendarCache = null;
  }
  return _calendarCache;
}
```

- [ ] **Step 2: Sustituir los 3 puntos de uso**

- Línea 39: `const calendar = loadCalendar();` (eliminar el import con `assert` y su `.catch`)
- Líneas 729-735: `const calendar = loadCalendar();` (eliminar bloque try/catch del import)
- Líneas 1087-1098: `const calendar = loadCalendar(); matchFaseMap = {}; for (...) {...}` (eliminar try/catch del import; conservar la construcción del mapa)

- [ ] **Step 3: Verificar**

Run: `node --check server.js && node --test tests/`
Expected: OK

### Task 7: PUT /api/predictions respeta predictionsConfirmed [ALTO][COMPORTAMIENTO]

**Files:**
- Modify: `server.js` (dentro de la rama PUT `/api/predictions`, tras obtener `user` ~línea 707)

**Contexto:** Documentado ("Bloqueado si predictionsConfirmed=true") pero nunca implementado. El frontend YA bloquea la edición tras confirmar, así que ningún flujo legítimo se rompe.

- [ ] **Step 1: Añadir guardia**

```js
    if (user.predictionsConfirmed) {
      sendJson(req, res, 403, { ok: false, error: 'Tus pronósticos ya están confirmados y no se pueden modificar' });
      return;
    }
```

- [ ] **Step 2: Verificar**

Run: `node --check server.js`
Expected: OK

### Task 8: Cerrar bypass de privacidad anónima en /all [ALTO][COMPORTAMIENTO]

**Files:**
- Modify: `server.js:937` (squad/all), `server.js:1078` (predictions/all)

**Contexto:** Omitir el header Authorization devuelve datos de TODOS los usuarios durante fases PRE. Los usuarios legítimos siempre envían token (verificado: `authHeaders()` en main.js), luego el fix no les afecta.

- [ ] **Step 1: En ambas ramas, sustituir la selección de query**

```js
      if (!auth.ok && !isPublic) {
        sendJson(req, res, 401, { ok: false, error: 'Autenticación requerida durante la fase de edición' });
        return;
      }
      const query = isPublic
        ? User.find({}, 'username squad')            // o 'username predictions finalPredictions squad' en predictions/all
        : User.find({ username: auth.username }, 'username squad');
```

(Adaptar proyección de campos a cada endpoint; eliminar el comentario "fallback". En predictions/all mantener intacta la lógica posterior de hiddenFase.)

- [ ] **Step 2: Verificar**

Run: `node --check server.js && node --test tests/`
Expected: OK

---

## Fuera de alcance (decisión deliberada — riesgo > beneficio)

| Ítem | Motivo de exclusión |
|---|---|
| Rate limiter con clave XFF controlada por cliente | Depende de la topología de proxy real; cambiarlo puede bloquear usuarios legítimos detrás de proxy |
| scryptSync → async | Toca el núcleo de auth; en serverless el bloqueo es tolerable |
| Entropía de códigos invitación (6→8 chars) | Requiere cambios coordinados con validaciones de longitud en ambos repos |
| GET match-stats/:eventId cache-first | Cambiaría el workflow de subida de resultados (scripts esperan scraping fresco) |
| Timeout en scraping scripts/matchStats.js | Bajo impacto en serverless (Vercel ya corta por duración máxima) |

## Verificación final de la fase

- [ ] `node --check server.js api/*.js db/**/*.js` sin errores
- [ ] `node --test tests/` verde (20+)
- [ ] Smoke test manual del Task 2 (Host inválido → 400; peticiones normales → 200)
