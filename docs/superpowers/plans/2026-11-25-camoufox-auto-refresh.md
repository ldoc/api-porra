# Renovación automática desatendida con camoufox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-24-sofascore-captcha-token-design.md` (sección "Enmienda 2")

**Goal:** `getSofascoreToken` se autorepara: cuando el token falta o caduca, un camoufox en display virtual resuelve el Turnstile pasivamente, emite el JWT (~60 min) y lo persiste — sin interacción. La vía manual (`--set` / env) queda como fallback si camoufox falla (requisito explícito del usuario).

**Architecture:** Reintroducir la orquestación con refresco y mutex en `scripts/sofascoreToken.js` (patrón de la Task 1 original), con `refrescarConCamoufox` como refresco por defecto (lazy import; Vercel no lo tiene). `scripts/sofascoreHttp.js` NO cambia (su `cargarTokenPorDefecto` ya llama a `getSofascoreToken`, y su reintento ante `403 challenge` ya recoge el token recién refrescado). Infra ya commiteada (3d39dce): devDeps `camoufox`+`playwright-core@1.62`, stub `vendor/impit-stub` vía `overrides`, binario en `data/camoufox/159.0-beta.43/` (gitignored).

**Tech Stack:** Node.js ESM, `node:test`, camoufox (`headless: 'virtual'` + `CAMOUFOX_VIRTUAL_DISPLAY_SIZE=1920x1080x24`).

## Global Constraints

- ES Modules, naming en español, comentarios breves en español (convención del repo).
- Tests con `node:test` + `assert/strict`; mocks por inyección, nunca red real ni navegador en tests unitarios.
- **Vercel-safe**: todo import de camoufox/playwright es lazy (`await import`) dentro de try/catch — en Vercel el refresco falla de forma controlada hacia el error manual.
- **Requisito del usuario: la vía manual se CONSERVA** — el error `CAPTCHA_FAILED` mantiene las instrucciones manuales (URL del captcha + `node scripts/sofascoreToken.js --set <jwt>` + env `SOFASCORE_CAPTCHA_TOKEN`), y el CLI `--set` sigue funcionando igual.
- Comandos de test: fichero concreto `node --test tests/sofascoreToken.test.js`; suite completa `node --test` (SIN argumento de path — en Node v26.3.0 `node --test tests/` falla con MODULE_NOT_FOUND).
- No tocar `scripts/sofascoreHttp.js`, `scripts/matchStats.js`, `scripts/scrapeLiveMatches.js`, `server.js`.
- La cache del token (`data/.sofascore-token.json`) y el binario (`data/camoufox/`) nunca se commitean.

---

### Task 1: Orquestación de refresco con mutex — `scripts/sofascoreToken.js` (TDD)

**Files:**
- Modify: `scripts/sofascoreToken.js` (getSofascoreToken vuelve a ser async con refresco+mutex; stub `refrescarConCamoufox`; ajuste del CLI)
- Modify: `tests/sofascoreToken.test.js` (tests de la nueva orquestación)

**Interfaces:**
- Consumes: `decodeJwtExpMs`, `necesitaRefresco`, `leerCache`, `escribirCache` (ya existen, no cambian).
- Produces (Task 2 y 3 dependen de estas firmas exactas):
  - `getSofascoreToken({ env?, fsFn?, ruta?, refrescar?, ahoraMs? }?): Promise<string>` — env override → cache válida → refresco (mutex) → persiste cache → token. Rechaza con el error del `refrescar` si este falla.
  - `refrescarConCamoufox(): Promise<string>` — en esta task es un stub que lanza `CAPTCHA_NOT_IMPLEMENTED`; Task 2 lo implementa.
  - CLI: `node scripts/sofascoreToken.js` sin args ahora **refresca automáticamente** si no hay token válido (async); `--set <jwt>` igual que ahora.

- [ ] **Step 1: Write the failing tests**

Sustituir en `tests/sofascoreToken.test.js` los tres tests actuales de `getSofascoreToken` (env override, sin token → error, cache caducada → error) y añadir los de orquestación (import: añadir `REFRESH_MARGIN_MS` ya está; nada nuevo que importar salvo lo que ya está):

