#!/usr/bin/env node
/**
 * simulateLiveEvents.js — Simulador de directo para el Live v2 (colección `liveevents`).
 *
 * Inserta eventos de un partido en la colección `liveevents` por ticks (como haría
 * el scraper real), para poder validar la pantalla Live: clasificación que se mueve,
 * animación, feed y reproductor temporal. NO toca pronósticos ni plantillas: usa los
 * usuarios y partidos que ya existen en la DB.
 *
 * Uso:
 *   node --env-file=.env scripts/simulateLiveEvents.js --event 16938768
 *   node --env-file=.env scripts/simulateLiveEvents.js --event 16938768 --tick 15 --user leandro
 *   node --env-file=.env scripts/simulateLiveEvents.js --event 16938768 --goals 3:H,75:A --var 62 --penalty 40
 *   node --env-file=.env scripts/simulateLiveEvents.js --event 16938768 --clean-only   # borra sim y sale
 *
 * Flags:
 *   --event <id>        eventId del calendario (por defecto 16938768)
 *   --user <username>   opcional: solo lista tus jugadores implicados (no modifica nada suyo)
 *   --tick <segundos>   pausa entre minutos simulados (por defecto 20)
 *   --minutes <a,b,c>   minutos a simular (por defecto 0,3,15,30,45,46,60,75,90)
 *   --goals <m:H,m:A>   goles por minuto y lado (por defecto 3:H,15:A,75:A)
 *   --var <min>         emite un gol anulado (VAR) en ese minuto (opcional)
 *   --penalty <min>     emite una parada de penalti en ese minuto (opcional)
 *   --clean             al terminar (o Ctrl+C) borra solo los eventos sim|* del partido
 *   --clean-only        borra los eventos sim|* del partido y sale
 *   --dry               solo siembra min 0 (lineup + kickoff) y sale
 *
 * Nota: `ts` se ancla al kickoff (hora de arranque) + minuto (con +15' de descanso
 * tras el 45'), y `ingestedAt` = ahora, para que el delta del front los recoja al vuelo.
 * El reloj "en vivo" del front avanza con el tiempo real; usa el reproductor para
 * recorrer los minutos del partido.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, User, LiveEvent } from '../db/index.js';
import { expireAtEndOfDayUTC } from '../api/liveEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function readDataJson(name) {
  const candidates = [
    path.join(__dirname, '../data/sofascore', name),
    path.join('/home/ldoc/Proyectos/api-porra/data/sofascore', name)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  throw new Error(`No encontrado ${name} en ${candidates.join(' / ')}`);
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  if (['clean', 'dry', 'clean-only'].includes(name)) return true;
  return process.argv[i + 1] ?? def;
}

const SIM_PREFIX = 'sim|';

function pickPlayers(equipoId, allPlayers) {
  const pool = allPlayers.filter(p => p.equipo === equipoId);
  const by = (pos, n) => pool.filter(p => p.posicion === pos).slice(0, n);
  return [...by('G', 1), ...by('D', 2), ...by('M', 3), ...by('F', 3)];
}

async function main() {
  const eventId = Number(arg('event', 16938768));
  const username = arg('user', null);
  const tickSecs = Number(arg('tick', 20));
  const minutesArg = String(arg('minutes', '0,3,15,30,45,46,60,75,90'));
  const goalsArg = String(arg('goals', '3:H,15:A,75:A'));
  const varMin = arg('var', null) != null ? Number(arg('var', null)) : null;
  const penaltyMin = arg('penalty', null) != null ? Number(arg('penalty', null)) : null;
  const clean = !!arg('clean', false);
  const cleanOnly = !!arg('clean-only', false);
  const dry = !!arg('dry', false);

  const calendar = readDataJson('calendar.json');
  const allPlayers = readDataJson('jugadores.json');

  await connectDB();

  if (cleanOnly) {
    const r = await LiveEvent.deleteMany({ eventId, sourceId: { $regex: `^${SIM_PREFIX.replace('|', '\\|')}` } });
    console.log(`Borrados ${r.deletedCount} eventos sim del partido ${eventId}.`);
    process.exit(0);
  }

  const match = calendar.find(m => m.id === eventId);
  if (!match) { console.error(`Partido ${eventId} no encontrado en calendar.json`); process.exit(1); }
  const homeId = match.equipoLocal.id;
  const awayId = match.equipoVisitante.id;

  const homeSquad = pickPlayers(homeId, allPlayers);
  const awaySquad = pickPlayers(awayId, allPlayers);
  const starters = [...homeSquad, ...awaySquad];

  const goals = {};
  for (const g of goalsArg.split(',').map(s => s.trim()).filter(Boolean)) {
    const [m, side] = g.split(':');
    goals[Number(m)] = side.toUpperCase();
  }
  const minutes = [...new Set(minutesArg.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n)))].sort((a, b) => a - b);

  const kickoffMs = Date.now();
  const expireAt = expireAtEndOfDayUTC(Date.now());
  // ts = kickoff + minuto (+15' de descanso si minuto > 45), como el backend real.
  const tsOf = (minute) => new Date(kickoffMs + (minute + (minute > 45 ? 15 : 0)) * 60000);
  const tsStatus = (kind) => new Date(kickoffMs + ({ live1: 0, ht: 45, live2: 60, ft: 105 }[kind]) * 60000);

  const lead = (role) => (squad) => {
    if (role === 'F') return squad.find(p => p.posicion === 'F') || squad[0];
    if (role === 'M') return squad.find(p => p.posicion === 'M') || squad[0];
    if (role === 'G') return squad.find(p => p.posicion === 'G') || squad[0];
    return squad[0];
  };

  const score = { [homeId]: 0, [awayId]: 0 };
  const goalsSeen = {}; // sourceId -> {home} para poder anular

  const bulk = [];
  const insert = (ev) => bulk.push({ createdAt: new Date(), ...ev, eventId, expireAt, ingestedAt: new Date() });

  async function flush() {
    if (!bulk.length) return 0;
    const batch = bulk.splice(0, bulk.length);
    try {
      await LiveEvent.insertMany(batch, { ordered: false });
    } catch (e) {
      if (e.code !== 11000 && !Array.isArray(e.writeErrors)) throw e;
    }
    return batch.length;
  }

  // min 0: lineup + kickoff
  insert({ type: 'lineup', minute: 0, second: 0, teamId: null, playerId: null,
    sourceId: `${SIM_PREFIX}lineup`, payload: { starters: starters.map(p => p.id) }, ts: tsStatus('live1') });
  insert({ type: 'status', minute: 0, second: 0, sourceId: `${SIM_PREFIX}status|LIVE|period1`,
    payload: { status: 'LIVE', period: 'period1' }, ts: tsStatus('live1') });
  await flush();
  console.log(`Sembrado ${match.equipoLocal.name} - ${match.equipoVisitante.name} (${eventId}). Kickoff ${new Date(kickoffMs).toISOString()}`);
  console.log(`liveRefreshSecs del front controla el polling; simularé minutos: ${minutes.join(', ')} cada ${tickSecs}s`);

  let user = null;
  if (username) {
    user = await User.findOne({ username });
    if (user) {
      const ids = new Set(starters.map(String));
      const mine = (user.squad || []).filter(p => ids.has(String(p.id)));
      console.log(`Jugadores de ${username} implicados: ${[...new Set(mine.map(p => p.nombre))].join(', ') || '(ninguno)'}`);
    } else {
      console.log(`Usuario ${username} no encontrado (ignorado).`);
    }
  }

  if (dry) { console.log('--dry: solo min 0 sembrado.'); process.exit(0); }

  let assistCount = { [homeId]: {}, [awayId]: {} };

  for (const min of minutes) {
    if (min === 0) continue;
    await sleep(tickSecs * 1000);

    const events = [];

    // Goles
    const side = goals[min];
    if (side) {
      const teamId = side === 'H' ? homeId : awayId;
      const squad = side === 'H' ? homeSquad : awaySquad;
      const scorer = lead('F')(squad);
      const assister = lead('M')(squad);
      score[teamId] += 1;
      const goalSource = `${SIM_PREFIX}goal|${min}`;
      goalsSeen[goalSource] = { home: side === 'H' };
      events.push({ type: 'goal', minute: min, second: 0, teamId, playerId: scorer?.id ?? null,
        sourceId: goalSource, ts: tsOf(min),
        payload: { scorerId: scorer?.id ?? null, isPenalty: false, isOwnGoal: false, isHome: side === 'H',
                   scoreHome: score[homeId], scoreAway: score[awayId] } });
      if (assister) {
        const c = (assistCount[teamId][assister.id] || 0) + 1;
        assistCount[teamId][assister.id] = c;
        events.push({ type: 'assist', minute: min, second: 0, teamId, playerId: assister.id,
          sourceId: `${SIM_PREFIX}assist|${assister.id}|${c}`, ts: tsOf(min), payload: { asistencias: c } });
      }
      console.log(`  ⚽ Gol min ${min}: ${side === 'H' ? match.equipoLocal.name : match.equipoVisitante.name} (${scorer?.nombre ?? '?'})${assister ? ` · asist ${assister.nombre}` : ''}`);
    }

    // Cambio de nota de un par de jugadores
    for (const squad of [homeSquad, awaySquad]) {
      const p = lead('M')(squad);
      if (!p) continue;
      const rating = +(6 + Math.min(3, min / 30)).toFixed(1);
      events.push({ type: 'rating', minute: min, second: 0, teamId: p.equipo, playerId: p.id,
        sourceId: `${SIM_PREFIX}rating|${p.id}|${rating}`, ts: tsOf(min), payload: { rating } });
    }

    // Gol anulado (VAR) opcional
    if (varMin === min) {
      const anyGoal = Object.entries(goalsSeen).find(([sid, g]) => g && !g.cancelled);
      if (anyGoal) {
        anyGoal[1].cancelled = true;
        const home = anyGoal[1].home;
        if (home) score[homeId] = Math.max(0, score[homeId] - 1); else score[awayId] = Math.max(0, score[awayId] - 1);
        events.push({ type: 'goal_cancelled', minute: min, second: 0, teamId: home ? homeId : awayId,
          sourceId: `${SIM_PREFIX}cancel|${min}`, ts: tsOf(min), payload: { ofSourceId: anyGoal[0] } });
        console.log(`  ↩️ Gol anulado (VAR) min ${min}`);
      }
    }

    // Penalti parado opcional
    if (penaltyMin === min) {
      const gk = lead('G')(homeSquad);
      events.push({ type: 'penalty_saved', minute: min, second: 0, teamId: homeId, playerId: gk?.id ?? null,
        sourceId: `${SIM_PREFIX}penalty|${min}`, ts: tsOf(min), payload: { keeperId: gk?.id ?? null, takerId: null } });
      console.log(`  🧤 Penalti parado min ${min} (${gk?.nombre ?? '?'})`);
    }

    // Descanso / 2ª parte
    if (min === 45) {
      events.push({ type: 'status', minute: 45, second: 0, sourceId: `${SIM_PREFIX}status|HT|halftime`,
        payload: { status: 'HT', period: 'halftime' }, ts: tsStatus('ht') });
      console.log('  ⏸ Descanso');
    }
    if (min === 46) {
      events.push({ type: 'status', minute: 45, second: 0, sourceId: `${SIM_PREFIX}status|LIVE|period2`,
        payload: { status: 'LIVE', period: 'period2' }, ts: tsStatus('live2') });
      console.log('  ▶️ 2ª parte');
    }

    // Final
    if (min >= 90) {
      events.push({ type: 'status', minute: 90, second: 0, sourceId: `${SIM_PREFIX}status|FT`,
        payload: { status: 'FT', period: null }, ts: tsStatus('ft') });
      const ratings = {};
      for (const p of starters) ratings[p.id] = +(6 + Math.random() * 3).toFixed(1);
      events.push({ type: 'match_final', minute: 90, second: 0, sourceId: `${SIM_PREFIX}final`,
        ts: tsStatus('ft'),
        payload: { scoreHome: score[homeId], scoreAway: score[awayId], ratings, minutes: {} } });
      console.log('  🏁 Final');
    }

    for (const ev of events) insert(ev);
    const n = await flush();
    console.log(`  [min ${min}] +${n} eventos · marcador ${score[homeId]}-${score[awayId]} · total sim ${await LiveEvent.countDocuments({ eventId, sourceId: { $regex: `^${SIM_PREFIX.replace('|', '\\|')}` } })}`);
  }

  console.log('\nSimulación completa. Ve a la pantalla Live (Resultados → 🔴 Live) y prueba el reproductor.');
  console.log(`Para borrar los eventos simulados: node --env-file=.env scripts/simulateLiveEvents.js --event ${eventId} --clean-only`);
  if (clean) {
    const r = await LiveEvent.deleteMany({ eventId, sourceId: { $regex: `^${SIM_PREFIX.replace('|', '\\|')}` } });
    console.log(`\n--clean: borrados ${r.deletedCount} eventos sim.`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
