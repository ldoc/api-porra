import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveEventsResponse, liveEventsQuery, maxIngestedAt, liveEventsVersion, shouldReturn304, buildScrapeLog, buildLiveHealth } from '../api/live.js';
import { computeWeakEtag, etagMatches } from '../api/etag.js';

test('buildLiveEventsResponse ordena por ts y usa el serverTime recibido', () => {
  const docs = [
    { _id: 'b', eventId: 2, ts: new Date('2026-09-16T20:05:00Z'), ingestedAt: new Date('2026-09-16T20:06:00Z') },
    { _id: 'a', eventId: 1, ts: new Date('2026-09-16T20:01:00Z'), ingestedAt: new Date('2026-09-16T20:02:00Z') }
  ];
  const res = buildLiveEventsResponse(docs, '2026-09-16T20:06:00.000Z');
  assert.deepEqual(res.events.map(d => d._id), ['a', 'b']);
  assert.equal(res.serverTime, '2026-09-16T20:06:00.000Z');
  assert.deepEqual(buildLiveEventsResponse([], null), { ok: true, events: [], serverTime: null, resync: false });
});

test('buildLiveEventsResponse ordena por ts y desempata por seq', () => {
  const docs = [
    { _id: 'b', ts: new Date('2026-09-16T20:01:00Z'), seq: 2 },
    { _id: 'c', ts: new Date('2026-09-16T20:01:00Z'), seq: 1 },
    { _id: 'a', ts: new Date('2026-09-16T20:00:00Z'), seq: 9 }
  ];
  const res = buildLiveEventsResponse(docs, null);
  assert.deepEqual(res.events.map(d => d._id), ['a', 'c', 'b']);
});

test('buildLiveEventsResponse expone resync', () => {
  assert.equal(buildLiveEventsResponse([], null, true).resync, true);
  assert.equal(buildLiveEventsResponse([], null).resync, false);
});

test('serverTime usa el maximo de los docs devueltos (no el global)', () => {
  const docs = [
    { _id: 'a', ingestedAt: new Date('2026-09-16T20:01:00Z') },
    { _id: 'b', ingestedAt: new Date('2026-09-16T20:03:00Z') }
  ];
  const res = buildLiveEventsResponse(docs, new Date(maxIngestedAt(docs)).toISOString());
  assert.equal(res.serverTime, '2026-09-16T20:03:00.000Z');
});

test('liveEventsQuery construye el filtro delta por ingestedAt', () => {
  assert.deepEqual(liveEventsQuery(null), {});
  const since = new Date('2026-09-16T20:00:00Z');
  assert.deepEqual(liveEventsQuery(since), { ingestedAt: { $gt: since } });
});

test('liveEventsQuery excluye sim por defecto', () => {
  assert.deepEqual(liveEventsQuery(null, { excludeSim: true }), { source: { $ne: 'sim' } });
  const since = new Date('2026-09-16T20:00:00Z');
  assert.deepEqual(liveEventsQuery(since, { excludeSim: true }), {
    ingestedAt: { $gt: since },
    source: { $ne: 'sim' }
  });
});

test('delta por ingestedAt excluye el cursor y toma serverTime = max(ingestedAt)', () => {
  const since = new Date('2026-09-16T20:00:00Z');
  const docs = [
    { _id: 'old', ingestedAt: new Date('2026-09-16T19:59:00Z') },
    { _id: 'n1', ingestedAt: new Date('2026-09-16T20:01:00Z') },
    { _id: 'n2', ingestedAt: new Date('2026-09-16T20:00:00Z') }
  ];
  const filter = liveEventsQuery(since);
  const delta = docs.filter(d => d.ingestedAt > filter.ingestedAt.$gt);
  assert.deepEqual(delta.map(d => d._id), ['n1']);
  const serverTime = delta.reduce((max, d) => (d.ingestedAt > max ? d.ingestedAt : max), new Date(0));
  assert.equal(serverTime.toISOString(), '2026-09-16T20:01:00.000Z');
});

test('GET /api/live/events: mismo cuerpo+serverTime => ETag estable => 304', () => {
  const docs = [
    { _id: 'a', eventId: 1, ts: new Date('2026-09-16T20:01:00Z'), ingestedAt: new Date('2026-09-16T20:02:00Z') }
  ];
  const body1 = JSON.stringify(buildLiveEventsResponse(docs, '2026-09-16T20:02:00.000Z'));
  const body2 = JSON.stringify(buildLiveEventsResponse(docs, '2026-09-16T20:02:00.000Z'));
  const etag = computeWeakEtag(body1);
  assert.equal(etag, computeWeakEtag(body2));
  assert.equal(etagMatches(etag, computeWeakEtag(body2)), true);
});

