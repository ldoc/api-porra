#!/usr/bin/env node
/**
 * simulateLiveEvents.js — Simulador de directo para el Live v2 (colección `liveevents`).
 *
 * Inserta eventos de UNO O VARIOS partidos en `liveevents` por ticks (como el scraper
 * real), para validar la pantalla Live: clasificación que se mueve, animación, feed.
 * NO toca pronósticos ni plantillas.
 *
 * Uso:
 *   node --env-file=.env scripts/simulateLiveEvents.js --events 16938979,16938807,16938789,16938777,16939003
 *   node --env-file=.env scripts/simulateLiveEvents.js --events 16938979 --tick 10 --user leandro
 *   node --env-file=.env scripts/simulateLiveEvents.js --events 16938979 --clean-only   # borra sim y sale
 *
 * Flags:
 *   --events <id,id,...>  eventIds del calendario (por defecto 5 partidos ronda 2)
 *   --event <id>          alias de un solo partido
 *   --user <username>     opcional: lista tus jugadores implicados (no modifica nada)
 *   --tick <segundos>     pausa entre minutos simulados (por defecto 15)
 *   --clean               al terminar borra solo los eventos sim|* de esos partidos
 *   --clean-only          borra los eventos sim|* y sale
 *   --dry                 solo siembra min 0 (lineups + kickoff) y sale
 *
 * Genera por partido (variado): goles con asistencia, cambios de nota, tarjetas,
 * cambios de jugador, penaltis parados/fallados, goles anulados (VAR), descanso,
 * 2ª parte y final autoritativo. `ts` se ancla al kickoff + minuto (con +15' tras el 45')
 * e `ingestedAt` = ahora (para el delta del front).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, User, LiveEvent, MatchStats } from '../db/index.js';
import { expireAtEndOfDayUTC } from '../api/liveEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SIM_PREFIX = 'sim|';

function readDataJson(name) {
  const candidates = [
    path.join(__dirname, '../data/sofascore', name),
    path.join('/home/ldoc/Proyectos/api-porra/data/sofascore', name)
  ];
  for (const p of candidates) if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  throw new Error(`No encontrado ${name} en ${candidates.join(' / ')}`);
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  if (['clean', 'dry', 'clean-only', 'force'].includes(name)) return true;
  return process.argv[i + 1] ?? def;
}

const DEFAULT_EVENTS = '16938979,16938807,16938789,16938777,16939003';

function pickSquad(equipoId, allPlayers) {
  const pool = allPlayers.filter(p => p.equipo === equipoId);
  const by = (pos, n) => pool.filter(p => p.posicion === pos).slice(0, n);
  return [...by('G', 1), ...by('D', 2), ...by('M', 3), ...by('F', 3)];
}

const GOAL_PATTERNS = [
  [[1, 'H'], [3, 'A'], [5, 'H'], [8, 'A'], [11, 'H'], [14, 'A'], [18, 'H'], [24, 'A'], [35, 'H'], [60, 'A']],
  [[2, 'A'], [4, 'H'], [6, 'A'], [9, 'H'], [12, 'A'], [16, 'H'], [21, 'A'], [30, 'H'], [55, 'A'], [75, 'H']],
  [[1, 'A'], [3, 'H'], [7, 'A'], [10, 'H'], [13, 'A'], [17, 'H'], [22, 'A'], [33, 'H'], [50, 'A'], [80, 'H']],
  [[2, 'H'], [5, 'A'], [8, 'H'], [12, 'A'], [15, 'H'], [19, 'A'], [26, 'H'], [40, 'A'], [65, 'H'], [85, 'A']],
  [[1, 'H'], [4, 'A'], [9, 'H'], [13, 'A'], [18, 'H'], [23, 'A'], [28, 'H'], [45, 'A'], [70, 'H'], [88, 'A']]
];

function scriptFor(idx) {
  const goals = GOAL_PATTERNS[idx % GOAL_PATTERNS.length];
  return {
    goals,
    var: idx % 2 === 1 ? 62 : null,
    penaltySaved: idx % 3 === 0 ? 40 : null,
    penaltyMissed: idx % 3 === 1 ? 40 : null,
    red: idx % 3 === 2 ? 77 : null,
    yellows: [20 + (idx * 3) % 12, 34 + (idx * 4) % 18],
    subs: [60],
    ratings: [10, 30, 55, 70]
  };
}

async function main() {
  const username = arg('user', null);
  const tickSecs = Number(arg('tick', 10));
  const clean = !!arg('clean', false);
  const cleanOnly = !!arg('clean-only', false);
  const dry = !!arg('dry', false);
  const force = !!arg('force', false);

  const calendar = readDataJson('calendar.json');
  const allPlayers = readDataJson('jugadores.json');
  await connectDB();

  // Elegir partidos SIN matchstat (si ya lo tienen, el front los excluye del live por diseño).
  const have = new Set((await MatchStats.find({}, { eventId: 1 }).lean()).map(d => d.eventId));
  const explicit = arg('events', null) || arg('event', null);
  let ids;
  if (explicit) {
    ids = String(explicit).split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
  } else {
    const nAuto = Number(arg('auto', 5));
    const nowSecs = Math.floor(Date.now() / 1000);
    const free = calendar.filter(m => !have.has(m.id));
    const fut = free.filter(m => m.fecha >= nowSecs - 3600).sort((a, b) => a.fecha - b.fecha);
    ids = (fut.length >= nAuto ? fut : free).slice(0, nAuto).map(m => m.id);
  }
  const clash = ids.filter(id => have.has(id));
  if (clash.length) {
    if (force) {
      await MatchStats.deleteMany({ eventId: { $in: clash } });
      console.log(`--force: borrados matchstats de ${clash.join(', ')} (el front los tratará como live).`);
    } else {
      console.warn(`AVISO: ya están en matchstats y el front los excluirá del live: ${clash.join(', ')}.`);
      console.warn('Usa --force para borrar sus matchstats, o --auto para elegir otros partidos.');
    }
  }

  const cleanFilter = { eventId: { $in: ids }, sourceId: { $regex: `^${SIM_PREFIX.replace('|', '\\|')}` } };
  if (cleanOnly) {
    const r = await LiveEvent.deleteMany(cleanFilter);
    console.log(`Borrados ${r.deletedCount} eventos sim de ${ids.join(', ')}.`);
    process.exit(0);
  }

  const kickoffMs = Date.now();
  const expireAt = expireAtOfDay(kickoffMs);
  const tsOf = (m) => new Date(kickoffMs + (m + (m > 45 ? 15 : 0)) * 60000);
  const tsStatus = (k) => new Date(kickoffMs + ({ live1: 0, ht: 45, live2: 60, ft: 105 }[k]) * 60000);

  const MS = [];
  const minuteSet = new Set([0, 45, 46, 90]);
  ids.forEach((id, idx) => {
    const match = calendar.find(m => m.id === id);
    if (!match) { console.error(`Partido ${id} no en calendar.json (ignorado)`); return; }
    const homeId = match.equipoLocal.id, awayId = match.equipoVisitante.id;
    const homeSquad = pickSquad(homeId, allPlayers), awaySquad = pickSquad(awayId, allPlayers);
    const sc = scriptFor(MS.length);
    for (const [m] of sc.goals) if (m !== 45 && m !== 46) minuteSet.add(m);
    if (sc.var != null) minuteSet.add(sc.var);
    if (sc.penaltySaved != null) minuteSet.add(sc.penaltySaved);
    if (sc.penaltyMissed != null) minuteSet.add(sc.penaltyMissed);
    if (sc.red != null) minuteSet.add(sc.red);
    for (const y of sc.yellows) minuteSet.add(y);
    for (const s of sc.subs) minuteSet.add(s);
    for (const r of sc.ratings) minuteSet.add(r);
    MS.push({ id, match, homeId, awayId, homeSquad, awaySquad,
      starters: [...homeSquad, ...awaySquad], sc,
      score: { [homeId]: 0, [awayId]: 0 }, assist: {}, goalsSeen: {} });
  });
  if (!MS.length) { console.error('Ningún partido válido.'); process.exit(1); }

  const minutes = [...minuteSet].filter(m => m >= 0 && m <= 90).sort((a, b) => a - b);
  const lead = (squad, role) => squad.find(p => p.posicion === role) || squad[0];
  const other = (squad, notId) => squad.find(p => p.id !== notId) || squad[0];

  const bulk = [];
  const insert = (M, ev) => bulk.push({ ...ev, eventId: M.id, expireAt, ingestedAt: new Date() });
  async function flush() {
    if (!bulk.length) return 0;
    const batch = bulk.splice(0, bulk.length);
    try { await LiveEvent.insertMany(batch, { ordered: false }); }
    catch (e) { if (e.code !== 11000 && !Array.isArray(e.writeErrors)) throw e; }
    return batch.length;
  }

  function eventsAtMinute(M, min) {
    const out = [];
    const { homeId, awayId, homeSquad, awaySquad, sc } = M;
    if (min === 0) {
      out.push({ type: 'lineup', minute: 0, second: 0, sourceId: `${SIM_PREFIX}lineup`,
        payload: { starters: M.starters.map(p => p.id) }, ts: tsStatus('live1') });
      out.push({ type: 'status', minute: 0, second: 0, sourceId: `${SIM_PREFIX}status|LIVE|period1`,
        payload: { status: 'LIVE', period: 'period1' }, ts: tsStatus('live1') });
      return out;
    }
    if (min === 45) { out.push({ type: 'status', minute: 45, second: 0, sourceId: `${SIM_PREFIX}status|HT|halftime`, payload: { status: 'HT', period: 'halftime' }, ts: tsStatus('ht') }); return out; }
    if (min === 46) { out.push({ type: 'status', minute: 45, second: 0, sourceId: `${SIM_PREFIX}status|LIVE|period2`, payload: { status: 'LIVE', period: 'period2' }, ts: tsStatus('live2') }); return out; }
    if (min >= 90) {
      out.push({ type: 'status', minute: 90, second: 0, sourceId: `${SIM_PREFIX}status|FT`, payload: { status: 'FT', period: null }, ts: tsStatus('ft') });
      const ratings = {};
      for (const p of M.starters) ratings[p.id] = +(6 + Math.random() * 3).toFixed(1);
      out.push({ type: 'match_final', minute: 90, second: 0, sourceId: `${SIM_PREFIX}final`, ts: tsStatus('ft'),
        payload: { scoreHome: M.score[homeId], scoreAway: M.score[awayId], ratings, minutes: {} } });
      return out;
    }

    // Goles + asistencia
    for (const [gmin, side] of sc.goals) {
      if (gmin !== min) continue;
      const teamId = side === 'H' ? homeId : awayId;
      const squad = side === 'H' ? homeSquad : awaySquad;
      const scorer = lead(squad, 'F'), assister = lead(squad, 'M');
      M.score[teamId] += 1;
      const gsrc = `${SIM_PREFIX}goal|${min}`;
      M.goalsSeen[gsrc] = { home: side === 'H' };
      out.push({ type: 'goal', minute: min, second: 0, teamId, playerId: scorer?.id ?? null, sourceId: gsrc, ts: tsOf(min),
        payload: { scorerId: scorer?.id ?? null, isPenalty: false, isOwnGoal: false, isHome: side === 'H', scoreHome: M.score[homeId], scoreAway: M.score[awayId] } });
      if (assister) {
        const c = (M.assist[assister.id] || 0) + 1; M.assist[assister.id] = c;
        out.push({ type: 'assist', minute: min, second: 0, teamId, playerId: assister.id, sourceId: `${SIM_PREFIX}assist|${assister.id}|${c}`, ts: tsOf(min), payload: { asistencias: c } });
      }
      console.log(`  [${M.match.equipoLocal.name.slice(0,3).toUpperCase()}] ⚽ Gol min ${min} (${scorer?.nombre ?? '?'}) · asist ${assister?.nombre ?? '?'}`);
    }

    // Cambios de nota (varios jugadores por tick para darle vidilla al feed)
    {
      const picks = [
        lead(homeSquad, 'M'), homeSquad[3], homeSquad[6],
        lead(awaySquad, 'M'), awaySquad[3], awaySquad[6]
      ].filter(Boolean);
      picks.forEach((p, i) => {
        const rating = +(6 + Math.min(3, min / 30) + (i % 3) * 0.1 + Math.random() * 0.2).toFixed(1);
        out.push({ type: 'rating', minute: min, second: 0, teamId: p.equipo, playerId: p.id, sourceId: `${SIM_PREFIX}rating|${p.id}|${min}`, ts: tsOf(min), payload: { rating } });
      });
    }

    // Tarjetas
    if (sc.yellows.includes(min)) {
      const seed = sc.yellows.indexOf(min);
      const side = seed % 2 === 0 ? homeId : awayId;
      const squad = side === homeId ? homeSquad : awaySquad;
      const p = lead(squad, 'D');
      out.push({ type: 'card', minute: min, second: 0, teamId: side, playerId: p?.id ?? null, sourceId: `${SIM_PREFIX}card|${min}`, ts: tsOf(min), payload: { cardType: 'yellow' } });
      console.log(`  [${M.match.equipoLocal.name.slice(0,3).toUpperCase()}] 🟨 Amarilla min ${min} (${p?.nombre ?? '?'})`);
    }
    if (sc.red === min) {
      const p = lead(homeSquad, 'D');
      out.push({ type: 'card', minute: min, second: 0, teamId: homeId, playerId: p?.id ?? null, sourceId: `${SIM_PREFIX}red|${min}`, ts: tsOf(min), payload: { cardType: 'red' } });
      console.log(`  [${M.match.equipoLocal.name.slice(0,3).toUpperCase()}] 🟥 Roja min ${min} (${p?.nombre ?? '?'})`);
    }

    // Cambios de jugador
    if (sc.subs.includes(min)) {
      for (const [squad, teamId] of [[homeSquad, homeId], [awaySquad, awayId]]) {
        const outP = lead(squad, 'F'); const inP = other(squad, outP?.id);
        if (outP && inP) out.push({ type: 'substitution', minute: min, second: 0, teamId, sourceId: `${SIM_PREFIX}sub|${teamId}|${min}`, ts: tsOf(min), payload: { inId: inP.id, outId: outP.id } });
      }
      console.log(`  [${M.match.equipoLocal.name.slice(0,3).toUpperCase()}] 🔄 Cambios min ${min}`);
    }

    // Penaltis
    if (sc.penaltySaved === min) {
      const gk = lead(homeSquad, 'G');
      out.push({ type: 'penalty_saved', minute: min, second: 0, teamId: homeId, playerId: gk?.id ?? null, sourceId: `${SIM_PREFIX}penalty|${min}`, ts: tsOf(min), payload: { keeperId: gk?.id ?? null, takerId: null } });
      console.log(`  [${M.match.equipoLocal.name.slice(0,3).toUpperCase()}] 🧤 Penalti parado min ${min} (${gk?.nombre ?? '?'})`);
    }
    if (sc.penaltyMissed === min) {
      const taker = lead(awaySquad, 'F');
      out.push({ type: 'penalty_missed', minute: min, second: 0, teamId: awayId, playerId: taker?.id ?? null, sourceId: `${SIM_PREFIX}pmiss|${min}`, ts: tsOf(min), payload: { takerId: taker?.id ?? null } });
      console.log(`  [${M.match.equipoLocal.name.slice(0,3).toUpperCase()}] ❌ Penalti fallado min ${min} (${taker?.nombre ?? '?'})`);
    }

    // Gol anulado (VAR)
    if (sc.var === min) {
      const entry = Object.entries(M.goalsSeen).find(([, g]) => !g.cancelled);
      if (entry) {
        entry[1].cancelled = true;
        const home = entry[1].home;
        if (home) M.score[homeId] = Math.max(0, M.score[homeId] - 1); else M.score[awayId] = Math.max(0, M.score[awayId] - 1);
        out.push({ type: 'goal_cancelled', minute: min, second: 0, teamId: home ? homeId : awayId, sourceId: `${SIM_PREFIX}cancel|${min}`, ts: tsOf(min), payload: { ofSourceId: entry[0] } });
        console.log(`  [${M.match.equipoLocal.name.slice(0,3).toUpperCase()}] ↩️ Gol anulado (VAR) min ${min}`);
      }
    }
    return out;
  }

  await connectDB();
  // min 0
  for (const M of MS) for (const ev of eventsAtMinute(M, 0)) insert(M, ev);
  await flush();
  console.log(`Sembrados ${MS.length} partidos: ${MS.map(M => `${M.match.equipoLocal.name}-${M.match.equipoVisitante.name}`).join(', ')}`);
  console.log(`Kickoff ${new Date(kickoffMs).toISOString()} · minutos ${minutes.join(',')} cada ${tickSecs}s`);

  if (username) {
    const user = await User.findOne({ username });
    if (user) {
      const ids = new Set(MS.flatMap(M => M.starters.map(p => p.id)));
      const mine = (user.squad || []).filter(p => ids.has(p.id));
      console.log(`Jugadores de ${username} implicados: ${[...new Set(mine.map(p => p.nombre))].join(', ') || '(ninguno)'}`);
    } else console.log(`Usuario ${username} no encontrado (ignorado).`);
  }
  if (dry) { console.log('--dry: solo min 0.'); process.exit(0); }

  for (const min of minutes) {
    if (min === 0) continue;
    await sleep(tickSecs * 1000);
    for (const M of MS) for (const ev of eventsAtMinute(M, min)) insert(M, ev);
    const n = await flush();
    const board = MS.map(M => `${M.match.equipoLocal.name.slice(0,3).toUpperCase()} ${M.score[M.homeId]}-${M.score[M.awayId]} ${M.match.equipoVisitante.name.slice(0,3).toUpperCase()}`).join(' | ');
    console.log(`[min ${min}] +${n} · ${board}`);
  }

  console.log(`\nSimulación completa (${MS.length} partidos). Abre Resultados → 🔴 Live.`);
  console.log(`Para borrar: node --env-file=.env scripts/simulateLiveEvents.js --events ${ids.join(',')} --clean-only`);
  if (clean) {
    const r = await LiveEvent.deleteMany(cleanFilter);
    console.log(`--clean: borrados ${r.deletedCount} eventos sim.`);
  }
  process.exit(0);
}

function expireAtOfDay(nowMs) { return expireAtEndOfDayUTC(nowMs); }

main().catch(e => { console.error(e); process.exit(1); });
