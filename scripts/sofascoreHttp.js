import CurlImpersonate from 'node-curl-impersonate';

const URL_PERMITIDA = /^https:\/\/www\.sofascore\.com\/api\/v1\/[A-Za-z0-9/_-]*$/;

const CABECERAS = {
  accept: 'application/json, text/plain, */*',
  referer: 'https://www.sofascore.com/',
  origin: 'https://www.sofascore.com'
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;

const CAPTCHA_CHALLENGE_RE = /"reason"\s*:\s*"challenge"/;

let ultimoAvisoCaptcha = 0;
const AVISO_CAPTCHA_MS = 5 * 60_000;

// Imports lazy con try/catch: en Vercel no hay cache local de token; se scrapea sin token.
// El CAPTCHA_FAILED se loguea (con límite) para que el operador vea cómo renovar.
const cargarTokenPorDefecto = async () => {
  try {
    const { getSofascoreToken } = await import('./sofascoreToken.js');
    return getSofascoreToken();
  } catch (e) {
    if (String(e?.message).startsWith('CAPTCHA_FAILED') && Date.now() - ultimoAvisoCaptcha > AVISO_CAPTCHA_MS) {
      ultimoAvisoCaptcha = Date.now();
      console.error(`${new Date().toISOString()} ${e.message}`);
    }
    return null;
  }
};

const invalidarTokenPorDefecto = async () => {
  try {
    const { invalidarCache } = await import('./sofascoreToken.js');
    invalidarCache();
  } catch {}
};

export function validarUrlSofascore(url) {
  return typeof url === 'string' && url.length <= 200 && URL_PERMITIDA.test(url);
}

export function backoffDelay(attempt, random = Math.random) {
  return 300 * 2 ** attempt + random() * 200;
}

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

export function requestWithTimeout(endpointUrl, timeoutMs = DEFAULT_TIMEOUT_MS, request = makeSofascoreRequest) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
  });
  const peticion = Promise.resolve().then(() => request(endpointUrl));
  return Promise.race([peticion, timeout]).finally(() => clearTimeout(timer));
}

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