test('GET /api/live/events: nuevo evento (serverTime cambia) => ETag distinto', () => {
  const docs = [
    { _id: 'a', eventId: 1, ts: new Date('2026-09-16T20:01:00Z'), ingestedAt: new Date('2026-09-16T20:02:00Z') }
  ];
  const before = computeWeakEtag(JSON.stringify(buildLiveEventsResponse(docs, '2026-09-16T20:02:00.000Z')));
  const after = computeWeakEtag(JSON.stringify(buildLiveEventsResponse(docs, '2026-09-16T20:05:00.000Z')));
  assert.notEqual(before, after);
});

test('la version del endpoint cambia cuando cambia ingestedAt maximo', () => {
  assert.equal(liveEventsVersion([{ ingestedAt: new Date('2026-09-16T20:01:00Z') }]), '2026-09-16T20:01:00.000Z');
  assert.notEqual(
    liveEventsVersion([{ ingestedAt: new Date('2026-09-16T20:01:00Z') }]),
    liveEventsVersion([{ ingestedAt: new Date('2026-09-16T20:02:00Z') }])
  );
});

test('liveEventsVersion sin docs devuelve epoch', () => {
  assert.equal(liveEventsVersion([]), '1970-01-01T00:00:00.000Z');
  assert.equal(liveEventsVersion(null), '1970-01-01T00:00:00.000Z');
});

test('shouldReturn304 exige version, since, source y ETag coincidentes', () => {
  const cached = { version: '2026-09-16T20:01:00.000Z', since: '', etag: 'W/"abc"', source: 'default' };
  const base = { cached, version: cached.version, since: '', source: 'default', ifNoneMatch: 'W/"abc"' };
  assert.equal(shouldReturn304(base), true);
  assert.equal(shouldReturn304({ ...base, ifNoneMatch: undefined }), false);
  assert.equal(shouldReturn304({ ...base, version: '2026-09-16T20:02:00.000Z' }), false);
  assert.equal(shouldReturn304({ ...base, since: '2026-09-16T20:00:00.000Z' }), false);
  assert.equal(shouldReturn304({ ...base, source: 'sim' }), false);
  assert.equal(shouldReturn304({ ...base, cached: { ...cached, etag: null } }), false);
});

test('shouldReturn304 sin cache no devuelve 304', () => {
  assert.equal(shouldReturn304({ cached: null, version: 'v1', since: '', ifNoneMatch: 'W/"abc"' }), false);
});

test('buildScrapeLog emite el log estructurado del tick', () => {
  const log = buildScrapeLog({
    startedMs: Date.parse('2026-09-16T20:00:00Z'),
    nowMs: Date.parse('2026-09-16T20:00:02Z'),
    live: 3,
    ok: 2,
    inserted: 5
  });
  assert.deepEqual(log, {
    t: '2026-09-16T20:00:02.000Z',
    live: 3,
    ok: 2,
    inserted: 5,
    ms: 2000
  });
});

test('buildScrapeLog normaliza contadores y ms', () => {
  const log = buildScrapeLog({ startedMs: 2000, nowMs: 1000 });
  assert.deepEqual(log, {
    t: '1970-01-01T00:00:01.000Z',
    live: 0,
    ok: 0,
    inserted: 0,
    ms: 0
  });
});

test('buildLiveHealth expone solo ok y lastScrapeAt', () => {
  const now = Date.parse('2026-09-16T20:00:00Z');
  assert.deepEqual(buildLiveHealth(null, true, now), { ok: false, lastScrapeAt: null });
  assert.deepEqual(buildLiveHealth(new Date('invalid'), true, now), { ok: false, lastScrapeAt: null });
  const fresh = new Date('2026-09-16T19:59:30Z');
  assert.deepEqual(buildLiveHealth(fresh, true, now), {
    ok: true,
    lastScrapeAt: '2026-09-16T19:59:30.000Z'
  });
});

test('buildLiveHealth marca stale pasado el umbral', () => {
  const now = Date.parse('2026-09-16T20:00:00Z');
  const edge = new Date(now - 90000);
  assert.equal(buildLiveHealth(edge, true, now).ok, true);
  assert.equal(buildLiveHealth(new Date(now - 90001), true, now).ok, false);
});

test('buildLiveHealth respeta lastScrapeOk', () => {
  const now = Date.parse('2026-09-16T20:00:00Z');
  const fresh = new Date(now - 1000);
  assert.equal(buildLiveHealth(fresh, false, now).ok, false);
  assert.equal(buildLiveHealth(fresh, true, now).ok, true);
});

test('buildLiveHealth ok tras un tick sin partidos en ventana', () => {
  const now = Date.parse('2026-09-16T20:00:00Z');
  assert.equal(buildLiveHealth(new Date(now - 1000), true, now).ok, true);
});
