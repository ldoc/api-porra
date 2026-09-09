// /home/ldoc/Proyectos/api-porra/tests/liveMeta.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLiveMeta } from '../scripts/matchStats.js';

test('live segundo tiempo mapea minuto', () => {
  const ev = { event: { status: { type: 'inprogress', description: '2nd half' }, time: { minute: 67 }, homeTeam: { id: 42 }, awayTeam: { id: 2825 } } };
  assert.deepEqual(extractLiveMeta(ev, 2, 1), { estado: 'live', minuto: 67, homeTeamId: 42, awayTeamId: 2825, homeGoles: 2, awayGoles: 1 });
});

test('descanso mapea descanso', () => {
  const ev = { event: { status: { type: 'halftime' }, homeTeam: { id: 1 }, awayTeam: { id: 2 } } };
  assert.equal(extractLiveMeta(ev, 1, 1).estado, 'descanso');
});

test('finished mapea finalizado', () => {
  const ev = { event: { status: { type: 'finished' }, homeTeam: { id: 1 }, awayTeam: { id: 2 } } };
  assert.equal(extractLiveMeta(ev, 0, 0).estado, 'finalizado');
});

test('sin status conocido cae a live minuto 0', () => {
  const ev = { event: { homeTeam: { id: 1 }, awayTeam: { id: 2 } } };
  assert.deepEqual(extractLiveMeta(ev, 0, 0).minuto, 0);
});
