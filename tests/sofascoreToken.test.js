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
