/**
 * Parsea el query param `since` de GET /api/match-stats.
 * Devuelve { ok: true, date } con date como Date|null,
 * o { ok: false } si el valor presente no es una fecha valida.
 */
export function parseSinceParam(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, date: null };
  const date = new Date(raw);
  if (isNaN(date.getTime())) return { ok: false };
  return { ok: true, date };
}
