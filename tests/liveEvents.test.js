import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveEvents, foldScore, expireAtEndOfDayUTC, EVENT_TYPES } from '../api/liveEvents.js';

const NOW = Date.parse('2026-09-16T20:00:00Z');

function obs(extra = {}) {
  return {
    eventId: 100, status: 'LIVE', minute: 23, period: 'period1',
    score: { home: 0, away: 0 }, homeTeamId: 1, awayTeamId: 2,
    starters: [11, 12, 21, 22], ratings: {}, minutes: {}, incidents: [],
    ...extra
  };
}

test('expireAtEndOfDayUTC fija 23:59:59 UTC', () => {
  assert.equal(expireAtEndOfDayUTC(NOW).toISOString(), '2026-09-16T23:59:59.000Z');
});

test('EVENT_TYPES contiene los tipos esperados', () => {
  assert.deepEqual(EVENT_TYPES, ['lineup','status','goal','goal_cancelled','penalty_saved','penalty_missed','card','substitution','rating','score','match_final']);
});

test('deriveEvents emite lineup y status una sola vez', () => {
  const a = deriveEvents(obs(), [], NOW);
  assert.deepEqual(a.filter(e => e.type === 'lineup').length, 1);
  assert.deepEqual(a.filter(e => e.type === 'status').map(e => e.payload.status), ['LIVE']);
  const b = deriveEvents(obs(), a, NOW);
  assert.equal(b.filter(e => e.type === 'lineup').length, 0);
  assert.equal(b.filter(e => e.type === 'status').length, 0);
});

test('deriveEvents emite gol con isHome y no lo duplica', () => {
  const o = obs({ score: { home: 1, away: 0 }, incidents: [
    { sourceId: '5501', type: 'goal', class: 'regular', time: 22, isHome: true, playerId: 11, assistId: 12, homeScore: 1, awayScore: 0, teamId: 1 }
  ] });
  const evs = deriveEvents(o, [], NOW);
  const g = evs.find(e => e.type === 'goal');
  assert.ok(g);
  assert.equal(g.payload.isHome, true);
  assert.equal(g.payload.assistId, 12);
  assert.equal(g.minute, 22);
  const again = deriveEvents(o, evs, NOW);
  assert.equal(again.filter(e => e.type === 'goal').length, 0);
});

test('foldScore suma goles y aplica cancelaciones', () => {
  const events = [
    { sourceId: 'goal|a', type: 'goal', payload: { isHome: true } },
    { sourceId: 'goal|b', type: 'goal', payload: { isHome: false } },
    { sourceId: 'cancel|c', type: 'goal_cancelled', payload: { ofSourceId: 'goal|a' } }
  ];
  assert.deepEqual(foldScore(events), { home: 0, away: 1 });
});

test('deriveEvents corrige marcador si diverge', () => {
  const o = obs({ score: { home: 2, away: 1 } });
  const evs = deriveEvents(o, [], NOW);
  const s = evs.find(e => e.type === 'score');
  assert.ok(s);
  assert.deepEqual(s.payload, { scoreHome: 2, scoreAway: 1 });
});

test('deriveEvents emite rating solo cuando cambia el valor', () => {
  const o = obs({ ratings: { 11: 7.2 } });
  const evs = deriveEvents(o, [], NOW);
  assert.equal(evs.filter(e => e.type === 'rating').length, 1);
  const again = deriveEvents(o, evs, NOW);
  assert.equal(again.filter(e => e.type === 'rating').length, 0);
});

test('deriveEvents emite la reanudacion de la 2ª parte (LIVE→HT→LIVE)', () => {
  const a = deriveEvents(obs({ status: 'LIVE', period: 'period1' }), [], NOW);
  assert.equal(a.find(e => e.type === 'status').sourceId, 'status|LIVE|period1');
  const ht = deriveEvents(obs({ status: 'HT', period: 'halftime' }), a, NOW);
  const live2 = deriveEvents(obs({ status: 'LIVE', period: 'period2' }), [...a, ...ht], NOW);
  const st = live2.filter(e => e.type === 'status');
  assert.equal(st.length, 1);
  assert.equal(st[0].payload.period, 'period2');
});

test('deriveEvents ancla ts de status por periodo (2ª parte tras el descanso)', () => {
  const kickoffMs = Date.parse('2026-09-16T20:00:00Z');
  const ht = deriveEvents(obs({ kickoffMs, status: 'HT', period: 'halftime' }), [], NOW).find(e => e.type === 'status');
  const live2 = deriveEvents(obs({ kickoffMs, status: 'LIVE', period: 'period2' }), [], NOW).find(e => e.type === 'status');
  assert.equal(new Date(ht.ts).toISOString(), '2026-09-16T20:45:00.000Z');
  assert.equal(new Date(live2.ts).toISOString(), '2026-09-16T21:00:00.000Z');
});

test('deriveEvents ancla ts al kickoff programado (arranque tardío)', () => {
  const kickoffMs = Date.parse('2026-09-16T20:00:00Z');
  const o = obs({ kickoffMs, score: { home: 1, away: 0 }, incidents: [
    { sourceId: 'g', type: 'goal', class: 'regular', time: 22, isHome: true, playerId: 11, homeScore: 1, awayScore: 0, teamId: 1 }
  ] });
  const evs = deriveEvents(o, [], Date.parse('2026-09-16T20:30:00Z'));
  const g = evs.find(e => e.type === 'goal');
  assert.equal(new Date(g.ts).toISOString(), '2026-09-16T20:22:00.000Z');
});
