#!/usr/bin/env node
/**
 * seedLiveDemo.js — Demo local del tab Live.
 * Siembra 2 partidos en la colección temporal `livematches` y simula el
 * directo por ticks: goles tempranos (min 3 y 15), descanso y final.
 * Usa usuarios YA existentes en la DB de test (no crea ninguno).
 *
 * Uso:
 *   node --env-file=.env scripts/seedLiveDemo.js --user leandro
 *   node --env-file=.env scripts/seedLiveDemo.js --tick 10 --minutes 3,15,30,45,60,75,90 --refresh 15
 *   Flags: --user (opcional, solo para listar tus jugadores implicados),
 *          --clean (borra los docs demo al final), --dry (solo siembra minuto 0 y sale)
 *
 * No toca pronósticos ni plantillas: usa los que ya hay en test.
 * Al salir (fin o Ctrl+C) restaura liveRefreshSecs original.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, User, LiveMatch } from '../db/index.js';
import GameConfig from '../db/models/GameConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// El worktree puede no tener los JSON pesados (jugadores.json); fallback al checkout principal.
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
  if (name === 'clean' || name === 'dry') return true;
  return process.argv[i + 1] ?? def;
}

// Partidos demo: Real Madrid vs Inter y FC Porto vs Man City (ronda 1)
const DEMO_IDS = [16938768, 16938854];
// Goles por partido: [minuto, 'H'|'A']
const GOALS = { 16938768: [[3, 'H'], [75, 'A']], 16938854: [[15, 'A'], [55, 'H']] };

const calendar = readDataJson('calendar.json');
const allPlayers = readDataJson('jugadores.json');

function pickSquadPlayers(equipoId) {
  const pool = allPlayers.filter(p => p.equipo === equipoId);
  const by = (pos, n) => pool.filter(p => p.posicion === pos).slice(0, n);
  return [...by('G', 1), ...by('D', 2), ...by('M', 2), ...by('F', 2)];
}

function toLivePlayer(p, equipoId) {
  return {
    id: String(p.id), nombre: p.nombre, posicion: p.posicion, equipo: equipoId,
    puntos: 6.7, goles: 0, minutos: 1, paradas: p.posicion === 'G' ? 1 : 0,
    esSuplente: false, penaltiMarcado: 0, penaltiParado: 0, golesRecibidos: 0, asistencias: 0
  };
}

function statusFor(min) {
  if (min >= 90) return 'FT';
  if (min >= 45) return 'HT';
  return 'LIVE';
}

async function main() {
  const username = arg('user', null);
  const tickSecs = Number(arg('tick', 20));
  const minutes = String(arg('minutes', '3,15,30,45,60,75,90')).split(',').map(Number);
  const refreshSecs = Number(arg('refresh', 15));
  const clean = arg('clean', false);
  const dry = arg('dry', false);

  await connectDB();

  const matches = DEMO_IDS.map(id => calendar.find(m => m.id === id)).filter(Boolean);
  if (matches.length !== 2) { console.error('Partidos demo no encontrados en calendar.json'); process.exit(1); }

  // Usuario opcional: solo para listar sus jugadores implicados (no se modifica nada suyo)
  let mainUser = null;
  if (username) {
    mainUser = await User.findOne({ username });
    if (!mainUser) { console.error(`Usuario no encontrado: ${username}`); process.exit(1); }
  }

  // 1. liveRefreshSecs rápido (se restaura al salir)
  const cfg = await GameConfig.findById('gameConfig');
  const origRefresh = cfg?.liveRefreshSecs ?? 60;
  if (cfg) { cfg.liveRefreshSecs = refreshSecs; await cfg.save(); }
  console.log(`liveRefreshSecs: ${origRefresh} -> ${refreshSecs} (se restaura al salir)`);

  // 3. Estado inicial minuto 0
  const state = {};
  for (const m of matches) {
    const homeId = m.equipoLocal.id, awayId = m.equipoVisitante.id;
    state[m.id] = {
      match: m, minute: 0,
      goals: { [homeId]: 0, [awayId]: 0 },
      players: [...pickSquadPlayers(homeId), ...pickSquadPlayers(awayId)].map(p => toLivePlayer(p, p.equipo))
    };
  }

  async function persist(min) {
    for (const m of matches) {
      const s = state[m.id];
      const homeId = m.equipoLocal.id, awayId = m.equipoVisitante.id;
      const stats = {
        [homeId]: { goles: s.goals[homeId] },
        [awayId]: { goles: s.goals[awayId] },
        jugadores: s.players
      };
      await LiveMatch.findOneAndUpdate(
        { eventId: m.id },
        { eventId: m.id, stats, status: statusFor(min), lastUpdated: new Date(), expireAt: new Date(new Date().setUTCHours(23, 59, 59, 0)) },
        { upsert: true, returnDocument: 'after' }
      );
    }
  }

  function applyMinute(min) {
    for (const m of matches) {
      const s = state[m.id];
      s.minute = min;
      const homeId = m.equipoLocal.id, awayId = m.equipoVisitante.id;
      for (const [gmin, side] of (GOALS[m.id] || [])) {
        if (gmin !== min) continue;
        const teamId = side === 'H' ? homeId : awayId;
        const concededId = side === 'H' ? awayId : homeId;
        s.goals[teamId]++;
        const scorer = s.players.find(p => p.equipo === teamId && p.posicion === 'F');
        if (scorer) { scorer.goles++; scorer.puntos = +(scorer.puntos + 0.5).toFixed(1); }
        const asister = s.players.find(p => p.equipo === teamId && p.posicion === 'M');
        if (asister) { asister.asistencias++; asister.puntos = +(asister.puntos + 0.2).toFixed(1); }
        const keeper = s.players.find(p => p.equipo === concededId && p.posicion === 'G');
        if (keeper) { keeper.golesRecibidos++; keeper.puntos = +(keeper.puntos - 0.2).toFixed(1); }
        console.log(`  ⚽ ¡GOL min ${min}! ${teamId === homeId ? m.equipoLocal.name : m.equipoVisitante.name} (${scorer?.nombre ?? ''})`);
      }
      for (const p of s.players) {
        p.minutos = min;
        if (p.goles === 0) p.puntos = +(p.puntos + 0.05).toFixed(1);
      }
    }
  }

  function printLine(min) {
    const parts = matches.map(m => {
      const s = state[m.id];
      return `${m.equipoLocal.name} ${s.goals[m.equipoLocal.id]}-${s.goals[m.equipoVisitante.id]} ${m.equipoVisitante.name}`;
    });
    console.log(`[min ${min} · ${statusFor(min)}] ${parts.join('  |  ')}`);
  }

  let done = false;
  async function restore() {
    if (done) return;
    done = true;
    const c = await GameConfig.findById('gameConfig');
    if (c) { c.liveRefreshSecs = origRefresh; await c.save(); }
    if (clean) await LiveMatch.deleteMany({ eventId: { $in: matches.map(m => m.id) } });
    console.log(`\nRestaurado: liveRefreshSecs=${origRefresh}${clean ? ', docs demo borrados' : ''}. (Pronósticos y plantillas intactos)`);
  }
  process.on('SIGINT', async () => { await restore(); process.exit(0); });

  // Aviso de jugadores implicados (solo lectura)
  if (mainUser) {
    const mainSquadClubs = new Set((mainUser.squad || []).map(p => p.club));
    const involved = state[matches[0].id].players.concat(state[matches[1].id].players)
      .filter(p => mainSquadClubs.has(allPlayers.find(a => String(a.id) === p.id)?.club));
    console.log(`Jugadores de ${username} implicados: ${[...new Set(involved.map(p => p.nombre))].slice(0, 6).join(', ') || '(ninguno de su plantilla juega estos partidos)'}`);
  }

  await persist(0);
  printLine(0);
  if (dry) { await restore(); process.exit(0); }

  for (const min of minutes) {
    await sleep(tickSecs * 1000);
    applyMinute(min);
    await persist(min);
    printLine(min);
    if (min >= 90) break;
  }

  const lastMin = minutes[minutes.length - 1];
  console.log(lastMin >= 90
    ? '\nSimulación completa (FT). Pulsa Ctrl+C para restaurar, o espera 60s...'
    : `\nDemo parcial hasta min ${lastMin}. Pulsa Ctrl+C para restaurar, o espera 60s...`);
  await sleep(60000);
  await restore();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
