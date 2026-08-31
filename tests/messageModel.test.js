import test from 'node:test';
import assert from 'node:assert/strict';
import Message from '../db/models/Message.js';

test('crea un mensaje válido sin fechas ni lecturas', async () => {
  const m = new Message({ title: 'Bienvenida', content: '<p>Hola</p>', type: 'noticia' });
  const err = await m.validate();
  assert.equal(err, undefined);
  assert.equal(m.readBy.length, 0);
  assert.equal(m.fechaInicio, null);
});

test('acepta fechas YYYY-MM-DD y creador', async () => {
  const m = new Message({ title: 'A', content: 'B', type: 'aviso', fechaInicio: '2026-09-01', fechaFin: '2026-09-10', createdBy: 'admin' });
  const err = await m.validate();
  assert.equal(err, undefined);
  assert.equal(m.fechaFin, '2026-09-10');
});

test('rechaza tipo no válido', async () => {
  const m = new Message({ title: 'A', content: 'B', type: 'meme' });
  let err;
  try {
    await m.validate();
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.errors.type, 'debe haber error de type');
});

test('exige título y contenido', async () => {
  const m = new Message({ type: 'aviso' });
  let err;
  try {
    await m.validate();
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.errors.title && err.errors.content);
});
