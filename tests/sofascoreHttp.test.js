import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validarUrlSofascore,
  fetchSofascore,
  requestWithTimeout,
  backoffDelay
} from '../scripts/sofascoreHttp.js';

const URL_OK = 'https://www.sofascore.com/api/v1/event/1';

test('acepta URLs de la API de Sofascore', () => {
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/event/16939050'), true);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/event/16939050/lineups'), true);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/event/16939050/player/797291/statistics'), true);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/fantasy/event/16939050'), true);
});

test('rechaza otro host', () => {
  assert.equal(validarUrlSofascore('https://evil.example.com/api/v1/event/1'), false);
  assert.equal(validarUrlSofascore('https://sofascore.com.evil.com/api/v1/event/1'), false);
});

test('rechaza http y rutas fuera de la API', () => {
  assert.equal(validarUrlSofascore('http://www.sofascore.com/api/v1/event/1'), false);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/otra/ruta'), false);
});

test('rechaza caracteres de inyección de shell', () => {
  assert.equal(validarUrlSofascore("https://www.sofascore.com/api/v1/event/1'; rm -rf /"), false);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/event/1 $(whoami)'), false);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/event/1`id`'), false);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/event/1|cat /etc/passwd'), false);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/event/1\nwhoami'), false);
});

test('rechaza valores no string o demasiado largos', () => {
  assert.equal(validarUrlSofascore(undefined), false);
  assert.equal(validarUrlSofascore(123), false);
  assert.equal(validarUrlSofascore('https://www.sofascore.com/api/v1/' + 'a'.repeat(300)), false);
});

test('mantiene la firma pública esperada de fetchSofascore', () => {
  assert.equal(typeof fetchSofascore, 'function');
  assert.equal(fetchSofascore.length >= 1, true);
});

test('reintenta ante 500 y devuelve el JSON al recuperarse', { timeout: 2000 }, async () => {
  const llamadas = [];
  const esperas = [];
  const request = async (url) => {
    llamadas.push(url);
    return llamadas.length < 3
      ? { statusCode: 500, response: '' }
      : { statusCode: 200, response: '{"ok":true}' };
  };

  const data = await fetchSofascore(URL_OK, {
    request,
    sleep: async (ms) => { esperas.push(ms); },
    random: () => 0
  });

  assert.deepEqual(data, { ok: true });
  assert.equal(llamadas.length, 3);
  assert.deepEqual(esperas, [300, 600]);
});

test('reintenta ante 429', { timeout: 2000 }, async () => {
  let llamadas = 0;
  const request = async () => {
    llamadas++;
    return llamadas === 1
      ? { statusCode: 429, response: '' }
      : { statusCode: 200, response: '{"ok":true}' };
  };

  const data = await fetchSofascore(URL_OK, { request, sleep: async () => {} });

  assert.deepEqual(data, { ok: true });
  assert.equal(llamadas, 2);
});

test('no reintenta 404: lo propaga como NOT_FOUND', { timeout: 2000 }, async () => {
  let llamadas = 0;
  const request = async () => {
    llamadas++;
    return { statusCode: 404, response: '' };
  };

  await assert.rejects(
    fetchSofascore(URL_OK, {
      request,
      sleep: async () => { throw new Error('no debería esperar entre reintentos'); }
    }),
    /NOT_FOUND/
  );
  assert.equal(llamadas, 1);
});

test('una URL no permitida no llega a hacer peticiones ni reintentos', { timeout: 2000 }, async () => {
  let llamadas = 0;
  const request = async () => {
    llamadas++;
    return { statusCode: 200, response: '{}' };
  };

  await assert.rejects(
    fetchSofascore('https://evil.example.com/api/v1/event/1', {
      request,
      sleep: async () => { throw new Error('no debería esperar entre reintentos'); }
    }),
    /URL de Sofascore no permitida/
  );
  assert.equal(llamadas, 0);
});

test('agota los reintentos por defecto (2) y lanza el último HTTP', { timeout: 2000 }, async () => {
  let llamadas = 0;
  const esperas = [];
  const request = async () => {
    llamadas++;
    return { statusCode: 503, response: '' };
  };

  await assert.rejects(
    fetchSofascore(URL_OK, {
      request,
      sleep: async (ms) => { esperas.push(ms); },
      random: () => 0.5
    }),
    /HTTP 503/
  );

  assert.equal(llamadas, 3);
  assert.deepEqual(esperas, [400, 700]);
});

test('aplica timeout y no reintenta errores no HTTP 429/5xx', { timeout: 2000 }, async () => {
  let llamadas = 0;
  const request = () => {
    llamadas++;
    return new Promise(() => {});
  };

  await assert.rejects(
    fetchSofascore(URL_OK, { request, timeoutMs: 10, retries: 1, sleep: async () => {} }),
    /TIMEOUT/
  );
  assert.equal(llamadas, 1);
});

test('no reintenta 400 ni otras respuestas no reintentables', { timeout: 2000 }, async () => {
  let llamadas = 0;
  const request = async () => {
    llamadas++;
    return { statusCode: 400, response: '' };
  };

  await assert.rejects(
    fetchSofascore(URL_OK, {
      request,
      sleep: async () => { throw new Error('no debería esperar'); }
    }),
    /HTTP 400/
  );
  assert.equal(llamadas, 1);
});

test('requestWithTimeout resuelve si la respuesta llega antes del timeout', { timeout: 2000 }, async () => {
  const res = await requestWithTimeout(URL_OK, 50, async () => ({ statusCode: 200 }));
  assert.equal(res.statusCode, 200);
});

test('requestWithTimeout rechaza con TIMEOUT si la petición no responde', { timeout: 2000 }, async () => {
  await assert.rejects(
    requestWithTimeout(URL_OK, 10, () => new Promise(() => {})),
    /TIMEOUT/
  );
});

test('lanza error si la respuesta no es JSON', { timeout: 2000 }, async () => {
  const request = async () => ({ statusCode: 200, response: 'no-json' });

  await assert.rejects(
    fetchSofascore(URL_OK, { request, sleep: async () => {} }),
    /Respuesta no JSON de Sofascore/
  );
});

test('backoffDelay crece exponencialmente y añade jitter acotado', () => {
  assert.equal(backoffDelay(0, () => 0), 300);
  assert.equal(backoffDelay(1, () => 0), 600);
  assert.equal(backoffDelay(2, () => 0), 1200);
  assert.equal(backoffDelay(0, () => 1), 500);
  assert.equal(backoffDelay(3, () => 0.5), 2400 + 100);
});
