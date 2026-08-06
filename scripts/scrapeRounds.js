#!/usr/bin/env node
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { scrapMatchStats } from './matchStats.js';
import MatchStats from '../db/models/MatchStats.js';

config();

const CALENDAR_FILE = new URL('../data/sofascore/calendar.json', import.meta.url).pathname;
const RONDAS = [1, 2];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const calendar = JSON.parse(readFileSync(CALENDAR_FILE, 'utf-8'));
  const partidos = calendar.filter(m => RONDAS.includes(m.ronda));

  console.log(`Conectando a MongoDB...`);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`MongoDB conectado\n`);

  console.log(`Partidos a scrapear: ${partidos.length} (rondas ${RONDAS.join(', ')})\n`);

  let ok = 0, fail = 0;

  for (let i = 0; i < partidos.length; i++) {
    const p = partidos[i];
    const prefix = `[${i + 1}/${partidos.length}]`;
    try {
      const stats = await scrapMatchStats(p.id);
      await MatchStats.findOneAndUpdate(
        { eventId: p.id },
        { eventId: p.id, stats, lastUpdated: new Date() },
        { upsert: true, new: true }
      );
      const home = stats[String(p.equipoLocal.id)]?.goles ?? '?';
      const away = stats[String(p.equipoVisitante.id)]?.goles ?? '?';
      console.log(`${prefix} ✔ R${p.ronda} ${p.equipoLocal.name} ${home} - ${away} ${p.equipoVisitante.name} (${p.id})`);
      ok++;
    } catch (err) {
      console.log(`${prefix} ✘ R${p.ronda} ${p.equipoLocal.name} vs ${p.equipoVisitante.name} (${p.id}) → ${err.message}`);
      fail++;
    }
    if (i < partidos.length - 1) await sleep(2000);
  }

  console.log(`\n completado: ${ok} ok, ${fail} errores`);
  await mongoose.disconnect();
}

main();
