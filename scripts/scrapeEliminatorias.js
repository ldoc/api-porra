#!/usr/bin/env node
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { connectDB } from '../db/index.js';
import MatchStats from '../db/models/MatchStats.js';
import { scrapMatchStats } from './matchStats.js';

config();

const CALENDAR_FILE = new URL('../data/sofascore/calendar.json', import.meta.url).pathname;
const FASES = process.argv[2] ? process.argv[2].split(',').map(f => f.trim()) : ['16', '8'];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const calendar = JSON.parse(readFileSync(CALENDAR_FILE, 'utf-8'));
  const partidos = calendar.filter(m => FASES.includes(m.fase));

  console.log(`Fases a scrapear: ${FASES.join(', ')}`);
  console.log(`Partidos encontrados: ${partidos.length}`);

  if (partidos.length === 0) {
    console.log('No hay partidos para scrapear.');
    return;
  }

  await connectDB();

  const existentes = await MatchStats.find({}, 'eventId');
  const idsExistentes = new Set(existentes.map(m => m.eventId));
  const pendientes = partidos.filter(p => !idsExistentes.has(p.id));

  console.log(`Ya en MongoDB: ${idsExistentes.size}`);
  console.log(`A scrapear: ${pendientes.length}\n`);

  let ok = 0;
  let errors = 0;

  for (let i = 0; i < pendientes.length; i++) {
    const p = pendientes[i];
    const prefix = `[${i + 1}/${pendientes.length}]`;
    try {
      const stats = await scrapMatchStats(p.id);
      await MatchStats.findOneAndUpdate(
        { eventId: p.id },
        { eventId: p.id, stats, lastUpdated: new Date() },
        { upsert: true, new: true }
      );
      const home = stats[String(p.equipoLocal.id)]?.goles ?? '?';
      const away = stats[String(p.equipoVisitante.id)]?.goles ?? '?';
      console.log(`${prefix} ✔ F${p.fase} ${p.equipoLocal.name} ${home} - ${away} ${p.equipoVisitante.name} (${p.id})`);
      ok++;
    } catch (err) {
      console.log(`${prefix} ✘ F${p.fase} ${p.equipoLocal.name} vs ${p.equipoVisitante.name} (${p.id}) → ${err.message}`);
      errors++;
    }
    if (i < pendientes.length - 1) await sleep(1500);
  }

  console.log(`\nCompletado: ${ok} ok, ${errors} errores`);

  const guardados = await MatchStats.countDocuments({ eventId: { $in: partidos.map(p => p.id) } });
  console.log(`Total en MongoDB de las fases ${FASES.join(', ')}: ${guardados}/${partidos.length}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
