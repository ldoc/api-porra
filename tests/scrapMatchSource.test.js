import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIncidents, buildAssistsMap } from '../scripts/matchStats.js';

test('normalizeIncidents mapea goal, penalty, card, sub, var', () => {
  const raw = { incidents: [
    { id: 5, incidentType: 'goal', incidentClass: 'regular', time: 22, isHome: true, homeScore: 1, awayScore: 0, player: { id: 11 }, footballPassingNetworkAction: [{ player: { id: 12 } }] },
    { id: 6, incidentType: 'card', incidentClass: 'yellow', time: 33, isHome: false, player: { id: 22 } },
    { id: 7, incidentType: 'substitution', incidentClass: 'regular', time: 60, isHome: true, playerIn: { id: 30 }, playerOut: { id: 11 } },
    { id: 8, incidentType: 'inGamePenalty', incidentClass: 'missed', time: 70, isHome: true, player: { id: 21 }, footballPassingNetworkAction: [{ goalkeeper: { id: 12 } }] },
    { id: 9, incidentType: 'varDecision', incidentClass: 'goalDisallowed', time: 43, isHome: true, player: { id: 11 } }
  ] };
  const out = normalizeIncidents(raw, 1, 2);
  const by = (t) => out.find(i => i.type === t);
  assert.equal(by('goal').sourceId, '5');
  assert.equal(by('goal').playerId, 11);
  assert.equal(by('goal').assistId, 12);
  assert.equal(by('goal').teamId, 1);
  assert.equal(by('card').cardType, 'yellow');
  assert.equal(by('substitution').inId, 30);
  assert.equal(by('substitution').teamId, 1);
  assert.equal(by('penalty_saved').keeperId, 12);
  assert.equal(by('goal_cancelled').class, 'goalDisallowed');
});

test('buildAssistsMap extrae asistencias por jugador', () => {
  const data = { playerStatistics: [
    { playerId: 11, statistics: [{ key: 'assists', value: '2' }] },
    { playerId: 12, statistics: [{ key: 'goals', value: '1' }] }
  ] };
  assert.deepEqual(buildAssistsMap(data), { 11: 2 });
});
