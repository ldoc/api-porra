// /home/ldoc/Proyectos/api-porra/tests/liveScrape.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveArgs, shouldDeleteLive } from '../scripts/liveScrape.js';

test('parsea ids e intervalo', () => {
  assert.deepEqual(parseLiveArgs(['14566909', '14566910', '--interval', '60']), { eventIds: [14566909, 14566910], intervalMs: 60000 });
});

test('intervalo por defecto 120s', () => {
  assert.deepEqual(parseLiveArgs(['5']), { eventIds: [5], intervalMs: 120000 });
});

test('rechaza sin ids', () => {
  assert.throws(() => parseLiveArgs([]), /eventId/);
});

test('borra tras 30 min de finishedAt', () => {
  const old = new Date(Date.now() - 31 * 60 * 1000);
  assert.equal(shouldDeleteLive(old, new Date()), true);
  assert.equal(shouldDeleteLive(new Date(), new Date()), false);
  assert.equal(shouldDeleteLive(null, new Date()), false);
});
