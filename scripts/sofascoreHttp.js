import CurlImpersonate from 'node-curl-impersonate';

const URL_PERMITIDA = /^https:\/\/www\.sofascore\.com\/api\/v1\/[A-Za-z0-9/_-]*$/;

const CABECERAS = {
  accept: 'application/json, text/plain, */*',
  referer: 'https://www.sofascore.com/',
  origin: 'https://www.sofascore.com'
};

export function validarUrlSofascore(url) {
  return typeof url === 'string' && url.length <= 200 && URL_PERMITIDA.test(url);
}

export async function fetchSofascore(endpointUrl) {
  if (!validarUrlSofascore(endpointUrl)) {
    throw new Error('URL de Sofascore no permitida');
  }

  const res = await new CurlImpersonate(endpointUrl, {
    method: 'GET',
    headers: { ...CABECERAS },
    impersonate: 'firefox-117'
  }).makeRequest();

  if (res.statusCode === 404) throw new Error('NOT_FOUND');
  if (res.statusCode !== 200) throw new Error('HTTP ' + res.statusCode);

  try {
    return JSON.parse(res.response);
  } catch {
    throw new Error('Respuesta no JSON de Sofascore');
  }
}
