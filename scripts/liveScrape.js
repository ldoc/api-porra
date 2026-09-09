#!/usr/bin/env node
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { scrapMatchStats, extractLiveMeta } from './matchStats.js';
import LiveMatch from '../db/models/LiveMatch.js';

config();

export function parseLiveArgs(argv) {
  const args = [...argv];
  let intervalMs = 120000;
  const ix = args.indexOf('--interval');
  if (ix !== -1) {
    const secs = Number(args[ix + 1]);
    if (!Number.isFinite(secs) || secs < 15) throw new Error('--interval debe ser >= 15 segundos');
    intervalMs = secs * 1000;
    args.splice(ix, 2);
  }
  const eventIds = args.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!eventIds.length) throw new Error('Uso: node scripts/liveScrape.js <eventId...> [--interval 120]');
  return { eventIds, intervalMs };
}

export function shouldDeleteLive(finishedAt, now = new Date()) {
  if (!finishedAt) return false;
  return now - new Date(finishedAt) > 30 * 60 * 1000;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeOnce(eventId) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stats = await scrapMatchStats(eventId);
      const keys = Object.keys(stats).filter(k => k !== 'jugadores');
      const homeTeamId = Number(keys[0]);
      const awayTeamId = Number(keys[1]);
      const homeGoles = stats[String(homeTeamId)]?.goles ?? 0;
      const awayGoles = stats[String(awayTeamId)]?.goles ?? 0;
      // Meta live: re-deriva estado desde el evento ya scrapeado vía stats es insuficiente;
      // por eso extractLiveMeta se alimenta del evento interno: aquí usamos heurística
      // finished solo si el scrapeo trae minutos 90+ y evento cerrado; el estado exacto
      // lo fija extractLiveMeta cuando se amplíe el fetch de evento (v1: live por defecto).
      const meta = { estado: 'live', minuto: 0, homeTeamId, awayTeamId, homeGoles, awayGoles };
      const update = { eventId, ...meta, stats, scrapedAt: new Date() };
      if (meta.estado === 'finalizado') update.finishedAt = new Date();
      // No pisar finishedAt ya fijado:
      const prev = await LiveMatch.findOne({ eventId }).lean();
      if (prev?.finishedAt && !update.finishedAt) update.finishedAt = prev.finishedAt;
      await LiveMatch.findOneAndUpdate({ eventId }, update, { upsert: true, new: true });
      console.log(`✔ ${eventId} → ${homeGoles}-${awayGoles} (${meta.estado})`);
      return true;
    } catch (err) {
      console.log(`✘ ${eventId} intento ${attempt}/3 → ${err.message}`);
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  return false;
}

async function main() {
  const { eventIds, intervalMs } = parseLiveArgs(process.argv.slice(2));
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Live scrapeo: ${eventIds.join(', ')} cada ${intervalMs / 1000}s. Ctrl+C para parar.`);
  const finishedAtMap = new Map();
  process.on('SIGINT', async () => { await mongoose.disconnect(); process.exit(0); });
  while (true) {
    for (const id of eventIds) {
      const ok = await scrapeOnce(id);
      if (!ok) continue;
      const doc = await LiveMatch.findOne({ eventId: id }).lean();
      if (doc?.estado === 'finalizado' && doc.finishedAt && !finishedAtMap.has(id)) finishedAtMap.set(id, new Date(doc.finishedAt));
    }
    const now = new Date();
    for (const id of [...eventIds]) {
      const doc = await LiveMatch.findOne({ eventId: id }).lean();
      const fin = doc?.finishedAt ? new Date(doc.finishedAt) : null;
      if (shouldDeleteLive(fin, now)) {
        await LiveMatch.deleteOne({ eventId: id });
        console.log(`🧹 ${id} borrado (30 min tras fin)`);
        eventIds.splice(eventIds.indexOf(id), 1);
      }
    }
    if (!eventIds.length) { console.log('Sin partidos live. Saliendo.'); break; }
    await sleep(intervalMs);
  }
  await mongoose.disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
