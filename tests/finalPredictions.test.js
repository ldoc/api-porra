import test from 'node:test';
import assert from 'node:assert/strict';
import { getFinalPredictionsViolations } from '../api/finalPredictions.js';

// teamId == posición para simplificar los tests (mapa 1..24)
function posMap() {
  const map = new Map();
  for (let i = 1; i <= 24; i++) map.set(i, i);
  return map;
}

const fp = (over) => Object.assign(
  { champion: null, runnerUp: null, semiFinalists: [], quarterFinalists: [], roundOf16: [], roundOf32: [] },
  over
);

test('válido: grupo A repartido 2 en dieciseisavos + 2 fuera', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ champion: 10, runnerUp: 24, roundOf32: [9, 23] }), posMap()), []);
});

test('inválido: ejemplo reportado, 3 del grupo A fuera de dieciseisavos', () => {
  const v = getFinalPredictionsViolations(fp({ semiFinalists: [24], quarterFinalists: [23], roundOf16: [10], roundOf32: [9] }), posMap());
  assert.strictEqual(v.length, 1);
  assert.match(v[0], /fuera de dieciseisavos/);
});

test('inválido: 3 del mismo grupo en dieciseisavos', () => {
  const v = getFinalPredictionsViolations(fp({ roundOf32: [9, 10, 23] }), posMap());
  assert.strictEqual(v.length, 1);
  assert.match(v[0], /dieciseisavos/);
});

test('válido parcial: 2 fuera + 1 sin colocar', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ quarterFinalists: [23], roundOf16: [10], roundOf32: [9] }), posMap()), []);
});

test('límites: 2 en el resto ok, 3 error', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ quarterFinalists: [], roundOf16: [10, 23], roundOf32: [9, 24] }), posMap()), []);
  const v = getFinalPredictionsViolations(fp({ quarterFinalists: [23], roundOf16: [10, 24], roundOf32: [9] }), posMap());
  assert.strictEqual(v.length, 1);
});

test('grupos B, C y D respetan sus límites', () => {
  // Todos los grupos al límite 2/2: 2 en dieciseisavos + 2 fuera; top-8 (1-8) en octavos
  const ok = fp({
    champion: 23, runnerUp: 24,
    semiFinalists: [21, 22], quarterFinalists: [19, 20],
    roundOf16: [17, 18, 1, 2, 3, 4, 5, 6],
    roundOf32: [9, 10, 11, 12, 13, 14, 15, 16]
  });
  assert.deepEqual(getFinalPredictionsViolations(ok, posMap()), []);
});

test('nulls y placeholders falsy no cuentan', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ roundOf16: [null, 10], roundOf32: [9, null, 23] }), posMap()), []);
});

test('payloads malformados no lanzan y devuelven sin violaciones', () => {
  assert.deepEqual(getFinalPredictionsViolations(fp({ roundOf32: 5, semiFinalists: {} }), posMap()), []);
});
