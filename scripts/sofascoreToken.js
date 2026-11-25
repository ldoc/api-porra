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

const CAPTCHA_URL = 'https://www.sofascore.com/captcha.html?redirectUrl=' +
  encodeURIComponent('https://www.sofascore.com/');
const SOLVE_TIMEOUT_MS = 60_000;

async function lanzarChromium(opciones) {
  // Import lazy: en Vercel no está Playwright y este módulo no debe romper el deploy.
  const { chromium } = await import('playwright');
  return chromium.launch(opciones);
}

// Resuelve Turnstile en la página de captcha y captura el JWT del POST /token/captcha.
async function resolverTurnstile(lanzar) {
  const navegador = await lanzar();
  try {
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    const respuestaPromise = pagina.waitForResponse(
      r => r.url().includes('/api/v1/token/captcha') && r.status() === 200,
      { timeout: SOLVE_TIMEOUT_MS }
    );
    await pagina.goto(CAPTCHA_URL, { waitUntil: 'domcontentloaded' });
    const cuerpo = await (await respuestaPromise).json();
    if (!cuerpo?.token) throw new Error('respuesta sin token');
    return cuerpo.token;
  } finally {
    await navegador.close().catch(() => {});
  }
}

// Cascada: headless → headed → error con instrucciones manuales.
export async function refrescarConPlaywright({ lanzarNavegador } = {}) {
  const modos = [
    { nombre: 'headless', lanzar: () => (lanzarNavegador ?? lanzarChromium)({ headless: true }) },
    { nombre: 'headed', lanzar: () => (lanzarNavegador ?? lanzarChromium)({ headless: false }) }
  ];
  let ultimoError = null;
  for (const modo of modos) {
    try {
      const token = await resolverTurnstile(modo.lanzar);
      console.error(`${new Date().toISOString()} token Sofascore obtenido (${modo.nombre})`);
      return token;
    } catch (e) {
      ultimoError = e;
    }
  }
  throw new Error(
    'CAPTCHA_FAILED: Turnstile no resolvió (' + ultimoError?.message + '). ' +
    'Pega a mano el token de tu navegador (localStorage "sofa.captcha.token" o cookie ' +
    'sofa_captcha) en data/.sofascore-token.json {"token":"..."} o en la var de entorno ' +
    'SOFASCORE_CAPTCHA_TOKEN.'
  );
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

// CLI: sonda de factibilidad y utilidad de relleno manual de la cache.
const esCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esCli) {
  try {
    const token = await getSofascoreToken({ force: process.argv.includes('--force') });
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
