import test from 'node:test';
import assert from 'node:assert/strict';
import { isLiveWindow, getLiveRefreshSecs, buildLiveDoc, selectLiveMatches, buildLiveResponse, minuteToStatus, liveStatusFromSofascore, liveMinute } from '../api/live.js';

const H = 3600;
const nowMs = Date.parse('2026-09-16T20:00:00Z');

test('isLiveWindow cubre [inicio-15min, fin+120min]', () => {
  const inicio = nowMs / 1000 - H; // empezó hace 1h
  assert.equal(isLiveWindow(inicio, nowMs), true);
  const manana = nowMs / 1000 + 20 * H;
  assert.equal(isLiveWindow(manana, nowMs), false);
  const haceMucho = nowMs / 1000 - 5 * H;
  assert.equal(isLiveWindow(haceMucho, nowMs), false);
});

test('getLiveRefreshSecs con default 60', () => {
  assert.equal(getLiveRefreshSecs(null), 60);
  assert.equal(getLiveRefreshSecs({}), 60);
  assert.equal(getLiveRefreshSecs({ liveRefreshSecs: 30 }), 30);
  assert.equal(getLiveRefreshSecs({ liveRefreshSecs: -5 }), 60);
  assert.equal(getLiveRefreshSecs({ liveRefreshSecs: 'mucho' }), 60);
});

test('buildLiveDoc caduca a fin de dia UTC', () => {
  const doc = buildLiveDoc(1, { a: 1 }, 'LIVE', nowMs);
  assert.equal(doc.eventId, 1);
  assert.equal(doc.status, 'LIVE');
  assert.equal(doc.expireAt.toISOString(), '2026-09-16T23:59:59.000Z');
});

test('selectLiveMatches filtra por ventana', () => {
  const cal = [
    { id: 1, fecha: nowMs / 1000 - H },
    { id: 2, fecha: nowMs / 1000 + 20 * H }
  ];
  assert.deepEqual(selectLiveMatches(cal, nowMs).map(m => m.id), [1]);
});

test('minuteToStatus mapea 45/90/final', () => {
  assert.equal(minuteToStatus(10), 'LIVE');
  assert.equal(minuteToStatus(46), 'HT');
  assert.equal(minuteToStatus(95), 'FT');
});

test('buildLiveResponse ordena por eventId y serverTime es el max', () => {
  const docs = [
    { eventId: 9, stats: {}, status: 'LIVE', lastUpdated: new Date('2026-09-16T20:01:00Z') },
    { eventId: 3, stats: {}, status: 'HT', lastUpdated: new Date('2026-09-16T20:05:00Z') }
  ];
  const res = buildLiveResponse(docs);
  assert.equal(res.ok, true);
  assert.deepEqual(res.liveMatches.map(d => d.eventId), [3, 9]);
  assert.equal(res.serverTime, '2026-09-16T20:05:00.000Z');
  assert.deepEqual(buildLiveResponse([]), { ok: true, liveMatches: [], serverTime: null });
});

test('buildLiveDoc incluye minute y lo deja null si falta', () => {
  const conMinuto = buildLiveDoc(1, { a: 1 }, 'LIVE', nowMs, 37);
  assert.equal(conMinuto.minute, 37);
  assert.equal(conMinuto.expireAt.toISOString(), '2026-09-16T23:59:59.000Z');
  const sinMinuto = buildLiveDoc(1, { a: 1 }, 'HT', nowMs);
  assert.equal(sinMinuto.minute, null);
});

test('liveStatusFromSofascore mapea estados de Sofascore', () => {
  assert.equal(liveStatusFromSofascore('inprogress'), 'LIVE');
  assert.equal(liveStatusFromSofascore('halftime'), 'HT');
  assert.equal(liveStatusFromSofascore('finished'), 'FT');
  assert.equal(liveStatusFromSofascore('notstarted'), 'NS');
  assert.equal(liveStatusFromSofascore('willsoonstart'), 'NS');
  assert.equal(liveStatusFromSofascore('postponed'), null);
  assert.equal(liveStatusFromSofascore('canceled'), null);
  assert.equal(liveStatusFromSofascore(undefined), null);
});

test('buildLiveDoc con estado NS deja minute null', () => {
  const doc = buildLiveDoc(1, { jugadores: [] }, 'NS', nowMs, null);
  assert.equal(doc.status, 'NS');
  assert.equal(doc.minute, null);
});

test('liveMinute deriva el minuto por periodo', () => {
  const t0 = 1791910027;
  assert.equal(liveMinute('period1', t0, t0), 1);
  assert.equal(liveMinute('period1', t0, t0 + 29 * 60), 30);
  assert.equal(liveMinute('period2', t0, t0 + 5 * 60), 51);
  assert.equal(liveMinute('halftime', t0, t0), null);
  assert.equal(liveMinute('period1', undefined, t0), null);
});
