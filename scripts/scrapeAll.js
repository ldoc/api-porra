import 'dotenv/config';
import fs from 'node:fs';
import { connectDB } from '../db/index.js';
import MatchStats from '../db/models/MatchStats.js';
import { scrapMatchStats } from './matchStats.js';

const calendar = JSON.parse(fs.readFileSync('data/sofascore/calendar.json', 'utf8'));
const DELAY_MS = 10_000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

await connectDB();
console.log(`Scrapeando ${calendar.length} partidos con ${DELAY_MS / 1000}s de pausa...\n`);

let ok = 0;
let fail = 0;

for (let i = 0; i < calendar.length; i++) {
    const partido = calendar[i];
    const tag = `[${i + 1}/${calendar.length}] ${partido.equipoLocal.name} vs ${partido.equipoVisitante.name} (${partido.id})`;

    try {
        const stats = await scrapMatchStats(partido.id);
        await MatchStats.findOneAndUpdate(
            { eventId: partido.id },
            { stats, lastUpdated: new Date() },
            { upsert: true }
        );
        ok++;
        console.log(`✓ ${tag}`);
    } catch (err) {
        fail++;
        console.error(`✗ ${tag} → ${err.message}`);
    }

    if (i < calendar.length - 1) await sleep(DELAY_MS);
}

console.log(`\nFin. Guardados: ${ok} | Fallidos: ${fail}`);
process.exit(0);
