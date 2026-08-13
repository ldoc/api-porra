/**
 * Validación de las predicciones de eliminatorias.
 * Grupos de posiciones A-D: máximo 2 equipos por grupo en dieciseisavos y
 * máximo 2 por grupo en el CONJUNTO de cajas fuera de dieciseisavos (campeón,
 * subcampeón, semifinalistas, cuartos y octavos combinadas).
 */

export const POSITION_GROUPS = {
  A: [9, 10, 23, 24],
  B: [11, 12, 21, 22],
  C: [13, 14, 19, 20],
  D: [15, 16, 17, 18]
};

export const MAX_TEAMS_PER_GROUP_PER_ZONE = 2;

/**
 * @param {Object} finalPredictions - { champion, runnerUp, semiFinalists, quarterFinalists, roundOf16, roundOf32 }
 * @param {Map<number,number>} teamPositionMap - teamId -> posición pronosticada (1-24)
 * @returns {Array<string>} Mensajes de violación (vacío = válido)
 */
export function getFinalPredictionsViolations(finalPredictions, teamPositionMap) {
  const fp = finalPredictions || {};
  const violations = [];

  const countGroupIn = (teamIds, positions) => (teamIds || [])
    .filter(id => {
      const pos = teamPositionMap.get(id);
      return pos && positions.includes(pos);
    })
    .length;

  const restTeams = [
    ...(fp.champion ? [fp.champion] : []),
    ...(fp.runnerUp ? [fp.runnerUp] : []),
    ...(fp.semiFinalists || []),
    ...(fp.quarterFinalists || []),
    ...(fp.roundOf16 || [])
  ];

  for (const positions of Object.values(POSITION_GROUPS)) {
    if (countGroupIn(fp.roundOf32, positions) > MAX_TEAMS_PER_GROUP_PER_ZONE) {
      violations.push(`Máximo ${MAX_TEAMS_PER_GROUP_PER_ZONE} equipos de posiciones ${positions.join(',')} en dieciseisavos.`);
    }
    if (countGroupIn(restTeams, positions) > MAX_TEAMS_PER_GROUP_PER_ZONE) {
      violations.push(`Máximo ${MAX_TEAMS_PER_GROUP_PER_ZONE} equipos de posiciones ${positions.join(',')} en el conjunto de cajas fuera de dieciseisavos.`);
    }
  }

  return violations;
}
