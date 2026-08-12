import dotenv from 'dotenv';
dotenv.config();
import { readFileSync } from 'fs';
import { connectDB, disconnectDB, User } from '../db/index.js';

const USERNAME = 'leandro';
const NUM_PREDICTIONS = 143;

function randomScore() {
  return Math.floor(Math.random() * 5);
}

await connectDB();

const calendar = JSON.parse(readFileSync('./data/sofascore/calendar.json', 'utf8'));

// Ordenar igual que la app: por ronda y luego por fecha
const liga = calendar
  .filter(m => m.fase === 'liga')
  .sort((a, b) => a.ronda - b.ronda || a.fecha - b.fecha);

const target = liga.slice(0, NUM_PREDICTIONS);
const predictions = {};
for (const m of target) {
  predictions[m.id] = { home: randomScore(), away: randomScore() };
}

const user = await User.findOne({ username: USERNAME });
if (!user) {
  console.error(`Usuario "${USERNAME}" no encontrado`);
  process.exit(1);
}

user.predictions = { ...(user.predictions || {}), ...predictions };
await user.save();

console.log(`Predicciones guardadas para ${USERNAME}: ${Object.keys(predictions).length}`);
console.log('Rondas cubiertas:', liga.slice(0, NUM_PREDICTIONS).reduce((a, m) => (a[m.ronda] = (a[m.ronda] || 0) + 1, a), {}));
console.log('Total predicciones del usuario:', Object.keys(user.predictions).length);

await disconnectDB();
process.exit(0);
