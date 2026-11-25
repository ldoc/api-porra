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

// ¿Hay que refrescar? Sin exp reconocible (propio o decodificado del token) o expirando dentro del margen.
export function necesitaRefresco(cache, ahoraMs = Date.now(), margenMs = REFRESH_MARGIN_MS) {
  const expMs = cache?.exp ?? (cache?.token ? decodeJwtExpMs(cache.token) : null);
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

// URL para renovar a mano en el navegador de confianza (Turnstile resuelve pasivo).
export const RENOVACION_URL = 'https://www.sofascore.com/captcha.html?redirectUrl=' +
  encodeURIComponent('https://www.sofascore.com/');

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

// CLI: renovación manual de la cache y verificación/auto-refresco del token.
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
    const token = args[0] === '--set' ? args[1] : await getSofascoreToken();
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
