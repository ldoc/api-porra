// /home/ldoc/Proyectos/api-porra/tests/liveScrape.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveArgs, shouldDeleteLive, buildLiveUpdate } from '../scripts/liveScrape.js';

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

test('no voltea local/visitante aunque id visitante < id local (Viking 1164 vs Stuttgart 2677)', () => {
  // Object.keys ordena claves numéricas de menor a mayor: ['1164','2677','jugadores']
  const stats = { 2677: { goles: 3 }, 1164: { goles: 1 }, jugadores: [] };
  assert.deepEqual(Object.keys(stats).filter(k => k !== 'jugadores'), ['1164', '2677']);
  const eventInfo = { estado: 'live', minuto: 67, homeTeamId: 2677, awayTeamId: 1164, homeGoles: 3, awayGoles: 1 };
  const update = buildLiveUpdate(16939028, eventInfo, stats);
  assert.equal(update.homeTeamId, 2677);
  assert.equal(update.awayTeamId, 1164);
  assert.equal(update.homeGoles, 3);
  assert.equal(update.awayGoles, 1);
  assert.equal(update.finishedAt, undefined);
});

test('fija finishedAt al finalizar y usa goles del evento si faltan en stats', () => {
  const eventInfo = { estado: 'finalizado', minuto: 90, homeTeamId: 1, awayTeamId: 2, homeGoles: 2, awayGoles: 2 };
  const update = buildLiveUpdate(7, eventInfo, { jugadores: [] });
  assert.ok(update.finishedAt instanceof Date);
  assert.equal(update.homeGoles, 2);
  assert.equal(update.awayGoles, 2);
});
