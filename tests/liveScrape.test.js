// /home/ldoc/Proyectos/api-porra/tests/liveScrape.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveArgs, shouldDeleteLive, buildLiveUpdate } from '../scripts/liveScrape.js';
import { mapLiveIncidents } from '../scripts/matchStats.js';

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

test('buildLiveUpdate guarda últimos 20 incidents', () => {
  const inc = Array.from({ length: 25 }, (_, i) => ({ key: `s${i}`, tipo: 'sub', minuto: 60 + i, teamId: 2677, playerId: 9, playerName: 'X' }));
  const u = buildLiveUpdate(16939028, { estado: 'live', minuto: 80, homeTeamId: 2677, awayTeamId: 1164, homeGoles: 3, awayGoles: 1 }, { jugadores: [] }, inc);
  assert.equal(u.incidents.length, 20);
  assert.equal(u.incidents[19].key, 's24');
});

test('mapLiveIncidents guarda el que sale (playerOut) en sustituciones', () => {
  const out = mapLiveIncidents([{ incidentType: 'substitution', time: 70, team: { id: 2677 }, playerIn: { id: 9, name: 'Entra' }, playerOut: { id: 10, name: 'Sale' } }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].tipo, 'sub');
  assert.equal(out[0].playerName, 'Entra');
  assert.equal(out[0].playerOut, 'Sale');
  assert.equal(out[0].playerOutId, 10);
});

test('mapLiveIncidents mapea color de tarjeta (yellow→amarilla, red/yellowRed→roja)', () => {
  const out = mapLiveIncidents([
    { incidentType: 'card', incidentClass: 'yellow', time: 30, team: { id: 1 }, player: { id: 5, name: 'A' } },
    { incidentType: 'card', incidentClass: 'red', time: 80, team: { id: 2 }, player: { id: 6, name: 'B' } },
    { incidentType: 'card', incidentClass: 'yellowRed', time: 85, team: { id: 2 }, player: { id: 7, name: 'C' } }
  ]);
  assert.deepEqual(out.map(i => i.color), ['amarilla', 'roja', 'roja']);
  assert.equal(out[0].tipo, 'card');
});

test('buildLiveUpdate preserva incidents previos cuando el fetch falla (null)', () => {
  const prev = [{ key: 'sub-70-9', tipo: 'sub', minuto: 70, teamId: 2677, playerId: 9, playerName: 'X' }];
  const u = buildLiveUpdate(1, { estado: 'live', minuto: 75, homeTeamId: 1, awayTeamId: 2, homeGoles: 1, awayGoles: 0 }, { jugadores: [] }, null, prev);
  assert.deepEqual(u.incidents, prev);
});

test('buildLiveUpdate con fetch OK vacío ([]) no resucita incidents previos', () => {
  const prev = [{ key: 'sub-70-9', tipo: 'sub', minuto: 70, teamId: 2677, playerId: 9, playerName: 'X' }];
  const u = buildLiveUpdate(1, { estado: 'live', minuto: 75, homeTeamId: 1, awayTeamId: 2, homeGoles: 1, awayGoles: 0 }, { jugadores: [] }, [], prev);
  assert.deepEqual(u.incidents, []);
});
