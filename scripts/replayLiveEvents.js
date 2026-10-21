#!/usr/bin/env node
/**
 * replayLiveEvents.js — Replica en `test` los eventos reales de un día como si
 * fueran un directo (source:'sim'), para ver la evolución en el Live local.
 *
 * - Lee los eventos reales (`source:'scraper'`) de los eventIds indicados en la
 *   DB de `--env-file` (debe ser `test`).
 * - Hace backup de los eventos y de los `matchstats` en `.superpowers/live-replay/`.
 * - Borra los `matchstats` de esos partidos (para que el Live no los excluya).
 * - Borra los eventos de esos partidos y los reinserta como `source:'sim'` con
 *   `ts` rebasado a ahora y `ingestedAt` actual, en tandas por minuto original.
 *
 * Uso:
 *   node --env-file=.env scripts/replayLiveEvents.js --tick 5
 *   node --env-file=.env scripts/replayLiveEvents.js --events 1,2 --tick 10
 *   node --env-file=.env scripts/replayLiveEvents.js --from-file .superpowers/live-replay/2026-10-20-liveevents.json
 *
 * Front: http://localhost:8080/?liveSim=1 (limpia la caché de matchstats y la del Live).
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB, LiveEvent, MatchStats, LiveMatch } from '../db/index.js';
import { expireAtEndOfDayUTC } from '../api/liveEvents.js';

const DEFAULT_IDS = '16938775,16938793,16938800,16938855,16938875,16938987,16939025';
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const ids = String(arg('events', DEFAULT_IDS)).split(',').map(s => Number(s.trim())).filter(Boolean);
const tick = Number(arg('tick', 5));
const realtime = !!arg('realtime', false);
const seedMinute = Math.min(90, Math.max(0, Number(arg('seed-minute', 0)) || 0));
const seedBreak = seedMinute > 45 ? 15 : 0;
const seedRealMinute = seedMinute + seedBreak;
const fromFile = arg('from-file', null);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stamp = new Date().toISOString().slice(0, 10);
const backupDir = path.join(process.cwd(), '.superpowers', 'live-replay');
const eventsFile = fromFile || path.join(backupDir, `${stamp}-liveevents.json`);
const msFile = path.join(backupDir, `${stamp}-matchstats.json`);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data)); };
let calendarById = new Map();
try {
  const calendar = readJson(path.join(process.cwd(), 'data/sofascore/calendar.json'));
  calendarById = new Map((calendar || []).map(m => [String(m.id), m]));
} catch (e) { /* sin calendario: stats de respaldo */ }

await connectDB();
if (mongoose.connection.name !== 'test') {
  console.error(`Abortado: este script solo escribe en test (DB actual: ${mongoose.connection.name}).`);
  process.exit(1);
}

let events;
if (fromFile) {
  events = readJson(fromFile);
} else {
  events = await LiveEvent.find({ eventId: { $in: ids }, source: 'scraper' }).sort({ ts: 1, seq: 1 }).lean();
  if (!events.length && fs.existsSync(eventsFile)) events = readJson(eventsFile);
}
if (!events.length) {
  console.error('No hay eventos reales (scraper) para esos ids ni backup. Nada que replicar.');
  process.exit(1);
}

writeJson(eventsFile, events);
const matchstats = await MatchStats.find({ eventId: { $in: ids } }).lean();
if (matchstats.length) writeJson(msFile, matchstats);
else if (!fs.existsSync(msFile)) writeJson(msFile, []);
await MatchStats.deleteMany({ eventId: { $in: ids } });
await LiveMatch.deleteMany({ eventId: { $in: ids } });
const deleted = await LiveEvent.deleteMany({ eventId: { $in: ids } });
console.log(`Backup: ${events.length} eventos y ${matchstats.length} matchstats.`);
console.log(`Borrados en test: ${deleted.deletedCount} eventos y ${matchstats.length} matchstats.`);

// Arrancar en el kickoff (status LIVE period1) para que todos los partidos
// estén ya iniciados; se descartan eventos previos (p. ej. tarjetas pre-partido).
const kickoffs = events
  .filter(e => e.type === 'status' && e.payload && e.payload.status === 'LIVE'
    && (!e.payload.period || e.payload.period === 'period1'))
  .map(e => new Date(e.ts).getTime());
const origStart = kickoffs.length
  ? Math.min(...kickoffs)
  : events.reduce((m, e) => Math.min(m, new Date(e.ts).getTime()), Infinity);
events = events.filter(e => new Date(e.ts).getTime() >= origStart);

const realMinuteOf = e => Math.floor((new Date(e.ts).getTime() - origStart) / 60000);
const seedEvents = seedMinute > 0
  ? events.filter(e => realMinuteOf(e) <= seedRealMinute)
  : [];
const replayEvents = seedMinute > 0
  ? events.filter(e => realMinuteOf(e) > seedRealMinute)
  : events;

const replayStart = Date.now();
const expireAt = new Date(Math.max(
  expireAtEndOfDayUTC(replayStart).getTime(),
  replayStart + 3 * 3600 * 1000
));

