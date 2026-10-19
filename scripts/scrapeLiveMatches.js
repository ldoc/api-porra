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
const CALENDAR_REFRESH_MS = 10 * 60_000;
const ONCE = process.argv.includes('--once');
const calendarPath = path.join(__dirname, '../data/sofascore/calendar.json');

const loadCalendar = () => JSON.parse(fs.readFileSync(calendarPath, 'utf-8'));
let calendar = loadCalendar();
let calendarLoadedAt = Date.now();
const lastSnapshotHash = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString();

function refreshCalendarIfNeeded(nowMs) {
  if (nowMs - calendarLoadedAt < CALENDAR_REFRESH_MS) return;
  try {
    calendar = loadCalendar();
    calendarLoadedAt = nowMs;
    console.log(`${stamp()} calendar.json recargado`);
  } catch (e) {
    console.error(`${stamp()} No se pudo recargar calendar.json: ${e.message}`);
  }
}

async function tick() {
  refreshCalendarIfNeeded(Date.now());
  const live = selectLiveMatches(calendar, Date.now());
  console.log(`${stamp()} Partidos en ventana live: ${live.length}`);
  if (live.length === 0) return;

  const ids = live.map(m => m.id);
  const [snapshots, finalEvents, existingDocs] = await Promise.all([
    LiveMatch.find({ eventId: { $in: ids } }, 'eventId status').lean(),
    LiveEvent.find({ eventId: { $in: ids }, sourceId: 'final', source: { $ne: 'sim' } }, 'eventId').lean(),
    LiveEvent.find(
      { eventId: { $in: ids }, source: { $ne: 'sim' } },
      `eventId ${LIVE_EXISTING_PROJECTION}`
    ).sort({ ts: 1, seq: 1 }).lean()
  ]);
  const finals = new Set(finalEvents.map(d => d.eventId));
  const finished = new Set(
    snapshots.filter(d => d.status === 'FT' && finals.has(d.eventId)).map(d => d.eventId)
  );

  const existingByMatch = new Map();
  for (const d of existingDocs) {
    if (!existingByMatch.has(d.eventId)) existingByMatch.set(d.eventId, []);
    existingByMatch.get(d.eventId).push(d);
  }

  const ops = [];
  let ok = 0;
  let skipped = 0;
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

      const hash = JSON.stringify({
        s: obs.status,
        m: obs.minute,
        h: obs.score?.home,
        a: obs.score?.away,
        i: (obs.incidents || []).length
      });
      if (lastSnapshotHash.get(m.id) === hash) { skipped++; continue; }

      for (const ev of deriveEvents(obs, existingByMatch.get(m.id) || [], Date.now())) {
        ops.push({ insertOne: { document: ev } });
      }

      // 3) snapshot (respaldo) — mantiene el comportamiento actual
      const { stats, minute } = await scrapMatchFull(m.id, raw);
      await LiveMatch.findOneAndUpdate(
        { eventId: m.id },
        buildLiveDoc(m.id, stats, status, Date.now(), minute),
        { upsert: true, returnDocument: 'after' }
      );
      lastSnapshotHash.set(m.id, hash);
      ok++;
    } catch (e) {
      console.error(`${stamp()} Fallo scrapeo ${m.id}: ${e.message}`);
    }
  }

  if (ops.length) {
    try {
      await LiveEvent.bulkWrite(ops, { ordered: false });
    } catch (e) {
      if (e.code !== 11000 && !Array.isArray(e.writeErrors)) throw e; // duplicados: ignorar
    }
  }
  console.log(`${stamp()} Guardados: ${ok}/${live.length} (sin cambios: ${skipped})`);
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
