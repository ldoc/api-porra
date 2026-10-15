import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveEventsResponse } from '../api/live.js';

test('buildLiveEventsResponse ordena por ts y usa el serverTime recibido', () => {
  const docs = [
    { _id: 'b', eventId: 2, ts: new Date('2026-09-16T20:05:00Z') },
    { _id: 'a', eventId: 1, ts: new Date('2026-09-16T20:01:00Z') }
  ];
  const res = buildLiveEventsResponse(docs, '2026-09-16T20:05:00.000Z');
  assert.deepEqual(res.events.map(d => d._id), ['a', 'b']);
  assert.equal(res.serverTime, '2026-09-16T20:05:00.000Z');
  assert.deepEqual(buildLiveEventsResponse([], null), { ok: true, events: [], serverTime: null });
});
