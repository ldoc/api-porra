#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, LiveMatch, LiveEvent } from '../db/index.js';
import { scrapMatchSource, scrapMatchFull } from './matchStats.js';
import { deriveEvents } from '../api/liveEvents.js';
import { selectLiveMatches, buildLiveDoc, liveStatusFromSofascore } from '../api/live.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTERVAL_MS = 30_000;
const ONCE = process.argv.includes('--once');

const calendar = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/sofascore/calendar.json'), 'utf-8'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString();

async function tick() {
  const live = selectLiveMatches(calendar, Date.now());
  console.log(`${stamp()} Partidos en ventana live: ${live.length}`);
  if (live.length === 0) return;

  const existing = await LiveMatch.find({ eventId: { $in: live.map(m => m.id) } }, 'eventId status').lean();
  const finished = new Set(existing.filter(d => d.status === 'FT').map(d => d.eventId));

  let ok = 0;
  for (const m of live) {
    if (finished.has(m.id)) continue;
    try {
      // 1) snapshot (respaldo) — mantiene el comportamiento actual
      const { stats, statusType, statusCode, minute } = await scrapMatchFull(m.id);
      const status = liveStatusFromSofascore(statusType, statusCode);
      if (!status) continue;
      await LiveMatch.findOneAndUpdate(
        { eventId: m.id },
        buildLiveDoc(m.id, stats, status, Date.now(), minute),
        { upsert: true, returnDocument: 'after' }
      );

      // 2) eventos
      const obs = await scrapMatchSource(m.id);
      obs.status = status;
      obs.kickoffMs = m.fecha * 1000; // ancla temporal al inicio programado
      const existing = await LiveEvent.find({ eventId: m.id }, 'sourceId type payload').lean();
      const nuevos = deriveEvents(obs, existing, Date.now());
      if (nuevos.length) {
        try {
          await LiveEvent.insertMany(nuevos, { ordered: false });
        } catch (e) {
          if (e.code !== 11000) throw e; // duplicados: ignorar
        }
      }
      ok++;
    } catch (e) {
      console.error(`${stamp()} Fallo scrapeo ${m.id}: ${e.message}`);
    }
  }
  console.log(`${stamp()} Guardados: ${ok}/${live.length}`);
}

await connectDB();

if (ONCE) {
  await tick();
  process.exit(0);
}

process.on('SIGINT', () => {
  console.log('\nParando scrapeo live...');
  process.exit(0);
});

console.log(`Scrapeo live cada ${INTERVAL_MS / 1000}s. Ctrl+C para parar.`);
while (true) {
  try { await tick(); } catch (e) { console.error(`${stamp()} tick falló: ${e.message}`); }
  await sleep(INTERVAL_MS);
}
