# Token anti-captcha de Sofascore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-24-sofascore-captcha-token-design.md`

**Goal:** Automatizar la obtención/renovación del JWT anti-captcha de Sofascore para que el scraping local (scraper live, calendario, matchStats) vuelva a funcionar tras la puerta Turnstile.

**Architecture:** Nuevo módulo `scripts/sofascoreToken.js` que entrega un JWT válido (cache en fichero + refresco on-demand con Playwright + mutex). `scripts/sofascoreHttp.js` añade el JWT a cada petición (`x-captcha` + cookie `sofa_captcha`) y reintenta una vez ante `403 challenge` tras invalidar/refrescar el token. Import lazy del módulo de token para no romper el despliegue de Vercel (sin Playwright allí).

**Tech Stack:** Node.js ESM, `node:test`, Playwright (Chromium, devDependency), node-curl-impersonate (existente).

## Global Constraints

- ES Modules (`import/export`), naming en español para funciones/variables (convención del repo).
- Tests con `node:test` + `assert/strict`, patrón de `tests/sofascoreHttp.test.js` (mocks por inyección de dependencias, nunca red real en tests).
- Playwright SOLO en `devDependencies` (Vercel instala sin devDeps).
- `server.js` (Vercel) llega a `sofascoreHttp.js` vía `scripts/matchStats.js`: todo import del módulo de token debe ser lazy (`await import`) con try/catch → sin token en Vercel, comportamiento actual.
- Cache del token en `data/.sofascore-token.json` (secreto; ya cubierto por `data/*` en `.gitignore`).
- Comentarios breves en español, siguiendo el estilo existente del repo.
- Comandos de test: `node --test tests/sofascoreToken.test.js`, `node --test tests/sofascoreHttp.test.js`, suite completa `node --test tests/`.
- No tocar `scripts/matchStats.js`, `scripts/scrapeLiveMatches.js` ni `server.js`: la solución vive en la capa HTTP compartida.

---

### Task 1: Lógica de cache/validez del token — `scripts/sofascoreToken.js` (TDD)

**Files:**
- Create: `scripts/sofascoreToken.js`
- Create: `tests/sofascoreToken.test.js`

**Interfaces:**
- Consumes: nada (módulo nuevo).
- Produces (Task 2 y 3 dependen de estas firmas exactas):
  - `decodeJwtExpMs(token: string): number | null` — `exp` del JWT en ms, `null` si no se puede decodificar.
  - `necesitaRefresco(cache: { token?, exp? } | null, ahoraMs?: number, margenMs?: number): boolean`
  - `leerCache(fsFn?, ruta?): { token, exp } | null`
  - `escribirCache(token, { fsFn?, ruta? }?): { token, exp }`
  - `invalidarCache({ fsFn?, ruta? }?): void`
  - `getSofascoreToken({ force?, env?, fsFn?, ruta?, refrescar?, ahoraMs? }?): Promise<string>`
  - Constantes: `REFRESH_MARGIN_MS = 10 * 60_000`, `CACHE_PATH` (absoluta a `data/.sofascore-token.json`).
  - `refrescarConPlaywright(): Promise<string>` — en esta task es un stub que lanza `CAPTCHA_NOT_IMPLEMENTED`; Task 2 lo implementa de verdad.

- [ ] **Step 1: Write the failing tests**

Crear `tests/sofascoreToken.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  REFRESH_MARGIN_MS,
  decodeJwtExpMs,
  necesitaRefresco,
  leerCache,
  escribirCache,
  invalidarCache,
  getSofascoreToken
} from '../scripts/sofascoreToken.js';

const jwtConExp = (expSeg) => {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ exp: expSeg })}.firma`;
};

