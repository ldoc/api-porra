import test from 'node:test';
import assert from 'node:assert/strict';
import { bypassesGameLocks, guestEditingEnabled } from '../api/guest.js';

test('bypassesGameLocks: solo invitado con edición habilitada', () => {
  assert.strictEqual(bypassesGameLocks({ isGuest: true }, true), true);
  assert.strictEqual(bypassesGameLocks({ isGuest: true }, false), false);
  assert.strictEqual(bypassesGameLocks({ isGuest: false }, true), false);
  assert.strictEqual(bypassesGameLocks({ isGuest: false }, false), false);
  assert.strictEqual(bypassesGameLocks({}, true), false);
  assert.strictEqual(bypassesGameLocks(null, true), false);
  assert.strictEqual(bypassesGameLocks({ isGuest: true }), false, 'flag ausente no habilita');
});

test('guestEditingEnabled y bypass son coherentes con el default', () => {
  const off = { guestEditing: { enabled: false } };
  const on = {};
  assert.strictEqual(guestEditingEnabled(on), true);
  assert.strictEqual(bypassesGameLocks({ isGuest: true }, guestEditingEnabled(on)), true);
  assert.strictEqual(guestEditingEnabled(off), false);
  assert.strictEqual(bypassesGameLocks({ isGuest: true }, guestEditingEnabled(off)), false);
});
