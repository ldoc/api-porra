import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessage } from '../api/messageValidation.js';

test('acepta un mensaje válido y normaliza', () => {
  const r = validateMessage({ title: ' Hola ', content: ' <p>Mundo</p> ', type: 'noticia', fechaInicio: '2026-09-01', fechaFin: '2026-09-10' });
  assert.equal(r.ok, true);
  assert.equal(r.message.title, 'Hola');
  assert.equal(r.message.content, '<p>Mundo</p>');
  assert.equal(r.message.fechaInicio, '2026-09-01');
});

test('acepta sin fechas (null o cadena vacía)', () => {
  assert.equal(validateMessage({ title: 'A', content: 'B', type: 'aviso', fechaInicio: null, fechaFin: '' }).ok, true);
});

test('rechaza título vacío o ausente', () => {
  assert.equal(validateMessage({ content: 'B', type: 'aviso' }).ok, false);
  assert.equal(validateMessage({ title: '  ', content: 'B', type: 'aviso' }).ok, false);
});

test('rechaza título de más de 200 caracteres', () => {
  const r = validateMessage({ title: 'x'.repeat(201), content: 'B', type: 'aviso' });
  assert.equal(r.ok, false);
  assert.match(r.error, /200/);
});

test('rechaza contenido vacío o ausente', () => {
  assert.equal(validateMessage({ title: 'A', type: 'aviso' }).ok, false);
  assert.equal(validateMessage({ title: 'A', content: ' ', type: 'aviso' }).ok, false);
});

test('rechaza tipo no válido', () => {
  const r = validateMessage({ title: 'A', content: 'B', type: 'meme' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Tipo de mensaje inválido/);
});

test('acepta los 5 tipos', () => {
  for (const t of ['noticia', 'aviso', 'felicitacion', 'resumen', 'mantenimiento']) {
    assert.equal(validateMessage({ title: 'A', content: 'B', type: t }).ok, true);
  }
});

test('rechaza fechas malformadas', () => {
  assert.equal(validateMessage({ title: 'A', content: 'B', type: 'aviso', fechaInicio: '01-09-2026' }).ok, false);
  assert.equal(validateMessage({ title: 'A', content: 'B', type: 'aviso', fechaInicio: '2026-13-01' }).ok, false);
  assert.equal(validateMessage({ title: 'A', content: 'B', type: 'aviso', fechaFin: '2026-02-30' }).ok, false);
});

test('rechaza inicio posterior al fin', () => {
  const r = validateMessage({ title: 'A', content: 'B', type: 'aviso', fechaInicio: '2026-09-10', fechaFin: '2026-09-01' });
  assert.equal(r.ok, false);
  assert.match(r.error, /anterior o igual al fin/);
});

test('acepta inicio igual al fin', () => {
  const r = validateMessage({ title: 'A', content: 'B', type: 'aviso', fechaInicio: '2026-09-10', fechaFin: '2026-09-10' });
  assert.equal(r.ok, true);
});