```js
test('getSofascoreToken: override por env gana y no refresca', async () => {
  const refrescar = async () => { throw new Error('no debía refrescar'); };
  const token = await getSofascoreToken({
    env: { SOFASCORE_CAPTCHA_TOKEN: 'manual-env' },
    ruta: rutaTemp(),
    refrescar
  });
  assert.equal(token, 'manual-env');
});

test('getSofascoreToken: cache válida → devuelve el token sin refrescar', async () => {
  const ruta = rutaTemp();
  const token = jwtConExp((Date.now() + REFRESH_MARGIN_MS * 2) / 1000);
  escribirCache(token, { ruta });
  const refrescar = async () => { throw new Error('no debía refrescar'); };
  assert.equal(await getSofascoreToken({ env: {}, ruta, refrescar }), token);
});

test('getSofascoreToken: sin token → refresca, persiste y devuelve el nuevo', async () => {
  const ruta = rutaTemp();
  const nuevo = jwtConExp((Date.now() + 30 * 60_000) / 1000);
  let llamadas = 0;
  const refrescar = async () => { llamadas++; return nuevo; };
  const token = await getSofascoreToken({ env: {}, ruta, refrescar });
  assert.equal(llamadas, 1);
  assert.equal(token, nuevo);
  assert.deepEqual(leerCache(fs, ruta), { token: nuevo, exp: decodeJwtExpMs(nuevo) });
});

test('getSofascoreToken: cache caducada → también refresca', async () => {
  const ruta = rutaTemp();
  escribirCache(jwtConExp((Date.now() - 1000) / 1000), { ruta });
  const nuevo = jwtConExp((Date.now() + 30 * 60_000) / 1000);
  const refrescar = async () => nuevo;
  assert.equal(await getSofascoreToken({ env: {}, ruta, refrescar }), nuevo);
  assert.equal(leerCache(fs, ruta).token, nuevo);
});

test('getSofascoreToken: si refrescar falla, rechaza con su error y no toca la cache', async () => {
  const ruta = rutaTemp();
  const refrescar = async () => { throw new Error('CAPTCHA_FAILED: fallo simulado'); };
  await assert.rejects(
    getSofascoreToken({ env: {}, ruta, refrescar }),
    /CAPTCHA_FAILED: fallo simulado/
  );
  assert.equal(leerCache(fs, ruta), null);
});

test('getSofascoreToken: mutex — refrescos concurrentes comparten una sola llamada', async () => {
  const ruta = rutaTemp();
  let llamadas = 0;
  const refrescar = async () => {
    llamadas++;
    await new Promise(r => setTimeout(r, 20));
    return jwtConExp((Date.now() + 30 * 60_000) / 1000);
  };
  const [a, b, c] = await Promise.all([
    getSofascoreToken({ env: {}, ruta, refrescar }),
    getSofascoreToken({ env: {}, ruta, refrescar }),
    getSofascoreToken({ env: {}, ruta, refrescar })
  ]);
  assert.equal(llamadas, 1);
  assert.equal(a, b);
  assert.equal(b, c);
});
```

Los tests de `decodeJwtExpMs`, `necesitaRefresco` y roundtrip de cache se quedan igual.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sofascoreToken.test.js`
Expected: FAIL — el `getSofascoreToken` actual es sync y sin `refrescar` (TypeError/asserciones).

- [ ] **Step 3: Implement the orchestration**

En `scripts/sofascoreToken.js`, sustituir el `getSofascoreToken` actual por:

```js
// Stub: Task 2 lo sustituye por el refresco real con camoufox.
export async function refrescarConCamoufox() {
  throw new Error('CAPTCHA_NOT_IMPLEMENTED');
}

// Mutex: los refrescos concurrentes comparten una única promesa (un solo
// navegador camoufox). env override > cache válida > refresco automático.
let refrescoEnCurso = null;

