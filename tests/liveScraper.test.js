import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSnapshotHash, isDuplicateWriteError } from '../scripts/liveScraper.js';

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

test('isDuplicateWriteError: acepta código 11000 y writeErrors solo duplicados', () => {
  assert.equal(isDuplicateWriteError({ code: 11000 }), true);
  assert.equal(isDuplicateWriteError({ writeErrors: [{ code: 11000 }, { code: 11000 }] }), true);
});

test('isDuplicateWriteError: rechaza errores reales o mixtos', () => {
  assert.equal(isDuplicateWriteError(null), false);
  assert.equal(isDuplicateWriteError(new Error('boom')), false);
  assert.equal(isDuplicateWriteError({ writeErrors: [{ code: 11000 }, { code: 121 }] }), false);
  assert.equal(isDuplicateWriteError({ writeErrors: [] }), false);
});
