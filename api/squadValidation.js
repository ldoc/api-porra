export const DEFAULT_FORMATION = { G: 3, D: 8, M: 8, F: 6 };

/**
 * Valida la composición de la plantilla ideal.
 * Reglas (AGENTS.md): hasta 25 jugadores, máx 3 porteros, 8 defensas, 8 centrocampistas,
 * 6 delanteros, sin más de un jugador del mismo club.
 * Permite guardados parciales (menos de 25 jugadores).
 * @param {Array} squad - Array de { id, nombre, posicion, club, equipo, ... }
 * @param {Object} formation - { G, D, M, F } (máximos por posición)
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateSquadComposition(squad, formation = DEFAULT_FORMATION) {
  if (!Array.isArray(squad)) {
    return { ok: false, error: 'squad debe ser un array' };
  }

  if (squad.length === 0) {
    return { ok: false, error: 'La plantilla debe tener al menos un jugador' };
  }

  const maxTotal = Object.values(formation).reduce((s, n) => s + n, 0);
  if (squad.length > maxTotal) {
    return {
      ok: false,
      error: `La plantilla no puede tener más de ${maxTotal} jugadores`
    };
  }

  const counts = { G: 0, D: 0, M: 0, F: 0 };
  for (const p of squad) {
    if (!p || typeof p.id === 'undefined' || typeof p.equipo === 'undefined' || !Object.prototype.hasOwnProperty.call(counts, p.posicion)) {
      return { ok: false, error: 'Jugador inválido o posición no permitida' };
    }
    counts[p.posicion]++;
  }

  for (const [pos, n] of Object.entries(formation)) {
    if (counts[pos] > n) {
      return { ok: false, error: `Formación inválida: máximo ${n} jugadores en posición ${pos}, hay ${counts[pos]}` };
    }
  }

  const teams = squad.map(p => p.equipo);
  if (new Set(teams).size !== teams.length) {
    return { ok: false, error: 'No puede haber jugadores del mismo equipo repetidos' };
  }

  return { ok: true };
}