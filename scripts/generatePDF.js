import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import { connectDB, disconnectDB, User } from '../db/index.js';
import { generatePDF } from '../api/pdf/generator.js';

dotenv.config();

const OUTPUT_PATH = process.env.PDF_OUTPUT_PATH || 'data/pronosticos_porra.pdf';

async function main() {
  console.log('=== Generador de PDF de Pronósticos ===\n');

  await connectDB();

  console.log('Cargando datos estáticos...');
  const calendar = JSON.parse(readFileSync('./data/sofascore/calendar.json', 'utf8'));
  const teamsData = JSON.parse(readFileSync('./data/sofascore/teams.json', 'utf8'));

  const teamsMap = {};
  for (const team of teamsData) {
    teamsMap[team.id] = team.name;
  }

  const matchesByRound = {};
  for (const match of calendar) {
    if (match.fase === 'liga') {
      if (!matchesByRound[match.ronda]) matchesByRound[match.ronda] = [];
      matchesByRound[match.ronda].push(match);
    }
  }

  console.log('Obteniendo jugadores con pronósticos confirmados...');
  const users = await User.find({ predictionsConfirmed: true }).lean();

  if (users.length === 0) {
    console.log('No hay jugadores con pronósticos confirmados.');
    await disconnectDB();
    process.exit(0);
  }

  console.log(`Encontrados ${users.length} jugadores.\n`);

  console.log('Generando PDF...');
  const pdfBuffer = await generatePDF(users, matchesByRound, teamsMap);

  writeFileSync(OUTPUT_PATH, pdfBuffer);
  console.log(`\nPDF guardado en: ${OUTPUT_PATH}`);
  console.log(`Tamaño: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

  await disconnectDB();
  console.log('\n¡Completado!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
