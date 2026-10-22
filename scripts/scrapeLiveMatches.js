#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, LiveMatch, LiveEvent } from '../db/index.js';
import GameConfig from '../db/models/GameConfig.js';
import { scrapMatchSource, scrapMatchFull, fetchMatchData } from './matchStats.js';
import { deriveEvents, holdScoreCorrection, LIVE_EXISTING_PROJECTION } from '../api/liveEvents.js';
import { selectLiveMatches, buildLiveDoc, liveStatusFromSofascore, buildScrapeLog } from '../api/live.js';
import {
  liveSnapshotHash,
  isDuplicateWriteError,
  criticalFetchFailures,
  scrapeHealth
} from './liveScraper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTERVAL_MS = 30_000;
const CALENDAR_REFRESH_MS = 10 * 60_000;
const FANTASY_TTL_MS = 60_000;
const ONCE = process.argv.includes('--once');
const calendarPath = path.join(__dirname, '../data/sofascore/calendar.json');

const loadCalendar = () => JSON.parse(fs.readFileSync(calendarPath, 'utf-8'));
let calendar = loadCalendar();
let calendarLoadedAt = Date.now();
const lastSnapshotHash = new Map();
// Marcador adelantado por Sofascore a la espera de que llegue la incidencia del
// gol: { home, away, sinceMs }. Evita que el marcador suba un poll antes que el
// evento del goleador.
const pendingScores = new Map();
// Only the fantasy feed is cached. Lineups carry the live ratings/minutes and
// are fetched fresh every tick so a rating change is visible immediately.
const fantasyCache = new Map();
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

async function recordScrape({ startedMs, live, ok = 0, inserted = 0, healthy = true }) {
  const nowMs = Date.now();
  const log = buildScrapeLog({ startedMs, nowMs, live, ok, inserted });
  console.log(JSON.stringify(log));
  try {
    await GameConfig.updateOne(
      { _id: 'gameConfig' },
      { $set: { lastScrapeAt: new Date(nowMs), lastScrapeOk: healthy } },
      { upsert: true }
    );
  } catch (e) {
    console.error(`${stamp()} No se pudo persistir lastScrapeAt: ${e.message}`);
  }
}

async function tick() {
  const startedMs = Date.now();
  const stats = { live: 0, ok: 0, inserted: 0, attempted: 0, failed: 0, criticalFailed: 0, fatal: false };
  try {
    refreshCalendarIfNeeded(Date.now());
    const live = selectLiveMatches(calendar, Date.now());
    stats.live = live.length;
    const liveIds = new Set(live.map(m => m.id));
    for (const id of pendingScores.keys()) {
      if (!liveIds.has(id)) pendingScores.delete(id);
    }
    if (live.length === 0) return;

    const ids = [...liveIds];
    const [snapshots, finalEvents, existingDocs] = await Promise.all([
      LiveMatch.find({ eventId: { $in: ids } }, 'eventId status').lean(),
      LiveEvent.find({ eventId: { $in: ids }, sourceId: 'final', source: { $ne: 'sim' } }, 'eventId').lean(),
      LiveEvent.find(
        { eventId: { $in: ids }, source: { $ne: 'sim' } },
        `eventId ${LIVE_EXISTING_PROJECTION}`
      ).sort({ ts: 1, seq: 1, ingestedAt: 1, _id: 1 }).lean()
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
    const pending = [];
    let skipped = 0;
    for (const m of live) {
      if (finished.has(m.id)) { pendingScores.delete(m.id); continue; }
      stats.attempted++;
      try {
        const now = Date.now();
        const cachedFantasy = fantasyCache.get(m.id);
        const fantasyFresh = !!cachedFantasy && now - cachedFantasy.at < FANTASY_TTL_MS;

        // 1) datos Sofascore: event+incidents+lineups siempre (lineups es la
        // fuente de ratings/minutos); fantasy cada 60s.
        const raw = await fetchMatchData(m.id, {
          fantasyData: fantasyFresh ? cachedFantasy.data : undefined
        });
        if (!fantasyFresh && raw.fantasyData) {
          fantasyCache.set(m.id, { data: raw.fantasyData, at: Date.now() });
        }

        const failures = criticalFetchFailures(raw);
        if (failures.length) {
          stats.failed++;
          stats.criticalFailed++;
          for (const failure of failures) {
            const status = Number(/^HTTP (\d+)/.exec(failure.message)?.[1]) || null;
            console.error(JSON.stringify({
              t: stamp(), eventId: m.id, endpoint: failure.endpoint,
              status, error: failure.message
            }));
          }
          // No hash/snapshot advancement: next tick retries the failed data.
          continue;
        }

        // 2) observación y eventos ANTES de snapshot/hash
        const obs = await scrapMatchSource(m.id, raw);
        const status = liveStatusFromSofascore(obs.statusType, obs.statusCode);
        if (!status) continue;
        obs.status = status;
        obs.kickoffMs = m.fecha * 1000; // ancla temporal al inicio programado

        const hash = liveSnapshotHash(obs);
        const pendingScore = pendingScores.get(m.id) || null;
        // Con una corrección en espera hay que volver a evaluarla aunque el hash
        // no cambie: si no, el marcador no se reconciliaría nunca.
        if (!pendingScore && lastSnapshotHash.get(m.id) === hash) { skipped++; continue; }

        const nuevos = deriveEvents(obs, existingByMatch.get(m.id) || [], now);
        const held = holdScoreCorrection(nuevos, pendingScore, now);
        if (held.pending) pendingScores.set(m.id, held.pending);
        else pendingScores.delete(m.id);
        for (const ev of held.events) ops.push({ insertOne: { document: ev } });

        // 3) snapshot se persiste solo tras confirmar el flush de eventos
        const { stats: matchStats, minute } = await scrapMatchFull(m.id, raw);
        const snapshotDoc = buildLiveDoc(m.id, matchStats, status, Date.now(), minute);
        pending.push({ match: m, snapshotDoc, hash, eventCount: held.events.length });
      } catch (e) {
        stats.failed++;
        console.error(`${stamp()} Fallo scrapeo ${m.id}: ${e.message}`);
      }
    }

    // Invariante: eventos antes que snapshots/hashes. Ante error real no se avanza nada.
    if (ops.length) {
      try {
        await LiveEvent.bulkWrite(ops, { ordered: false });
        stats.inserted = ops.length;
      } catch (e) {
        if (!isDuplicateWriteError(e)) {
          stats.fatal = true;
          console.error(`${stamp()} Fallo bulkWrite de eventos: ${e.message}; snapshots y hashes no avanzan`);
          return;
        }
        stats.inserted = ops.length;
      }
    }

    for (const { match, snapshotDoc, hash } of pending) {
      try {
        await LiveMatch.findOneAndUpdate(
          { eventId: match.id },
          snapshotDoc,
          { upsert: true, returnDocument: 'after' }
        );
        lastSnapshotHash.set(match.id, hash);
        stats.ok++;
      } catch (e) {
        stats.failed++;
        console.error(`${stamp()} Fallo snapshot ${match.id}: ${e.message}`);
      }
    }
  } catch (e) {
    stats.fatal = true;
    throw e;
  } finally {
    const healthy = scrapeHealth(stats);
    await recordScrape({ startedMs, ...stats, healthy });
  }
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
