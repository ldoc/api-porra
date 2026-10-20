import test from 'node:test';
import assert from 'node:assert/strict';
import LiveEvent from '../db/models/LiveEvent.js';
import { deriveEvents } from '../api/liveEvents.js';

test('LiveEvent declara colección liveevents e índices', () => {
  assert.equal(LiveEvent.collection.name, 'liveevents');
  const idx = LiveEvent.schema.indexes();
  const unique = idx.find(([keys]) => keys.eventId === 1 && keys.sourceId === 1);
  assert.ok(unique, 'falta índice {eventId, sourceId}');
  assert.equal(unique[1].unique, true);
  const ttl = idx.find(([keys]) => keys.expireAt === 1);
  assert.ok(ttl, 'falta índice TTL expireAt');
  assert.equal(ttl[1].expireAfterSeconds, 0);
  const ingested = idx.find(([keys]) => keys.ingestedAt === 1);
  assert.ok(ingested, 'falta índice {ingestedAt}');
  const ts = idx.find(([keys]) => keys.ts === 1);
  assert.ok(ts, 'falta índice {ts}');
});

test('LiveEvent exige ingestedAt y no duplica el índice de eventId', () => {
  assert.equal(LiveEvent.schema.path('ingestedAt').isRequired, true);
  const idx = LiveEvent.schema.indexes();
  const single = idx.find(([keys]) => Object.keys(keys).length === 1 && keys.eventId === 1);
  assert.equal(single, undefined, 'índice single {eventId} debería eliminarse');
});

test('LiveEvent declara índice delta {source, ingestedAt}', () => {
  const idx = LiveEvent.schema.indexes();
  const delta = idx.find(([keys]) => keys.source === 1 && keys.ingestedAt === 1);
  assert.ok(delta, 'falta índice {source, ingestedAt} para la version/delta');
});

test('LiveEvent declara seq, source, addedTime e índice {eventId, ts}', () => {
  assert.equal(LiveEvent.schema.path('seq').instance, 'Number');
  assert.equal(LiveEvent.schema.path('seq').defaultValue, 0);
  assert.equal(LiveEvent.schema.path('source').defaultValue, 'scraper');
  assert.equal(LiveEvent.schema.path('addedTime').instance, 'Number');
  assert.equal(LiveEvent.schema.path('addedTime').defaultValue, null);
  const idx = LiveEvent.schema.indexes();
  const evTs = idx.find(([keys]) => keys.eventId === 1 && keys.ts === 1);
  assert.ok(evTs, 'falta índice {eventId, ts}');
});

test('expireAt usa el dia del kickoff, no el de ingesta', () => {
  const kickoff = Date.parse('2026-09-16T22:30:00Z');
  const ingest = Date.parse('2026-09-17T00:10:00Z');
  const evs = deriveEvents({ eventId: 1, status: 'FT', kickoffMs: kickoff, score: { home: 0, away: 0 } }, [], ingest);
  assert.equal(new Date(evs[0].expireAt).toISOString(), '2026-09-17T01:30:00.000Z');
});

test('expireAt mantiene el fin de dia si kickoff+3h cae antes', () => {
  const kickoff = Date.parse('2026-09-16T18:00:00Z');
  const evs = deriveEvents({ eventId: 1, status: 'FT', kickoffMs: kickoff, score: { home: 0, away: 0 } }, [], kickoff);
  assert.equal(new Date(evs[0].expireAt).toISOString(), '2026-09-16T23:59:59.000Z');
});

test('expireAt cubre kickoff+3h cuando cruza medianoche UTC', () => {
  const kickoff = Date.parse('2026-09-16T21:30:00Z');
  const evs = deriveEvents({ eventId: 1, status: 'FT', kickoffMs: kickoff, score: { home: 0, away: 0 } }, [], kickoff);
  assert.equal(new Date(evs[0].expireAt).toISOString(), '2026-09-17T00:30:00.000Z');
});
