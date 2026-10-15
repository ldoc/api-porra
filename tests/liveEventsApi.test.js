import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveEventsResponse, liveEventsQuery } from '../api/live.js';
import { computeWeakEtag, etagMatches } from '../api/etag.js';

test('buildLiveEventsResponse ordena por ts y usa el serverTime recibido', () => {
  const docs = [
    { _id: 'b', eventId: 2, ts: new Date('2026-09-16T20:05:00Z'), ingestedAt: new Date('2026-09-16T20:06:00Z') },
    { _id: 'a', eventId: 1, ts: new Date('2026-09-16T20:01:00Z'), ingestedAt: new Date('2026-09-16T20:02:00Z') }
  ];
  const res = buildLiveEventsResponse(docs, '2026-09-16T20:06:00.000Z');
  assert.deepEqual(res.events.map(d => d._id), ['a', 'b']);
  assert.equal(res.serverTime, '2026-09-16T20:06:00.000Z');
  assert.deepEqual(buildLiveEventsResponse([], null), { ok: true, events: [], serverTime: null });
});

test('liveEventsQuery construye el filtro delta por ingestedAt', () => {
  assert.deepEqual(liveEventsQuery(null), {});
  const since = new Date('2026-09-16T20:00:00Z');
  assert.deepEqual(liveEventsQuery(since), { ingestedAt: { $gt: since } });
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