const scoreByMatch = new Map();
const statusByMatch = new Map();
function applyReplayEvent(ev) {
  const id = String(ev.eventId);
  if (ev.type === 'goal' || ev.type === 'score') {
    const p = ev.payload || {};
    if (p.scoreHome != null && p.scoreAway != null) {
      scoreByMatch.set(id, { home: Number(p.scoreHome), away: Number(p.scoreAway) });
    }
  }
  if (ev.type === 'status' && ev.payload && ev.payload.status) {
    statusByMatch.set(id, ev.payload.status);
  }
}

async function writeLiveSnapshots(minute) {
  const now = new Date();
  const ops = [];
  for (const id of ids) {
    const match = calendarById.get(String(id));
    const score = scoreByMatch.get(String(id)) || { home: 0, away: 0 };
    const status = statusByMatch.get(String(id)) || 'LIVE';
    const snapshotMinute = status === 'FT' ? 90 : minute;
    const stats = match
      ? {
          [match.equipoLocal.id]: { goles: score.home },
          [match.equipoVisitante.id]: { goles: score.away },
          jugadores: []
        }
      : { scoreHome: score.home, scoreAway: score.away, jugadores: [] };
    ops.push({
      updateOne: {
        filter: { eventId: id },
        update: { $set: { eventId: id, stats, status, minute: snapshotMinute, lastUpdated: now, expireAt } },
        upsert: true
      }
    });
  }
  if (ops.length) await LiveMatch.bulkWrite(ops, { ordered: false });
}

if (seedEvents.length) {
  const seedTime = Date.now();
  const seedDocs = seedEvents.map(e => {
    const offset = new Date(e.ts).getTime() - origStart;
    const doc = {
      ...e,
      ts: new Date(seedTime - (seedRealMinute * 60000 - offset)),
      ingestedAt: new Date(seedTime),
      source: 'sim',
      expireAt,
      payload: e.payload || {}
    };
    delete doc._id;
    delete doc.__v;
    if (doc.type === 'status') {
      doc.payload = {
        ...(doc.payload || {}),
        kickoffTs: new Date(seedTime - seedRealMinute * 60000).toISOString()
      };
    }
    doc.payload = { ...(doc.payload || {}), seed: true };
    return doc;
  });
  try {
    await LiveEvent.insertMany(seedDocs, { ordered: false });
  } catch (e) {
    if (e.code !== 11000 && !Array.isArray(e.writeErrors)) throw e;
  }
  for (const ev of seedEvents) applyReplayEvent(ev);
  await writeLiveSnapshots(seedMinute);
  console.log(`Seed: ${seedDocs.length} eventos hasta el minuto ${seedMinute} (real ${seedRealMinute}).`);
}

const groups = new Map();
for (const e of replayEvents) {
  const offset = new Date(e.ts).getTime() - origStart;
  const minute = Math.floor(offset / 60000);
  const doc = {
    ...e,
    ts: new Date(replayStart + offset),
    ingestedAt: new Date(),
    source: 'sim',
    expireAt,
    payload: e.payload || {}
  };
  delete doc._id;
  delete doc.__v;
  if (!groups.has(minute)) groups.set(minute, []);
  groups.get(minute).push(doc);
}
const minutes = [...groups.keys()].sort((a, b) => a - b);
console.log(`Replay: ${replayEvents.length} eventos, ${minutes.length} minutos, ${realtime ? 'TIEMPO REAL' : `tick ${tick}s`}, inicio ${new Date(replayStart).toISOString()}`);

for (let i = 0; i < minutes.length; i++) {
  const m = minutes[i];
  const target = realtime
    ? replayStart + Math.max(0, m - seedRealMinute) * 60000
    : replayStart + i * tick * 1000;
  const wait = target - Date.now();
  if (wait > 0) await sleep(wait);
  const batch = groups.get(m);
  const insertTime = Date.now();
  for (const d of batch) {
    d.ingestedAt = new Date();
    if (d.type === 'status') {
      // Reloj: el minuto mostrado debe ser el del status, no el comprimido del replay.
      d.payload = { ...(d.payload || {}), kickoffTs: new Date(insertTime - (d.minute ?? 0) * 60000).toISOString() };
    }
  }
  try {
    await LiveEvent.insertMany(batch, { ordered: false });
  } catch (e) {
    if (e.code !== 11000 && !Array.isArray(e.writeErrors)) throw e;
  }
  for (const ev of batch) applyReplayEvent(ev);
  const matchMinute = batch.reduce((mx, ev) => Math.max(mx, Number(ev.minute) || 0), 0)
    || Math.max(0, m - seedBreak);
  await writeLiveSnapshots(matchMinute);
  console.log(`[min ${m}] +${batch.length} · snapshot ${matchMinute}'`);
}

console.log('Replay terminado.');
console.log('Front: http://localhost:8080/?liveSim=1');
console.log('Si no ves los cambios, recarga y limpia localStorage.porra_cache_matchstats_v1 y sessionStorage.porra_live_events_v1*.');
process.exit(0);
