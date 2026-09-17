#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, LiveMatch } from '../db/index.js';
import { scrapMatchFull } from './matchStats.js';
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
      const { stats, statusType, minute } = await scrapMatchFull(m.id);
      const status = liveStatusFromSofascore(statusType);
      if (!status) continue;
      await LiveMatch.findOneAndUpdate(
        { eventId: m.id },
        buildLiveDoc(m.id, stats, status, Date.now(), minute),
        { upsert: true, returnDocument: 'after' }
      );
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