export async function getSofascoreToken({
  env = process.env,
  fsFn = fs,
  ruta = CACHE_PATH,
  refrescar = refrescarConCamoufox,
  ahoraMs = Date.now()
} = {}) {
  if (env.SOFASCORE_CAPTCHA_TOKEN) return env.SOFASCORE_CAPTCHA_TOKEN;
  const cache = leerCache(fsFn, ruta);
  if (!necesitaRefresco(cache, ahoraMs)) return cache.token;
  if (!refrescoEnCurso) {
    refrescoEnCurso = Promise.resolve()
      .then(refrescar)
      .then(token => {
        escribirCache(token, { fsFn, ruta });
        return token;
      })
      .finally(() => { refrescoEnCurso = null; });
  }
  return refrescoEnCurso;
}
```

Y en el bloque CLI, el caso sin `--set` pasa a ser asíncrono:

```js
const token = args[0] === '--set' ? args[1] : await getSofascoreToken();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sofascoreToken.test.js`
Expected: PASS (los reescritos + los 4 intactos).

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS completo (la suite existente de sofascoreHttp no toca getSofascore con cache inválida: sus tests inyectan `request`).

- [ ] **Step 6: Commit**

```bash
git add scripts/sofascoreToken.js tests/sofascoreToken.test.js
git commit -m "feat(sofascore): orquestación de refresco automático con mutex"
```

---

### Task 2: Refresco real con camoufox — `refrescarConCamoufox`

**Files:**
- Modify: `scripts/sofascoreToken.js` (sustituir el stub)

**Interfaces:**
- Consumes: `getSofascoreToken` (Task 1) — `refrescarConCamoufox` es su `refrescar` por defecto.
- Produces: `refrescarConCamoufox(): Promise<string>` que resuelve el Turnstile en display virtual desatendido y devuelve el JWT; ante cualquier fallo lanza `CAPTCHA_FAILED` con las instrucciones manuales (fallback del usuario).

Contexto verificado por el controller (sondas reales 2026-11-25):
- `headless: 'virtual'` + `CAMOUFOX_VIRTUAL_DISPLAY_SIZE=1920x1080x24` → Turnstile resuelve pasivo (~30-60 s). SIN el tamaño explícito NO pasa.
- TTL del JWT emitido ~60 min; con el margen de `REFRESH_MARGIN_MS` (10 min) el refresco ocurre a los ~50 min.
- Binario: `data/camoufox/159.0-beta.43/camoufox-bin` (puede haber otras versiones en `data/camoufox/*/`).
- Import de `camoufox` ya funciona en este repo (stub de impit vía overrides).

- [ ] **Step 1: Replace the stub with the real refresh**

Sustituir el stub por (imports de `path`/`fs` ya existen en el módulo; no añadir imports nuevos salvo los usados):

```js
const REFRESCO_INTENTOS = 2;
const REFRESCO_TIMEOUT_MS = 90_000;

function binarioCamoufox(env = process.env) {
  if (env.CAMOUFOX_BINARIO) return env.CAMOUFOX_BINARIO;
  try {
    const base = path.join(__dirname, '../data/camoufox');
    const candidato = fs.readdirSync(base)
      .filter(dir => fs.existsSync(path.join(base, dir, 'camoufox-bin')))
      .sort()
      .at(-1);
    if (candidato) return path.join(base, candidato, 'camoufox-bin');
  } catch {}
  return null;
}

async function lanzarCamoufox() {
  // Import lazy: en Vercel no hay camoufox ni binario; se cae al error manual.
  const { Camoufox } = await import('camoufox');
  const binario = binarioCamoufox();
  if (!binario) {
    throw new Error('binario camoufox no encontrado en data/camoufox/ (ver AGENTS.md)');
  }
  // Sonda 2026-11-25: sin pantalla 1920x1080x24 el display virtual NO pasa Turnstile.
  process.env.CAMOUFOX_VIRTUAL_DISPLAY_SIZE ||= '1920x1080x24';
  return Camoufox({ executable_path: binario, headless: 'virtual', locale: 'es-ES' });
}

// Resuelve el Turnstile en la página de captcha y captura el JWT del
// POST /token/captcha. Desatendido: display virtual propio, sin interacción.
async function resolverTurnstileCamoufox() {
  const navegador = await lanzarCamoufox();
  try {
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    const respuestaPromise = pagina.waitForResponse(
      r => r.url().includes('/api/v1/token/captcha') && r.status() === 200,
      { timeout: REFRESCO_TIMEOUT_MS }
    );
    await pagina.goto(RENOVACION_URL, { waitUntil: 'domcontentloaded' });
    const cuerpo = await (await respuestaPromise).json();
    if (!cuerpo?.token) throw new Error('respuesta sin token');
    return cuerpo.token;
  } finally {
    await navegador.close().catch(() => {});
  }
}

// Fallback manual garantizado (requisito del usuario): el error siempre trae
// las instrucciones para renovar a mano si camoufox falla.
export async function refrescarConCamoufox() {
  let ultimoError = null;
  for (let intento = 0; intento < REFRESCO_INTENTOS; intento++) {
    try {
      return await resolverTurnstileCamoufox();
    } catch (e) {
      ultimoError = e;
      console.error(`${new Date().toISOString()} refresco camoufox: intento ${intento + 1} falló: ${e.message}`);
    }
  }
  throw new Error(
    'CAPTCHA_FAILED: camoufox no resolvió Turnstile (' + ultimoError?.message + '). ' +
    'Renueva a mano: 1) abre en tu navegador ' + RENOVACION_URL + ' ' +
    '2) tras el redirect copia localStorage "sofa.captcha.token" ' +
    '3) ejecuta: node scripts/sofascoreToken.js --set <token> ' +
    '(o define SOFASCORE_CAPTCHA_TOKEN en .env y reinicia).'
  );
}
```

- [ ] **Step 2: Run unit tests (no browser needed)**

Run: `node --test tests/sofascoreToken.test.js && node --test`
Expected: PASS (los tests inyectan su `refrescar`; el real no se invoca). Syntax check: `node --check scripts/sofascoreToken.js`.

- [ ] **Step 3: Commit**

```bash
git add scripts/sofascoreToken.js
git commit -m "feat(sofascore): refresco desatendido del token vía camoufox (Turnstile pasivo)"
```

(El controller ejecuta después la verificación real con navegador.)

---

### Task 3: Docs y verificación E2E del refresco automático

**Files:**
- Modify: `AGENTS.md` (sección "Token anti-captcha (Turnstile)" — reescritura)
- Modify: `.env.example` (CAMOUFOX_BINARIO opcional)

**Interfaces:**
- Consumes: todo lo anterior funcionando.
- Produces: documentación del mecanismo completo + verificación real del refresco automático.

- [ ] **Step 1: Rewrite the AGENTS.md section**

Sustituir la sección actual "### Token anti-captcha (Turnstile)" por:

```markdown
### Token anti-captcha (Turnstile)

Sofascore exige resolver un captcha (Cloudflare Turnstile) que emite un JWT
(`POST /api/v1/token/captcha`), ligado a la IP y con **TTL ~1 h**. Sin él,
cuando el edge te marca como bot, responde `403 {"reason":"challenge"}`.
El flag es dinámico: con la IP "limpia" las peticiones sin token pasan; bajo
volumen de scraping se re-activa.

- `scripts/sofascoreToken.js` gestiona el token con **refresco automático
  desatendido**: `getSofascoreToken` hace env `SOFASCORE_CAPTCHA_TOKEN` →
  cache en `data/.sofascore-token.json` (gitignored, releída en cada
  llamada) → si falta o caduca, lanza camoufox en display virtual
  (`headless: 'virtual'` + `CAMOUFOX_VIRTUAL_DISPLAY_SIZE=1920x1080x24`)
  que resuelve el Turnstile pasivamente y persiste el JWT (~60 min).
  Mutex: un solo navegador por refresco aunque el scraper dispare en
  paralelo.
- **Fallback manual (por si Sofascore endurece contra camoufox)**: el error
  `CAPTCHA_FAILED` en los logs trae las instrucciones — abrir en el
  navegador de confianza la URL de renovación, copiar localStorage
  `sofa.captcha.token` y ejecutar
  `node scripts/sofascoreToken.js --set <jwt>`. O definir
  `SOFASCORE_CAPTCHA_TOKEN` en `.env`.
- Requisitos locales (Ubuntu 20.04/glibc 2.31): devDeps `camoufox` +
  `playwright-core@1.62`; binario del navegador (~4 GB) en
  `data/camoufox/<versión>/` (gitignored, descargar del zip linux de los
  releases de daijro/camoufox y descomprimir con ejecutables); `impit`
  (dep de camoufox) no carga con glibc < 2.33 → stub en
  `vendor/impit-stub/` vía `overrides` (no se usa sin proxy).
- La automatización con Playwright/patchright NO es viable: Turnstile
  rechaza esos navegadores automatizados (incl. headed con click humano).
  No reintroducirla. camoufox (Gecko + spoofing profundo) sí pasa, PERO solo
  en modo virtual/headed con pantalla 1920x1080x24 (el headless normal y el
  display virtual por defecto fallan).
- `scripts/sofascoreHttp.js` envía el JWT en `x-captcha` + cookie
  `sofa_captcha`; ante `403 challenge` invalida la cache y reintenta una
  vez (el reintento ya recoge el token recién refrescado).
- `server.js` en Vercel importa el módulo de token de forma lazy con
  try/catch → allí se scrapea sin token.
```

- [ ] **Step 2: Add CAMOUFOX_BINARIO to .env.example**

Añadir al final:

```
# Ruta al binario de camoufox para el refresco automático del token de
# Sofascore (opcional; por defecto se busca en data/camoufox/*/camoufox-bin):
# CAMOUFOX_BINARIO=/ruta/a/camoufox-bin
```

- [ ] **Step 3: Full suite + syntax check**

Run: `node --test && node --check scripts/sofascoreToken.js`
Expected: PASS sin errores.

- [ ] **Step 4: E2E del refresco automático (real, con navegador)**

```bash
mv data/.sofascore-token.json /tmp/opencode/token-e2e.bak
node scripts/sofascoreToken.js
```

Expected: tras ~30-90 s (camoufox resuelve pasivo) imprime `{ ok: true, expiracion: <futura>, ttlMin: ~50-60 }`. Sin ventana ni interacción. Luego verificar con el token:

```bash
node --env-file=.env -e "
import('./scripts/sofascoreHttp.js').then(async ({ fetchSofascore }) => {
  const data = await fetchSofascore('https://www.sofascore.com/api/v1/event/16938806');
  console.log('E2E ok:', data?.event?.tournament?.name);
  process.exit(0);
}).catch(e => { console.error('E2E FALLO:', e.message); process.exit(1); });
"
```

Expected: `E2E ok: UEFA Champions League`. Si el refresco automático falla dos veces, parar y reportar BLOCKED con el error completo (el controller re-evalúa con el usuario; no forzar).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md .env.example
git commit -m "docs(sofascore): refresco automático desatendido con camoufox y fallback manual"
```
