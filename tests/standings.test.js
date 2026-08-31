import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateUserStandings, compareStandingsTeams } from '../api/standings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadCalendar() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sofascore', 'calendar.json'), 'utf8'));
}

test('calculateUserStandings devuelve [] sin predicciones', async () => {
  assert.deepEqual(await calculateUserStandings(null), []);
  assert.deepEqual(await calculateUserStandings({}), []);
});

test('calculateUserStandings ordena por puntos y asigna posiciones', async () => {
  const liga = loadCalendar().filter(m => m.fase === 'liga');
  assert.ok(liga.length >= 2, 'el calendario debe tener partidos de liga');
  const m = liga[0];
  const homeId = m.equipoLocal?.id ?? m.homeTeam?.id;
  const awayId = m.equipoVisitante?.id ?? m.awayTeam?.id;
  const standings = await calculateUserStandings({ [m.id]: { home: 3, away: 0 } });
  const homeEntry = standings.find(s => s.id === homeId);
  const awayEntry = standings.find(s => s.id === awayId);
  assert.ok(homeEntry && awayEntry, 'ambos equipos deben aparecer');
  assert.ok(homeEntry.position < awayEntry.position, 'el ganador debe ir delante');
  assert.strictEqual(standings.length, 2, 'solo cuentan los equipos con partido pronosticado');
});

test('con las 144 predicciones de liga completas se obtienen los 36 equipos (regresión PUT /api/final-predictions)', async () => {
  const liga = loadCalendar().filter(m => m.fase === 'liga');
  assert.strictEqual(liga.length, 144, 'el calendario debe tener 144 partidos de liga');
  const predictions = {};
  for (const m of liga) {
    predictions[m.id] = { home: 1, away: 0 };
  }
  const standings = await calculateUserStandings(predictions);
  assert.strictEqual(standings.length, 36, 'los 36 equipos deben tener posicion en la clasificación pronosticada');
  const uniqueIds = new Set(standings.map(t => t.id));
  assert.strictEqual(uniqueIds.size, 36, 'no debe haber equipos repetidos');
});

test('compareStandingsTeams: desempata alfabéticamente tras empate en los 9 criterios', () => {
  const nameMap = { 1: { name: 'Zeta FC' }, 2: { name: 'Alpha FC' } };
  const t = id => ({
    teamId: id, points: 12, gd: 5, gf: 10, awayGoals: 4, wins: 4, awayWins: 2,
    rivalPointsSum: 30, rivalGDSum: 3, rivalGFSum: 20
  });
  assert.ok(compareStandingsTeams(t(1), t(2), nameMap) > 0, 'Zeta detrás de Alpha');
  assert.ok(compareStandingsTeams(t(2), t(1), nameMap) < 0, 'Alpha delante de Zeta');
  assert.strictEqual(compareStandingsTeams(t(1), t(1), nameMap), 0, 'mismo equipo → 0');
});