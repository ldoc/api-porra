import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSinceParam } from '../api/matchStatsFilter.js';

test('acepta ausencia de since', () => {
  assert.deepEqual(parseSinceParam(null), { ok: true, date: null });
});

test('acepta since vacio', () => {
  assert.deepEqual(parseSinceParam(''), { ok: true, date: null });
});

test('acepta fecha ISO valida', () => {
  const result = parseSinceParam('2026-08-21T17:21:56.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.date.toISOString(), '2026-08-21T17:21:56.000Z');
});

test('rechaza valor no fecha', () => {
  assert.deepEqual(parseSinceParam('ayer'), { ok: false });
});

test('rechaza timestamp numerico crudo', () => {
  assert.deepEqual(parseSinceParam('1756000000000'), { ok: false });
});
