import test from 'node:test';
import assert from 'node:assert/strict';
import LiveEvent from '../db/models/LiveEvent.js';

test('LiveEvent declara colección liveevents e índices', () => {
  assert.equal(LiveEvent.collection.name, 'liveevents');
  const idx = LiveEvent.schema.indexes();
  const unique = idx.find(([keys]) => keys.eventId === 1 && keys.sourceId === 1);
  assert.ok(unique, 'falta índice {eventId, sourceId}');
  assert.equal(unique[1].unique, true);
  const ttl = idx.find(([keys]) => keys.expireAt === 1);
  assert.ok(ttl, 'falta índice TTL expireAt');
  assert.equal(ttl[1].expireAfterSeconds, 0);
});
