import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWeakEtag, etagMatches } from '../api/etag.js';

test('computeWeakEtag es determinista y tiene formato débil', () => {
  const json = JSON.stringify({ ok: true });
  assert.equal(computeWeakEtag(json), computeWeakEtag(json));
  assert.match(computeWeakEtag(json), /^W\/"[0-9a-f]{40}"$/);
});

test('computeWeakEtag distingue payloads distintos', () => {
  assert.notEqual(computeWeakEtag('{"a":1}'), computeWeakEtag('{"a":2}'));
});

test('etagMatches acepta el mismo etag débil', () => {
  assert.equal(etagMatches('W/"abc"', 'W/"abc"'), true);
});

test('etagMatches compara débilmente (con y sin prefijo W/)', () => {
  assert.equal(etagMatches('"abc"', 'W/"abc"'), true);
  assert.equal(etagMatches('W/"abc"', '"abc"'), true);
});

test('etagMatches acepta listas de etags separadas por comas', () => {
  assert.equal(etagMatches('W/"x1", W/"abc"', 'W/"abc"'), true);
});

test('etagMatches acepta el comodín *', () => {
  assert.equal(etagMatches('*', 'W/"abc"'), true);
});

test('etagMatches rechaza etags distintos', () => {
  assert.equal(etagMatches('W/"zzz"', 'W/"abc"'), false);
});

test('etagMatches devuelve false sin cabecera', () => {
  assert.equal(etagMatches(undefined, 'W/"abc"'), false);
});
