export function isGuest(record) {
  return record?.isGuest === true;
}

export function canSeeGuests(viewer) {
  return isGuest(viewer) || viewer?.isAdmin === true;
}

export function guestReadFilter(viewer) {
  return canSeeGuests(viewer) ? {} : { isGuest: { $ne: true } };
}

export function isGuestRegistrationAllowed(invitation, faseJuego) {
  if (isGuest(invitation)) return true;
  return !faseJuego || faseJuego === 'FASE_PRETEMPORADA';
}

export function bypassesGameLocks(user) {
  return isGuest(user);
}

export function guestEditingEnabled(config) {
  return config?.guestEditing?.enabled !== false;
}
