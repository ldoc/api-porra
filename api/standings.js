import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _calendarCache = null;
function loadCalendar() {
  if (_calendarCache) return _calendarCache;
  const content = resolveDataFile('sofascore/calendar.json');
  try {
    _calendarCache = content ? JSON.parse(content) : null;
  } catch {
    _calendarCache = null;
  }
  return _calendarCache;
}

let _teamsCache = null;
function loadTeams() {
  if (_teamsCache) return _teamsCache;
  const content = resolveDataFile('sofascore/teams.json');
  try {
    _teamsCache = content ? JSON.parse(content) : [];
  } catch {
    _teamsCache = [];
  }
  return _teamsCache;
}

/**
 * Resuelve un fichero de data/ soportando distintos layouts: ejecución local
 * desde la raíz del proyecto (cwd) y bundle de Vercel (módulo api/ o plano).
 * @param {string} rel ruta relativa dentro de data/ (ej: 'sofascore/calendar.json')
 * @returns {string|null} contenido del fichero o null si no se encuentra
 */
function resolveDataFile(rel) {
  const candidates = [
    path.join(process.cwd(), 'data', rel),
    path.join(__dirname, '..', 'data', rel),
    path.join(__dirname, 'data', rel)
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
    } catch {
      // siguiente candidato
    }
  }
  console.error(`[standings] No se encontró data/${rel} en: ${candidates.join(', ')}`);
  return null;
}

/**
 * Comparador de clasificación con criterios de desempate UCL (1-9) + nombre alfabético.
 * Espejo del frontend (porra-spa/js/main.js compareTeams / sortTeams).
 * @returns {number} negativo si a va antes que b
 */
export function compareStandingsTeams(a, b, teamNameMap = {}) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  if (b.awayGoals !== a.awayGoals) return b.awayGoals - a.awayGoals;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.awayWins !== a.awayWins) return b.awayWins - a.awayWins;
  if (b.rivalPointsSum !== a.rivalPointsSum) return b.rivalPointsSum - a.rivalPointsSum;
  if (b.rivalGDSum !== a.rivalGDSum) return b.rivalGDSum - a.rivalGDSum;
  if (b.rivalGFSum !== a.rivalGFSum) return b.rivalGFSum - a.rivalGFSum;
  const aName = teamNameMap[a.teamId]?.name || '';
  const bName = teamNameMap[b.teamId]?.name || '';
  if (aName !== bName) return aName.localeCompare(bName);
  return 0;
}

/**
 * Calcula la clasificación pronosticada de un usuario basándose en sus predicciones.
 * Solo considera los partidos de fase de liga. Devuelve los equipos que tienen
 * al menos un partido pronosticado, ordenados por criterios UCL + nombre.
 * @param {Object} predictions - { eventId: { home, away } }
 * @returns {Promise<Array>} [{ id, position }]
 */
export async function calculateUserStandings(predictions) {
  try {
    if (!predictions || Object.keys(predictions).length === 0) return [];

    const calendar = loadCalendar();
    if (!calendar) return [];

    const calendarLiga = calendar.filter(m => m.fase === 'liga');
    const teamStats = {};

    for (const match of calendarLiga) {
      const pred = predictions[match.id];
      if (!pred || pred.home === null || pred.away === null) continue;

      const homeId = match.equipoLocal?.id ?? match.homeTeam?.id;
      const awayId = match.equipoVisitante?.id ?? match.awayTeam?.id;
      if (!homeId || !awayId) continue;

      for (const tid of [homeId, awayId]) {
        if (!teamStats[tid]) {
          teamStats[tid] = {
            teamId: tid, points: 0, gf: 0, gc: 0, gd: 0,
            wins: 0, draws: 0, losses: 0,
            awayGoals: 0, awayWins: 0, matches: [], rivals: new Set()
          };
        }
      }

      const home = teamStats[homeId];
      const away = teamStats[awayId];

      home.rivals.add(awayId);
      away.rivals.add(homeId);

      home.matches.push({ goalsFor: pred.home, goalsAgainst: pred.away, isHome: true, rivalId: awayId });
      away.matches.push({ goalsFor: pred.away, goalsAgainst: pred.home, isHome: false, rivalId: homeId });

      home.gf += pred.home; home.gc += pred.away;
      away.gf += pred.away; away.gc += pred.home;
      home.gd = home.gf - home.gc;
      away.gd = away.gf - away.gc;

      if (pred.home > pred.away) { home.wins++; home.points += 3; away.losses++; }
      else if (pred.home < pred.away) { away.wins++; away.points += 3; home.losses++; }
      else { home.draws++; home.points++; away.draws++; away.points++; }

      away.awayGoals += pred.away;
      if (pred.away > pred.home) away.awayWins++;
    }

    const teams = Object.values(teamStats);

    for (const team of teams) {
      let rivalPointsSum = 0, rivalGDSum = 0, rivalGFSum = 0;
      for (const rivalId of team.rivals) {
        const rival = teamStats[rivalId];
        if (rival) {
          rivalPointsSum += rival.points;
          rivalGDSum += rival.gd;
          rivalGFSum += rival.gf;
        }
      }
      team.rivalPointsSum = rivalPointsSum;
      team.rivalGDSum = rivalGDSum;
      team.rivalGFSum = rivalGFSum;
    }

    const teamNameMap = {};
    for (const t of loadTeams()) teamNameMap[t.id] = { name: t.name };

    teams.sort((a, b) => compareStandingsTeams(a, b, teamNameMap));

    return teams.map((t, i) => ({ id: t.teamId, position: i + 1 }));
  } catch (err) {
    console.error('Error calculating user standings:', err);
    return [];
  }
}