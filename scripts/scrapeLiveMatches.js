import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, LiveMatch } from '../db/index.js';
import { scrapMatchStats } from './matchStats.js';
import { selectLiveMatches, buildLiveDoc } from '../api/live.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const calendar = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/sofascore/calendar.json'), 'utf-8'));
const nowMs = Date.now();
const todays = selectLiveMatches(calendar, nowMs);
console.log(`Partidos en ventana live: ${todays.length}`);

if (todays.length === 0) {
  console.log('Guardados: 0/0');
  process.exit(0);
}

await connectDB();
let ok = 0;
for (const m of todays) {
  try {
    const stats = await scrapMatchStats(m.id);
    const doc = buildLiveDoc(m.id, stats, 'LIVE', Date.now());
    await LiveMatch.findOneAndUpdate({ eventId: m.id }, doc, { upsert: true, new: true });
    ok++;
  } catch (e) {
    console.error(`Fallo scrapeo ${m.id}: ${e.message}`);
  }
}
console.log(`Guardados: ${ok}/${todays.length}`);
process.exit(0);
