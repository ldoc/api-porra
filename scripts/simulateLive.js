#!/usr/bin/env node
// Simulador de eventos live para probar la tab Live sin partido real.
// Escribe directamente en `livematchs`: el frontend lo detecta en el siguiente poll (<=2 min).
// Requiere: backend levantado, liveScrape.js PARADO (si no, pisa el doc) y tab Live abierta.
//
//   MONGODB_URI=".../test" node scripts/simulateLive.js [eventId] [--step 150] [--dry]
//
// --step: segundos entre eventos (defecto 150, > 120 del poll para ver un toast por evento).
// --dry: imprime los pasos sin tocar la DB.
import mongoose from 'mongoose';
import { config } from 'dotenv';
import LiveMatch from '../db/models/LiveMatch.js';

config();

function arg(name, def) {
  const ix = process.argv.indexOf(name);
  return ix === -1 ? def : process.argv[ix + 1];
}

const eventId = Number(process.argv[2]) || 16939028;
const stepSecs = Math.max(10, Number(arg('--step', 150)));
const dry = process.argv.includes('--dry');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const uri = process.env.MONGODB_URI || '';
if (!dry && /\/prod(\?|$)/.test(uri)) throw new Error('Nunca apuntes a /prod. Usa /test.');

function J(id, nombre, equipo, minutos, puntos, goles, asistencias) {
  return { id: String(id), nombre, equipo, minutos, puntos, goles, asistencias };
}

// Timeline arbitrario sobre el 16939028 (Stuttgart 2677 - Viking 1164).
const STEPS = [
  { label: 'seed 2-1 (60\')', patch: {
    estado: 'live', minuto: 60, homeGoles: 2, awayGoles: 1,
    jugadores: [J(9, 'Kane', 2677, 60, 7.9, 1, 1), J(20, 'Undav', 2677, 60, 6.8, 1, 0), J(30, 'Nusa', 1164, 60, 7.2, 1, 0)] } },
  { label: '⚽ gol Kane (3-1, 67\')', patch: {
    minuto: 67, homeGoles: 3,
    jugadores: [J(9, 'Kane', 2677, 67, 8.4, 2, 1), J(20, 'Undav', 2677, 67, 6.8, 1, 0), J(30, 'Nusa', 1164, 67, 7.0, 1, 0)] } },
  { label: '🟨 amarilla Nusa (71\')', patch: {
    minuto: 71,
    incidents: [{ key: 'sim-card-71-30', tipo: 'card', minuto: 71, teamId: 1164, playerId: 30, playerName: 'Nusa', color: 'amarilla' }] } },
  { label: '🔄 cambio VFB: entra Woltemade sale Undav (75\')', patch: {
    minuto: 75,
    jugadores: [J(9, 'Kane', 2677, 75, 8.4, 2, 1), J(20, 'Undav', 2677, 75, 6.8, 1, 0), J(30, 'Nusa', 1164, 75, 7.0, 1, 0), J(40, 'Woltemade', 2677, 0, 0, 0, 0)],
    incidents: [{ key: 'sim-sub-75-40', tipo: 'sub', minuto: 75, teamId: 2677, playerId: 40, playerName: 'Woltemade', playerOut: 'Undav', playerOutId: 20 }] } },
  { label: '🏁 final 3-1 (90\')', patch: {
    estado: 'finalizado', minuto: 90, finishedAt: new Date() } }
];

function applyStep(doc, step) {
  const p = step.patch;
  if (p.estado) doc.estado = p.estado;
  if (p.minuto) doc.minuto = p.minuto;
  if (p.homeGoles !== undefined) {
    doc.homeGoles = p.homeGoles;
    doc.stats[String(doc.homeTeamId)].goles = p.homeGoles;
  }
  if (p.awayGoles !== undefined) {
    doc.awayGoles = p.awayGoles;
    doc.stats[String(doc.awayTeamId)].goles = p.awayGoles;
  }
  if (p.jugadores) doc.stats.jugadores = p.jugadores;
  for (const inc of p.incidents || []) {
    doc.incidents = [...(doc.incidents || []).filter(i => i.key !== inc.key), inc].slice(-20);
  }
  if (p.finishedAt) doc.finishedAt = p.finishedAt;
  doc.scrapedAt = new Date();
  doc.markModified('stats');
  return doc;
}

function describe(doc) {
  return `${doc.homeTeamId} ${doc.homeGoles}-${doc.awayGoles} ${doc.awayTeamId} (${doc.estado} ${doc.minuto}') incidents=${(doc.incidents || []).length}`;
}

async function main() {
  console.log(`Simulador live → evento ${eventId}, paso cada ${stepSecs}s. LiveScrape debe estar PARADO. Ctrl+C para parar.`);
  let doc = null;
  if (!dry) {
    await mongoose.connect(uri);
    doc = await LiveMatch.findOne({ eventId });
    if (!doc) {
      console.log('(sin doc previo: seed desde cero)');
      doc = new LiveMatch({ eventId, homeTeamId: 2677, awayTeamId: 1164, homeGoles: 0, awayGoles: 0,
        stats: { 2677: { goles: 0 }, 1164: { goles: 0 }, jugadores: [] }, incidents: [] });
    }
  } else {
    doc = { homeTeamId: 2677, awayTeamId: 1164, homeGoles: 0, awayGoles: 0,
      stats: { 2677: { goles: 0 }, 1164: { goles: 0 }, jugadores: [] }, incidents: [],
      markModified() {} };
  }
  for (const step of STEPS) {
    applyStep(doc, step);
    if (dry) console.log(`[dry] ${step.label} → ${describe(doc)}`);
    else { await doc.save(); console.log(`✔ ${step.label} → ${describe(doc)} (toast en ≤2 min con la tab Live abierta)`); }
    if (step !== STEPS[STEPS.length - 1]) await sleep(stepSecs * 1000);
  }
  await mongoose.disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) await main().catch(e => { console.error(e.message); process.exit(1); });
