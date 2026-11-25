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
  getSofascoreToken,
  RENOVACION_URL
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

test('getSofascoreToken: cache válida → devuelve el token', () => {
  const ruta = rutaTemp();
  const token = jwtConExp((Date.now() + REFRESH_MARGIN_MS * 2) / 1000);
  escribirCache(token, { ruta });
  assert.equal(getSofascoreToken({ env: {}, ruta }), token);
});
