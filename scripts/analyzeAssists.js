#!/usr/bin/env node
import mongoose from 'mongoose';
import { config } from 'dotenv';
import MatchStats from '../db/models/MatchStats.js';

config();

async function main() {
  console.log(`Conectando a MongoDB...`);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`MongoDB conectado\n`);

  const allStats = await MatchStats.find({}, { eventId: 1, stats: 1 }).sort({ eventId: 1 });
  console.log(`Total partidos en MongoDB: ${allStats.length}\n`);

  const matchesWithAssists = [];
  const anomalies = [];
  let totalAssists = 0;
  let totalGoals = 0;

  for (const doc of allStats) {
    const stats = doc.stats;
    if (!stats?.jugadores) continue;

    const matchGoals = (stats[String(Object.keys(stats).find(k => k !== 'jugadores' && !isNaN(k)))]?.goles || 0)
      + (stats[String(Object.keys(stats).filter(k => k !== 'jugadores' && !isNaN(k))[1])]?.goles || 0);

    let matchAssists = 0;
    const playersWithAssists = [];

    for (const player of stats.jugadores) {
      const assists = player.asistencias || 0;
      if (assists > 0) {
        matchAssists += assists;
        playersWithAssists.push({
          nombre: player.nombre,
          posicion: player.posicion,
          asistencias: assists,
          goles: player.goles || 0,
          equipo: player.equipo
        });
      }
    }

    totalAssists += matchAssists;
    totalGoals += matchGoals;

    if (matchAssists > 0) {
      matchesWithAssists.push({
        eventId: doc.eventId,
        totalGoals: matchGoals,
        totalAssists: matchAssists,
        players: playersWithAssists
      });
    }

    if (matchAssists > matchGoals) {
      anomalies.push({
        eventId: doc.eventId,
        matchGoals,
        matchAssists,
        players: playersWithAssists
      });
    }
  }

  console.log(`=== RESUMEN DE ASISTENCIAS ===`);
  console.log(`Total goles en todos los partidos: ${totalGoals}`);
  console.log(`Total asistencias en todos los partidos: ${totalAssists}`);
  console.log(`Ratio asistencias/goles: ${totalGoals > 0 ? (totalAssists / totalGoals).toFixed(2) : 'N/A'}`);
  console.log(`\nPartidos con asistencias: ${matchesWithAssists.length} de ${allStats.length}`);

  if (anomalies.length > 0) {
    console.log(`\n=== ⚠️  ANOMALÍAS (más asistencias que goles) ===`);
    for (const a of anomalies) {
      console.log(`\n  Evento ${a.eventId}: ${a.matchAssists} asistencias > ${a.matchGoals} goles`);
      for (const p of a.players) {
        console.log(`    - ${p.nombre} (${p.posicion}): ${p.asistencias} asist(s), ${p.goles} gol(es)`);
      }
    }
  } else {
    console.log(`\n✅ No se encontraron anomalías (más asistencias que goles en ningún partido)`);
  }

  console.log(`\n=== PARTIDOS CON ASISTENCIAS ===`);
  for (const m of matchesWithAssists) {
    console.log(`\n  Evento ${m.eventId}: ${m.totalAssists} asist(s) en ${m.totalGoals} gol(es)`);
    for (const p of m.players) {
      console.log(`    - ${p.nombre} (${p.posicion}): ${p.asistencias} asist(s), ${p.goles} gol(es)`);
    }
  }

  await mongoose.disconnect();
}

main();
