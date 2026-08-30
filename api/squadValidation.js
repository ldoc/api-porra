export const DEFAULT_FORMATION = { G: 3, D: 8, M: 8, F: 6 };

/**
 * Valida la composición de la plantilla ideal.
 * Reglas (AGENTS.md): 25 jugadores, 3 porteros, 8 defensas, 8 centrocampistas,
 * 6 delanteros, sin más de un jugador del mismo club.
 * @param {Array} squad - Array de { id, nombre, posicion, club, equipo, ... }
 * @param {Object} formation - { G, D, M, F }
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateSquadComposition(squad, formation = DEFAULT_FORMATION) {
  if (!Array.isArray(squad)) {
    return { ok: false, error: 'squad debe ser un array' };
  }

  const expectedTotal = Object.values(formation).reduce((s, n) => s + n, 0);
  if (squad.length !== expectedTotal) {
    return {
      ok: false,
      error: `La plantilla debe tener exactamente ${expectedTotal} jugadores (${JSON.stringify(formation)})`
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
    if (counts[pos] !== n) {
      return { ok: false, error: `Formación inválida: se esperan ${n} jugadores en posición ${pos}, hay ${counts[pos]}` };
    }
  }

  const teams = squad.map(p => p.equipo);
  if (new Set(teams).size !== teams.length) {
    return { ok: false, error: 'No puede haber jugadores del mismo equipo repetidos' };
  }

  return { ok: true };
}