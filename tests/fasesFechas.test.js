import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFasesFechas } from '../api/fasesFechas.js';

const FASES = ['FASE_PRETEMPORADA', 'FASE_LIGA', 'FASE_PRE16', 'FASE_16'];

test('acepta fases válidas con fechas ISO', () => {
  const r = validateFasesFechas({
    FASE_LIGA: { inicio: '2026-09-08T20:00:00.000Z', fin: '2026-12-11T20:00:00.000Z' }
  }, FASES);
  assert.equal(r.ok, true);
  assert.equal(r.fasesFechas.FASE_LIGA.inicio instanceof Date, true);
  assert.equal(r.fasesFechas.FASE_LIGA.fin instanceof Date, true);
});

test('acepta null y string vacío como sin fecha', () => {
  const r = validateFasesFechas({
    FASE_LIGA: { inicio: null, fin: '' }
  }, FASES);
  assert.equal(r.ok, true);
  assert.equal(r.fasesFechas.FASE_LIGA.inicio, null);
  assert.equal(r.fasesFechas.FASE_LIGA.fin, null);
});

test('rechaza clave de fase no válida', () => {
  const r = validateFasesFechas({ FASE_INEXISTENTE: { inicio: null, fin: null } }, FASES);
  assert.equal(r.ok, false);
  assert.match(r.error, /Fase inválida/);
});

test('rechaza inicio posterior o igual al fin', () => {
  const r = validateFasesFechas({
    FASE_LIGA: { inicio: '2026-12-11T20:00:00.000Z', fin: '2026-09-08T20:00:00.000Z' }
  }, FASES);
  assert.equal(r.ok, false);
  assert.match(r.error, /anterior al fin/);
});

test('rechaza fechas no parseables', () => {
  const r = validateFasesFechas({ FASE_LIGA: { inicio: 'no-es-fecha', fin: null } }, FASES);
  assert.equal(r.ok, false);
});

test('rechaza fasesFechas que no es objeto', () => {
  assert.equal(validateFasesFechas(null, FASES).ok, false);
  assert.equal(validateFasesFechas('x', FASES).ok, false);
});
