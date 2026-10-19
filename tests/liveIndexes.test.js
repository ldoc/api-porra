import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateIndexAbortMessage } from '../scripts/liveIndexes.js';

function group(eventId, sourceId, count) {
  return { _id: { eventId, sourceId }, count };
}

test('duplicateIndexAbortMessage devuelve null sin duplicados', () => {
  assert.equal(duplicateIndexAbortMessage(null), null);
  assert.equal(duplicateIndexAbortMessage([]), null);
  assert.equal(duplicateIndexAbortMessage([group(1, 'a', 1)]), null);
});

test('duplicateIndexAbortMessage incluye clave y numero de documentos', () => {
  const msg = duplicateIndexAbortMessage([group(14566909, 'goal|g1', 3)]);
  assert.match(msg, /14566909/);
  assert.match(msg, /goal\|g1/);
  assert.match(msg, /documentos=3/);
  assert.match(msg, /duplicados/);
});

test('duplicateIndexAbortMessage lista varios grupos', () => {
  const msg = duplicateIndexAbortMessage([
    group(1, 'a', 2),
    group(2, 'b', 4)
  ]);
  assert.match(msg, /eventId=1 sourceId=a documentos=2/);
  assert.match(msg, /eventId=2 sourceId=b documentos=4/);
});

test('duplicateIndexAbortMessage respeta sampleLimit', () => {
  const groups = [group(1, 'a', 2), group(2, 'b', 3), group(3, 'c', 4)];
  const msg = duplicateIndexAbortMessage(groups, 2);
  assert.match(msg, /eventId=1/);
  assert.match(msg, /eventId=2/);
  assert.doesNotMatch(msg, /eventId=3/);
  assert.match(msg, /1 grupos más/);
});
