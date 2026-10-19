#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, LiveMatch, LiveEvent } from '../db/index.js';
import { scrapMatchSource, scrapMatchFull, fetchMatchData } from './matchStats.js';
import { deriveEvents, LIVE_EXISTING_PROJECTION } from '../api/liveEvents.js';
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

  const ids = live.map(m => m.id);
  const [snapshots, finalEvents] = await Promise.all([
    LiveMatch.find({ eventId: { $in: ids } }, 'eventId status').lean(),
    LiveEvent.find({ eventId: { $in: ids }, sourceId: 'final', source: { $ne: 'sim' } }, 'eventId').lean()
  ]);
  const finals = new Set(finalEvents.map(d => d.eventId));
  const finished = new Set(
    snapshots.filter(d => d.status === 'FT' && finals.has(d.eventId)).map(d => d.eventId)
  );

  let ok = 0;
  for (const m of live) {
    if (finished.has(m.id)) continue;
    try {
      // 1) datos Sofascore una sola vez por partido (4 endpoints)
      const raw = await fetchMatchData(m.id);

      // 2) eventos ANTES del snapshot: un fallo posterior no debe marcar FT sin eventos
      const obs = await scrapMatchSource(m.id, raw);
      const status = liveStatusFromSofascore(obs.statusType, obs.statusCode);
      if (!status) continue;
      obs.status = status;
      obs.kickoffMs = m.fecha * 1000; // ancla temporal al inicio programado
      const existing = await LiveEvent.find({ eventId: m.id, source: { $ne: 'sim' } },
        LIVE_EXISTING_PROJECTION).sort({ ts: 1, seq: 1, _id: 1 }).lean();
      const nuevos = deriveEvents(obs, existing, Date.now());
      if (nuevos.length) {
        try {
          await LiveEvent.insertMany(nuevos, { ordered: false });
        } catch (e) {
          if (e.code !== 11000) throw e; // duplicados: ignorar
        }
      }

      // 3) snapshot (respaldo) — mantiene el comportamiento actual
      const { stats, minute } = await scrapMatchFull(m.id, raw);
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
