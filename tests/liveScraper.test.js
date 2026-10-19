import test from 'node:test';
import assert from 'node:assert/strict';
import {
  liveSnapshotHash,
  isDuplicateWriteError,
  shouldRefreshLineups,
  isCacheableLineups
} from '../scripts/liveScraper.js';

function baseObs() {
  return {
    status: 'LIVE',
    period: 'period2',
    minute: 60,
    score: { home: 1, away: 0 },
    incidents: [{}, {}],
    ratings: { 10: 6.5, 11: 7.1 },
    assists: { 10: 1 },
    starters: [11, 9, 10]
  };
}

test('liveSnapshotHash: snapshot idéntico produce el mismo hash', () => {
  assert.equal(liveSnapshotHash(baseObs()), liveSnapshotHash(baseObs()));
});

test('liveSnapshotHash: el orden de ratings/assists/starters no altera el hash', () => {
  const a = baseObs();
  const b = baseObs();
  b.ratings = { 11: 7.1, 10: 6.5 };
  b.assists = { 10: 1 };
  b.starters = [10, 11, 9];
  assert.equal(liveSnapshotHash(a), liveSnapshotHash(b));
});

test('liveSnapshotHash: cambia solo por rating', () => {
  const a = baseObs();
  const b = baseObs();
  b.ratings = { 10: 6.6, 11: 7.1 };
  assert.notEqual(liveSnapshotHash(a), liveSnapshotHash(b));
});

test('liveSnapshotHash: cambia solo por asistencia', () => {
  const a = baseObs();
  const b = baseObs();
  b.assists = { 10: 2 };
  assert.notEqual(liveSnapshotHash(a), liveSnapshotHash(b));
});

test('liveSnapshotHash: cambia por status, periodo, minuto o marcador', () => {
  const a = baseObs();
  for (const mutate of [
    o => { o.status = 'HT'; },
    o => { o.period = 'period1'; },
    o => { o.minute = 61; },
    o => { o.score = { home: 1, away: 1 }; }
  ]) {
    const b = baseObs();
    mutate(b);
    assert.notEqual(liveSnapshotHash(a), liveSnapshotHash(b));
  }
});

test('liveSnapshotHash: cambia al cambiar los starters', () => {
  const a = baseObs();
  const b = baseObs();
  b.starters = [11, 9, 12];
  assert.notEqual(liveSnapshotHash(a), liveSnapshotHash(b));
});

test('isDuplicateWriteError: batch mixto con code 11000 arriba no es duplicado', () => {
  assert.equal(isDuplicateWriteError({
    code: 11000,
    writeErrors: [{ code: 11000 }, { code: 121 }]
  }), false);
});

test('isDuplicateWriteError: batch con todos los writeErrors duplicados es duplicado', () => {
  assert.equal(isDuplicateWriteError({
    code: 11000,
    writeErrors: [{ code: 11000 }, { code: 11000 }]
  }), true);
});

test('isDuplicateWriteError: códigos reales y casos límite', () => {
  assert.equal(isDuplicateWriteError({ code: 121 }), false);
  assert.equal(isDuplicateWriteError({ code: 11000 }), true);
  assert.equal(isDuplicateWriteError(null), false);
  assert.equal(isDuplicateWriteError(new Error('boom')), false);
  assert.equal(isDuplicateWriteError({ writeErrors: [] }), false);
});

test('shouldRefreshLineups: frescos, mismo estado y sin sustitución → false', () => {
  assert.equal(shouldRefreshLineups({
    cachedAt: 1000,
    statusKey: 'inprogress|period1',
    cachedStatusKey: 'inprogress|period1',
    hasSubstitution: false,
    nowMs: 1000 + 299999
  }), false);
});

test('shouldRefreshLineups: supera el TTL → true', () => {
  assert.equal(shouldRefreshLineups({
    cachedAt: 1000,
    statusKey: 'inprogress|period1',
    cachedStatusKey: 'inprogress|period1',
    hasSubstitution: false,
    nowMs: 1000 + 300000
  }), true);
});

test('shouldRefreshLineups: cambia el estado/periodo → true', () => {
  assert.equal(shouldRefreshLineups({
    cachedAt: 1000,
    statusKey: 'halftime|period1',
    cachedStatusKey: 'inprogress|period1',
    hasSubstitution: false,
    nowMs: 1001
  }), true);
});

test('shouldRefreshLineups: hay sustitución nueva → true', () => {
  assert.equal(shouldRefreshLineups({
    cachedAt: 1000,
    statusKey: 'inprogress|period2',
    cachedStatusKey: 'inprogress|period2',
    hasSubstitution: true,
    nowMs: 1001
  }), true);
});

test('shouldRefreshLineups: sin caché → true', () => {
  assert.equal(shouldRefreshLineups({
    cachedAt: null,
    statusKey: 'inprogress|period1',
    cachedStatusKey: undefined,
    hasSubstitution: false,
    nowMs: 1
  }), true);
});

test('isCacheableLineups: no cachea payload vacío o parcial', () => {
  assert.equal(isCacheableLineups(null), false);
  assert.equal(isCacheableLineups({}), false);
  assert.equal(isCacheableLineups({ home: { players: [] }, away: { players: [{ player: { id: 1 } }] } }), false);
  assert.equal(isCacheableLineups({ home: { players: [{ player: { id: 1 } }] }, away: { players: [] } }), false);
});

test('isCacheableLineups: cachea cuando ambos lados tienen jugadores', () => {
  assert.equal(isCacheableLineups({
    home: { players: [{ player: { id: 1 } }] },
    away: { players: [{ player: { id: 2 } }] }
  }), true);
});
