import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGuest,
  canSeeGuests,
  guestReadFilter,
  isGuestRegistrationAllowed,
  bypassesGameLocks,
  guestEditingEnabled
} from '../api/guest.js';

test('isGuest solo es true con isGuest:true', () => {
  assert.strictEqual(isGuest({ isGuest: true }), true);
  assert.strictEqual(isGuest({ isGuest: false }), false);
  assert.strictEqual(isGuest({}), false);
  assert.strictEqual(isGuest(null), false);
});

test('canSeeGuests: solo invitado o admin', () => {
  assert.strictEqual(canSeeGuests({ isGuest: true }), true);
  assert.strictEqual(canSeeGuests({ isAdmin: true }), true);
  assert.strictEqual(canSeeGuests({ isGuest: false, isAdmin: false }), false);
  assert.strictEqual(canSeeGuests({}), false);
});

test('guestReadFilter excluye invitados para normales y anonimos', () => {
  assert.deepEqual(guestReadFilter({ isGuest: false, isAdmin: false }), { isGuest: { $ne: true } });
  assert.deepEqual(guestReadFilter({}), { isGuest: { $ne: true } });
  assert.deepEqual(guestReadFilter({ isGuest: true }), {});
  assert.deepEqual(guestReadFilter({ isAdmin: true }), {});
});

test('isGuestRegistrationAllowed: invitado siempre, normal solo pretemporada', () => {
  assert.strictEqual(isGuestRegistrationAllowed({ isGuest: true }, 'FASE_LIGA'), true);
  assert.strictEqual(isGuestRegistrationAllowed({ isGuest: true }, 'FASE_PRETEMPORADA'), true);
  assert.strictEqual(isGuestRegistrationAllowed({ isGuest: false }, 'FASE_PRETEMPORADA'), true);
  assert.strictEqual(isGuestRegistrationAllowed({ isGuest: false }, 'FASE_LIGA'), false);
  assert.strictEqual(isGuestRegistrationAllowed({ isGuest: false }, null), true);
});

test('bypassesGameLocks: true solo para invitados', () => {
  assert.strictEqual(bypassesGameLocks({ isGuest: true }), true);
  assert.strictEqual(bypassesGameLocks({ isGuest: false }), false);
  assert.strictEqual(bypassesGameLocks({}), false);
});

test('guestEditingEnabled: true salvo enabled:false explícito', () => {
  assert.strictEqual(guestEditingEnabled({ guestEditing: { enabled: true } }), true);
  assert.strictEqual(guestEditingEnabled({ guestEditing: { enabled: false } }), false);
  assert.strictEqual(guestEditingEnabled({ guestEditing: {} }), true);
  assert.strictEqual(guestEditingEnabled({}), true);
  assert.strictEqual(guestEditingEnabled(null), true);
});
