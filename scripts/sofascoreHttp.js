import CurlImpersonate from 'node-curl-impersonate';

const URL_PERMITIDA = /^https:\/\/www\.sofascore\.com\/api\/v1\/[A-Za-z0-9/_-]*$/;

const CABECERAS = {
  accept: 'application/json, text/plain, */*',
  referer: 'https://www.sofascore.com/',
  origin: 'https://www.sofascore.com'
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;

export function validarUrlSofascore(url) {
  return typeof url === 'string' && url.length <= 200 && URL_PERMITIDA.test(url);
}

export function backoffDelay(attempt, random = Math.random) {
  return 300 * 2 ** attempt + random() * 200;
}

function makeSofascoreRequest(endpointUrl) {
  return new CurlImpersonate(endpointUrl, {
    method: 'GET',
    headers: { ...CABECERAS },
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
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random
} = {}) {
  if (!validarUrlSofascore(endpointUrl)) {
    throw new Error('URL de Sofascore no permitida');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await requestWithTimeout(endpointUrl, timeoutMs, request);
      if (res.statusCode === 404) throw new Error('NOT_FOUND');
      if (res.statusCode !== 200) throw new Error('HTTP ' + res.statusCode);

      try {
        return JSON.parse(res.response);
      } catch {
        throw new Error('Respuesta no JSON de Sofascore');
      }
    } catch (e) {
      if (attempt === retries || e.message === 'NOT_FOUND' || e.message === 'URL de Sofascore no permitida') {
        throw e;
      }
      await sleep(backoffDelay(attempt, random));
    }
  }
}
