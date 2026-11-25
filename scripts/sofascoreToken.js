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
