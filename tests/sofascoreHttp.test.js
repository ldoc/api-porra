import test from 'node:test';
import assert from 'node:assert/strict';
import { validarUrlSofascore } from '../scripts/sofascoreHttp.js';

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
