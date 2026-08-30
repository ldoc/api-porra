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

test('tamaño distinto de 25 → error', () => {
  const r = validateSquadComposition(validSquad().slice(0, 20));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /25/);
});

test('formación incorrecta (G=2, F=7) → error', () => {
  const squad = validSquad();
  squad[0].posicion = 'F';
  const r = validateSquadComposition(squad);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Formación/);
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