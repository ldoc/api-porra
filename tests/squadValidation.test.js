import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSquadComposition } from '../api/squadValidation.js';

let _id = 1;
function player(posicion) {
  return { id: _id++, nombre: `Jugador${_id}`, posicion, club: 'Club', equipo: 100 + _id };
}

function validSquad() {
  _id = 1;
  const squad = [];
  for (const [pos, n] of [['G', 3], ['D', 8], ['M', 8], ['F', 6]]) {
    for (let i = 0; i < n; i++) squad.push(player(pos));
  }
  return squad;
}

test('plantilla válida (25 / 3-8-8-6 / equipos únicos) → ok', () => {
  assert.strictEqual(validateSquadComposition(validSquad()).ok, true);
});

test('plantilla parcial (10 jugadores) → ok', () => {
  const squad = validSquad().slice(0, 10);
  assert.strictEqual(validateSquadComposition(squad).ok, true);
});

test('plantilla vacía → error', () => {
  const r = validateSquadComposition([]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /al menos un jugador/);
});

test('más de 25 jugadores → error', () => {
  const squad = validSquad();
  squad.push({ id: 999, nombre: 'Extra', posicion: 'G', club: 'Otro', equipo: 999 });
  const r = validateSquadComposition(squad);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /más de 25/);
});

test('exceder máximo por posición → error', () => {
  const squad = validSquad().slice(0, 10);
  // Cambiar un defensa a portero para exceder el máximo de porteros
  squad[3].posicion = 'G';
  const r = validateSquadComposition(squad);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /máximo/);
});

test('posición no permitida → error', () => {
  const squad = validSquad();
  squad[5].posicion = 'X';
  assert.strictEqual(validateSquadComposition(squad).ok, false);
});

test('jugador sin equipo o sin id → error', () => {
  const squad = validSquad();
  delete squad[3].equipo;
  assert.strictEqual(validateSquadComposition(squad).ok, false);
  const squad2 = validSquad();
  delete squad2[4].id;
  assert.strictEqual(validateSquadComposition(squad2).ok, false);
});

test('equipos repetidos → error', () => {
  const squad = validSquad();
  squad[10].equipo = squad[11].equipo;
  assert.strictEqual(validateSquadComposition(squad).ok, false);
});

test('no array → error', () => {
  assert.strictEqual(validateSquadComposition(null).ok, false);
  assert.strictEqual(validateSquadComposition('x').ok, false);
});