const rutaTemp = () => path.join(
  os.tmpdir(),
  `sofascore-token-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
);

test('decodeJwtExpMs devuelve el exp del JWT en ms', () => {
  assert.equal(decodeJwtExpMs(jwtConExp(1800000000)), 1800000000000);
});

test('decodeJwtExpMs devuelve null ante basura o sin exp', () => {
  assert.equal(decodeJwtExpMs('no-es-un-jwt'), null);
  assert.equal(decodeJwtExpMs('a.eyJmb28iOjF9.b'), null);
  assert.equal(decodeJwtExpMs(undefined), null);
});

test('necesitaRefresco: cache vacío o caducado → true; válido lejos de expirar → false', () => {
  const ahora = 1_000_000_000;
  assert.equal(necesitaRefresco(null, ahora), true);
  assert.equal(necesitaRefresco({}, ahora), true);
  // expira en menos del margen → refrescar
  assert.equal(necesitaRefresco({ exp: ahora + REFRESH_MARGIN_MS - 1 }, ahora), true);
  // expira en más del margen → válido
  assert.equal(necesitaRefresco({ exp: ahora + REFRESH_MARGIN_MS + 1 }, ahora), false);
  // exp irreconocible → refrescar
  assert.equal(necesitaRefresco({ token: jwtConExp(0), exp: null }, ahora), true);
  // decodifica el exp desde el propio token si la cache no lo trae
  assert.equal(necesitaRefresco({ token: jwtConExp((ahora + REFRESH_MARGIN_MS * 2) / 1000) }, ahora), false);
});

test('escribirCache/leerCache persisten y recuperan { token, exp }', () => {
  const ruta = rutaTemp();
  const token = jwtConExp(1800000000);
  escribirCache(token, { ruta });
  assert.deepEqual(leerCache(fs, ruta), { token, exp: 1800000000000 });
  invalidarCache({ ruta });
  assert.equal(leerCache(fs, ruta), null);
});

test('getSofascoreToken: override por env gana y no refresca', async () => {
  const refrescar = async () => { throw new Error('no debía refrescar'); };
  const token = await getSofascoreToken({
    force: true,
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
  assert.equal(await getSofascoreToken({ ruta, refrescar }), token);
});

test('getSofascoreToken: force refresca y persiste la cache', async () => {
  const ruta = rutaTemp();
  const llamadas = [];
  const refrescar = async () => { llamadas.push(1); return jwtConExp(1800000000); };
  const token = await getSofascoreToken({ force: true, ruta, refrescar });
  assert.equal(llamadas.length, 1);
  assert.equal(token, jwtConExp(1800000000));
  assert.deepEqual(leerCache(fs, ruta), { token: jwtConExp(1800000000), exp: 1800000000000 });
});

test('getSofascoreToken: mutex — refrescos concurrentes comparten una sola llamada', async () => {
  const ruta = rutaTemp();
  let llamadas = 0;
  const refrescar = async () => {
    llamadas++;
    await new Promise(r => setTimeout(r, 20));
    return jwtConExp(1800000000);
  };
  const [a, b, c] = await Promise.all([
    getSofascoreToken({ force: true, ruta, refrescar }),
    getSofascoreToken({ force: true, ruta, refrescar }),
    getSofascoreToken({ force: true, ruta, refrescar })
  ]);
  assert.equal(llamadas, 1);
  assert.equal(a, b);
  assert.equal(b, c);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sofascoreToken.test.js`
Expected: FAIL — `Cannot find module '../scripts/sofascoreToken.js'`.

- [ ] **Step 3: Write the implementation**

Crear `scripts/sofascoreToken.js`:

```js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_PATH = path.join(__dirname, '../data/.sofascore-token.json');
export const REFRESH_MARGIN_MS = 10 * 60_000;

// Decodifica el `exp` (segundos) del payload del JWT a ms. Null si no es decodificable.
export function decodeJwtExpMs(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = parte + '='.repeat((4 - (parte.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// ¿Hay que refrescar? Sin token, sin exp reconocible o expirando dentro del margen.
export function necesitaRefresco(cache, ahoraMs = Date.now(), margenMs = REFRESH_MARGIN_MS) {
  if (!cache?.token) return true;
  const expMs = cache.exp ?? decodeJwtExpMs(cache.token);
  if (expMs == null) return true;
  return expMs - ahoraMs < margenMs;
}

export function leerCache(fsFn = fs, ruta = CACHE_PATH) {
  try {
    const cache = JSON.parse(fsFn.readFileSync(ruta, 'utf-8'));
    return typeof cache?.token === 'string' ? cache : null;
  } catch {
    return null;
  }
}

export function escribirCache(token, { fsFn = fs, ruta = CACHE_PATH } = {}) {
  const cache = { token, exp: decodeJwtExpMs(token) };
  fsFn.mkdirSync(path.dirname(ruta), { recursive: true });
  fsFn.writeFileSync(ruta, JSON.stringify(cache, null, 2) + '\n');
  return cache;
}

export function invalidarCache({ fsFn = fs, ruta = CACHE_PATH } = {}) {
  try { fsFn.unlinkSync(ruta); } catch {}
}

// Stub: Task 2 lo sustituye por el refresco real con Playwright.
export async function refrescarConPlaywright() {
  throw new Error('CAPTCHA_NOT_IMPLEMENTED');
}

// Mutex: los refrescos concurrentes comparten una única promesa (un solo navegador).
let refrescoEnCurso = null;

export async function getSofascoreToken({
  force = false,
  env = process.env,
  fsFn = fs,
  ruta = CACHE_PATH,
  refrescar = refrescarConPlaywright,
  ahoraMs = Date.now()
} = {}) {
  if (env.SOFASCORE_CAPTCHA_TOKEN) return env.SOFASCORE_CAPTCHA_TOKEN;
  const cache = leerCache(fsFn, ruta);
  if (!force && !necesitaRefresco(cache, ahoraMs)) return cache.token;
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

Nota: los tests inyectan siempre `refrescar`, así que el stub no interfiere.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sofascoreToken.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the rest of the suite to check nothing broke**

Run: `node --test tests/`
Expected: PASS (los existentes no tocan este módulo).

- [ ] **Step 6: Commit**

```bash
git add scripts/sofascoreToken.js tests/sofascoreToken.test.js
git commit -m "feat(sofascore): cache y validez del token anti-captcha"
```

---

### Task 2 (AMENDADA 2026-11-25): Token en modo manual + CLI de renovación

> Enmienda aprobada por el usuario tras la sonda de factibilidad: Turnstile
> rechaza navegadores automatizados (probado headless, headed bajo Xvfb y
> headed en display real con click humano válido → "no era válido"). El token
> manual SÍ funciona con el fingerprint firefox-117 del scraper (evidencia:
> 200 con cabecera `X-Captcha`, probado el 2026-11-24). El JWT es ligado a la
> IP (~12 h de TTL). Se elimina el refresco Playwright y se queda renovación
> manual semiautomática.

**Files:**
- Modify: `scripts/sofascoreToken.js` (revertir el commit Playwright y sobre él: quitar stub/mutex/`refrescar`; `getSofascoreToken` manual con error de renovación; CLI `--set`)
- Modify: `tests/sofascoreToken.test.js` (tests sin `refrescar`; nuevos tests del error `CAPTCHA_FAILED`)
- Modify: `package.json` / `package-lock.json` (vía revert: fuera `playwright`)

**Interfaces:**
- Consumes: Task 1 (`decodeJwtExpMs`, `necesitaRefresco`, `leerCache`, `escribirCache`, `invalidarCache`, `CACHE_PATH`, `REFRESH_MARGIN_MS`).
- Produces (Task 3 y 4 dependen de estas firmas exactas):
  - `RENOVACION_URL: string` — URL del captcha para renovar a mano.
  - `getSofascoreToken({ env?, fsFn?, ruta?, ahoraMs? }?): string` — env override → cache de fichero (releída en cada llamada: renovación en caliente sin reiniciar el scraper) → throw `CAPTCHA_FAILED` con instrucciones (incluye `RENOVACION_URL`).
  - CLI: `node scripts/sofascoreToken.js --set <jwt>` persiste la cache y muestra `{ ok, expiracion, ttlMin }`; sin args verifica el token vigente (env o cache) e imprime lo mismo.

- [ ] **Step 1: Revert the Playwright commit**

Run: `git revert --no-edit 6c44be1`
Expected: commit de revert que restaura el stub `refrescarConPlaywright` y quita `playwright` de `package.json`/`package-lock.json`.

- [ ] **Step 2: Simplify the module to manual mode**

En `scripts/sofascoreToken.js`: eliminar el stub `refrescarConPlaywright`, el mutex `refrescoEnCurso` y el parámetro `refrescar`/`force`. El `getSofascoreToken` queda:

```js
// URL para renovar a mano en el navegador de confianza (Turnstile resuelve pasivo).
export const RENOVACION_URL = 'https://www.sofascore.com/captcha.html?redirectUrl=' +
  encodeURIComponent('https://www.sofascore.com/');

// Env override > cache de fichero (se relee en cada llamada: renovar en caliente sin reiniciar).
export function getSofascoreToken({
  env = process.env,
  fsFn = fs,
  ruta = CACHE_PATH,
  ahoraMs = Date.now()
} = {}) {
  if (env.SOFASCORE_CAPTCHA_TOKEN) return env.SOFASCORE_CAPTCHA_TOKEN;
  const cache = leerCache(fsFn, ruta);
  if (!necesitaRefresco(cache, ahoraMs)) return cache.token;
  throw new Error(
    'CAPTCHA_FAILED: sin token de Sofascore válido. Renueva: 1) abre en tu navegador ' +
    RENOVACION_URL + ' 2) tras el redirect copia localStorage "sofa.captcha.token" ' +
    '3) ejecuta: node scripts/sofascoreToken.js --set <token> (o define ' +
    'SOFASCORE_CAPTCHA_TOKEN en .env y reinicia).'
  );
}
```

- [ ] **Step 3: Replace the CLI block at the end of the module**

```js
// CLI: renovación manual de la cache y verificación del token vigente.
const esCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esCli) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--set') {
      if (!args[1]) {
        console.error('uso: node scripts/sofascoreToken.js --set <jwt>');
        process.exit(1);
      }
      escribirCache(args[1]);
    }
    const token = args[0] === '--set' ? args[1] : getSofascoreToken();
    const expMs = decodeJwtExpMs(token);
    console.log(JSON.stringify({
      ok: true,
      expiracion: expMs ? new Date(expMs).toISOString() : null,
      ttlMin: expMs ? Math.round((expMs - Date.now()) / 60000) : null
    }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Update the tests**

En `tests/sofascoreToken.test.js`: eliminar los tres tests que inyectaban `refrescar` (env override, force refresca y persiste, mutex) y sustituirlos por (añadiendo `RENOVACION_URL` al import):

```js
test('getSofascoreToken: override por env gana incluso sin cache', () => {
  const token = getSofascoreToken({ env: { SOFASCORE_CAPTCHA_TOKEN: 'manual-env' }, ruta: rutaTemp() });
  assert.equal(token, 'manual-env');
});

test('getSofascoreToken: sin token → error CAPTCHA_FAILED con instrucciones de renovación', () => {
  assert.throws(
    () => getSofascoreToken({ env: {}, ruta: rutaTemp() }),
    (e) => e.message.startsWith('CAPTCHA_FAILED') && e.message.includes(RENOVACION_URL)
  );
});

test('getSofascoreToken: cache caducada → mismo error de renovación', () => {
  const ruta = rutaTemp();
  escribirCache(jwtConExp((Date.now() - 1000) / 1000), { ruta });
  assert.throws(() => getSofascoreToken({ env: {}, ruta }), /CAPTCHA_FAILED/);
});
```

El test "cache válida → devuelve el token" se conserva pero sin el parámetro `refrescar`:

```js
test('getSofascoreToken: cache válida → devuelve el token', () => {
  const ruta = rutaTemp();
  const token = jwtConExp((Date.now() + REFRESH_MARGIN_MS * 2) / 1000);
  escribirCache(token, { ruta });
  assert.equal(getSofascoreToken({ env: {}, ruta }), token);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/sofascoreToken.test.js`
Expected: PASS (9 tests: los 4 primeros de decode/refresco lógico, roundtrip cache, y los nuevos).

- [ ] **Step 6: Verify the cache file is git-ignored**

Run: `git check-ignore data/.sofascore-token.json && echo IGNORADO`
Expected: `IGNORADO` (lo cubre la regla `data/*` existente). Si no, añadir la ruta a `.gitignore` antes de commit.

- [ ] **Step 7: Commit**

```bash
git add scripts/sofascoreToken.js tests/sofascoreToken.test.js
git commit -m "feat(sofascore): renovación manual del token anti-captcha (CLI --set)"
```

---

### Task 3: Integración en `scripts/sofascoreHttp.js` (TDD)

**Files:**
- Modify: `scripts/sofascoreHttp.js`
- Modify: `tests/sofascoreHttp.test.js` (solo añadir tests nuevos; los existentes no se tocan porque inyectan `request` y nunca llegan a la capa de token)

**Interfaces:**
- Consumes: `getSofascoreToken`, `invalidarCache` de `scripts/sofascoreToken.js` (vía import lazy).
- Produces:
  - `construirCabeceras(token: string | null): object` (exportada para tests).
  - `fetchSofascore(url, { timeoutMs, retries, request, sleep, random, invalidarToken })` — una dep nueva inyectable; default con import lazy try/catch (Vercel-safe). Ante `403 challenge` invalida la cache y reintenta una vez (la relectura de cache/env al reconstruir la petición cubre renovaciones en caliente).

- [ ] **Step 1: Write the failing tests**

Añadir a `tests/sofascoreHttp.test.js` (y añadir `construirCabeceras` al import existente):

```js
import {
  validarUrlSofascore,
  fetchSofascore,
  requestWithTimeout,
  backoffDelay,
  construirCabeceras
} from '../scripts/sofascoreHttp.js';

test('construirCabeceras añade x-captcha y cookie con token', () => {
  const h = construirCabeceras('jwt-123');
  assert.equal(h['x-captcha'], 'jwt-123');
  assert.equal(h.cookie, 'sofa_captcha=jwt-123');
  assert.equal(h.referer, 'https://www.sofascore.com/');
});

test('construirCabeceras sin token no añade cabeceras de captcha', () => {
  const h = construirCabeceras(null);
  assert.equal('x-captcha' in h, false);
  assert.equal('cookie' in h, false);
});

test('ante 403 challenge invalida y reintenta una vez', { timeout: 2000 }, async () => {
  const eventos = [];
  const request = async () => {
    eventos.push('request');
    const n = eventos.filter(e => e === 'request').length;
    return n === 1
      ? { statusCode: 403, response: '{"error":{"code":403,"reason":"challenge"}}' }
      : { statusCode: 200, response: '{"ok":true}' };
  };
  const invalidarToken = async () => { eventos.push('invalida'); };

  const data = await fetchSofascore(URL_OK, {
    request, invalidarToken, sleep: async () => {}
  });

  assert.deepEqual(data, { ok: true });
  assert.deepEqual(eventos, ['request', 'invalida', 'request']);
});

test('403 challenge dos veces seguidas lanza HTTP 403 sin bucle', { timeout: 2000 }, async () => {
  let llamadas = 0;
  const request = async () => {
    llamadas++;
    return { statusCode: 403, response: '{"reason":"challenge"}' };
  };
  await assert.rejects(
    fetchSofascore(URL_OK, {
      request,
      invalidarToken: async () => {},
      sleep: async () => {}
    }),
    /HTTP 403/
  );
  assert.equal(llamadas, 2);
});

test('403 sin challenge no invalida', { timeout: 2000 }, async () => {
  let llamadas = 0;
  const request = async () => {
    llamadas++;
    return { statusCode: 403, response: '{"error":{"code":403,"reason":"Forbidden"}}' };
  };
  await assert.rejects(
    fetchSofascore(URL_OK, {
      request,
      invalidarToken: async () => { throw new Error('no debía invalidar'); },
      sleep: async () => {}
    }),
    /HTTP 403/
  );
  assert.equal(llamadas, 1);
});

test('challenge no consume reintentos de backoff: tras invalidar aguanta 500s y recupera', { timeout: 2000 }, async () => {
  let llamadas = 0;
  let invalidaciones = 0;
  const request = async () => {
    llamadas++;
    if (llamadas === 1) return { statusCode: 403, response: '{"reason":"challenge"}' };
    return llamadas < 4
      ? { statusCode: 500, response: '' }
      : { statusCode: 200, response: '{"ok":true}' };
  };
  const data = await fetchSofascore(URL_OK, {
    request,
    invalidarToken: async () => { invalidaciones++; },
    sleep: async () => {},
    random: () => 0
  });
  assert.deepEqual(data, { ok: true });
  assert.equal(invalidaciones, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sofascoreHttp.test.js`
Expected: FAIL — `construirCabeceras` no existe (import) y los tests de challenge fallan.

- [ ] **Step 3: Implement the integration**

En `scripts/sofascoreHttp.js`, tras las `CABECERAS` existentes añadir:

```js
const CAPTCHA_CHALLENGE_RE = /"reason"\s*:\s*"challenge"/;

// Imports lazy con try/catch: en Vercel no hay cache local de token; se scrapea sin token.
const cargarTokenPorDefecto = async () => {
  try {
    const { getSofascoreToken } = await import('./sofascoreToken.js');
    return await getSofascoreToken();
  } catch { return null; }
};

const invalidarTokenPorDefecto = async () => {
  try {
    const { invalidarCache } = await import('./sofascoreToken.js');
    invalidarCache();
  } catch {}
};

// Cabeceras de la petición: las base + X-Captcha y cookie sofa_captcha si hay token.
export function construirCabeceras(token) {
  const cabeceras = { ...CABECERAS };
  if (token) {
    cabeceras['x-captcha'] = token;
    cabeceras.cookie = `sofa_captcha=${token}`;
  }
  return cabeceras;
}

async function makeSofascoreRequest(endpointUrl) {
  const token = await cargarTokenPorDefecto();
  return new CurlImpersonate(endpointUrl, {
    method: 'GET',
    headers: construirCabeceras(token),
    impersonate: 'firefox-117'
  }).makeRequest();
}
```

(Sustituye la función `makeSofascoreRequest` anterior, que pasaba `CABECERAS` directamente.)

En `fetchSofascore`, ampliar las opciones y manejar el challenge dentro del bucle:

```js
export async function fetchSofascore(endpointUrl, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  request = makeSofascoreRequest,
  invalidarToken = invalidarTokenPorDefecto,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random
} = {}) {
  if (!validarUrlSofascore(endpointUrl)) {
    throw new Error('URL de Sofascore no permitida');
  }

  const shouldRetry = (message) => /^HTTP (429|5\d\d)$/.test(message);
  let reintentoChallenge = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await requestWithTimeout(endpointUrl, timeoutMs, request);
      if (res.statusCode === 403 && CAPTCHA_CHALLENGE_RE.test(String(res.response))) {
        if (reintentoChallenge) throw new Error('HTTP 403');
        reintentoChallenge = true;
        await invalidarToken();
        // La renovación en caliente la cubre la relectura de cache/env al
        // reconstruir la petición (makeSofascoreRequest).
        attempt--; // el reintento de challenge no consume reintentos de backoff
        continue;
      }
      if (res.statusCode === 404) throw new Error('NOT_FOUND');
      if (res.statusCode !== 200) throw new Error('HTTP ' + res.statusCode);

      try {
        return JSON.parse(res.response);
      } catch {
        throw new Error('Respuesta no JSON de Sofascore');
      }
    } catch (e) {
      if (attempt === retries || !shouldRetry(e.message)) throw e;
      await sleep(backoffDelay(attempt, random));
    }
  }
}
```

- [ ] **Step 4: Run the full test file to verify new + existing tests pass**

Run: `node --test tests/sofascoreHttp.test.js`
Expected: PASS — los tests nuevos y TODOS los existentes (500/429/404/400/timeouts/backoff no cambian de semántica: los tests viejos inyectan `request` y no devuelven challenge).

- [ ] **Step 5: Run the whole suite**

Run: `node --test tests/`
Expected: PASS completo.

- [ ] **Step 6: Commit**

```bash
git add scripts/sofascoreHttp.js tests/sofascoreHttp.test.js
git commit -m "feat(sofascore): envía X-Captcha y reintenta ante 403 challenge"
```

---

### Task 4: Docs (.env.example, AGENTS.md) y verificación E2E

**Files:**
- Modify: `.env.example`
- Modify: `AGENTS.md` (sección "Datos de Sofascore" / "Notas Importantes")

**Interfaces:**
- Consumes: todo lo anterior funcionando.
- Produces: documentación del mecanismo + verificación end-to-end real del scraper live.

- [ ] **Step 1: Document the manual override in `.env.example`**

Añadir al final:

```
# Token anti-captcha de Sofascore (opcional, override manual estático; requiere
# reiniciar el scraper). Lo habitual es renovar en caliente sin reiniciar:
#   node scripts/sofascoreToken.js --set <jwt>
# (el JWT se obtiene abriendo la URL de renovación en tu navegador y copiando
# localStorage "sofa.captcha.token"):
# SOFASCORE_CAPTCHA_TOKEN=eyJhbGciOi...
```

- [ ] **Step 2: Document the mechanism in `AGENTS.md`**

En "Datos de Sofascore" añadir:

```markdown
### Token anti-captcha (Turnstile)

Sofascore exige resolver un captcha (Cloudflare Turnstile) que emite un JWT
(`POST /api/v1/token/captcha`), ligado a la IP y válido hasta el `exp` del
propio JWT (~12 h). Sin él, el edge responde `403 {"reason":"challenge"}` a
los clientes que marca como bots.

- `scripts/sofascoreToken.js` lo gestiona en modo manual: cache en
  `data/.sofascore-token.json` (gitignored, releída en cada llamada) y
  override vía `SOFASCORE_CAPTCHA_TOKEN` en `.env`.
- Renovación (cuando caduca o salta `403 challenge`): abrir en el navegador
  de confianza `https://www.sofascore.com/captcha.html?redirectUrl=<home
  url-encoded>` (el widget resuelve solo tras el redirect), copiar
  localStorage `sofa.captcha.token` y ejecutar
  `node scripts/sofascoreToken.js --set <jwt>`. Sin reiniciar el scraper.
- La automatización con Playwright NO es viable: Turnstile rechaza
  navegadores automatizados (probado headless y headed con click válido). No
  reintroducirla.
- `scripts/sofascoreHttp.js` envía el JWT en `x-captcha` + cookie
  `sofa_captcha` y ante `403 challenge` invalida la cache y reintenta una vez.
- `server.js` en Vercel importa el módulo de token de forma lazy con
  try/catch → allí se scrapea sin token.
```

- [ ] **Step 3: Full suite + syntax check**

Run: `node --test tests/ && node --check scripts/sofascoreToken.js && node --check scripts/sofascoreHttp.js`
Expected: PASS sin errores.

- [ ] **Step 4: E2E verification of the live scraper**

Precondición (controller, antes del dispatch): token vigente en cache —
`node scripts/sofascoreToken.js --set <jwt>` con el JWT que facilitó el
usuario (no va en el repo: gitignored).

Run: `node --env-file=.env scripts/scrapeLiveMatches.js --once`
Expected: `"ok": >0` para los partidos en ventana y ningún `HTTP 403`.

- [ ] **Step 5: Commit**

```bash
git add .env.example AGENTS.md
git commit -m "docs(sofascore): documenta el token anti-captcha Turnstile"
```
