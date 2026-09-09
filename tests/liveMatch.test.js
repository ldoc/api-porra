// /home/ldoc/Proyectos/api-porra/tests/liveMatch.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import LiveMatch from '../db/models/LiveMatch.js';

test('colección explícita es livematchs', () => {
  assert.equal(LiveMatch.collection.name, 'livematchs');
});

test('eventId es único y requerido', () => {
  const paths = LiveMatch.schema.paths;
  assert.equal(paths.eventId.options.unique, true);
  assert.equal(paths.eventId.options.required, true);
});

test('valida doc live mínimo', () => {
  const doc = new LiveMatch({
    eventId: 14566909, estado: 'live', minuto: 67,
    homeTeamId: 42, awayTeamId: 2825, homeGoles: 2, awayGoles: 1,
    stats: { '42': { goles: 2 }, '2825': { goles: 1 }, jugadores: [] },
    scrapedAt: new Date(), finishedAt: null
  });
  const err = doc.validateSync();
  assert.equal(err, undefined);
});

test('rechaza estado inválido', () => {
  const doc = new LiveMatch({
    eventId: 1, estado: 'inventado', minuto: 1,
    homeTeamId: 1, awayTeamId: 2, homeGoles: 0, awayGoles: 0,
    stats: {}, scrapedAt: new Date()
  });
  const err = doc.validateSync();
  assert.ok(err?.errors?.estado);
});
