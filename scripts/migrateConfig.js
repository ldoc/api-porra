import dotenv from 'dotenv';
dotenv.config();
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import GameConfig from '../db/models/GameConfig.js';
import User from '../db/models/User.js';
import { connectDB } from '../db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  await connectDB();

  console.log('Leyendo config.json del backup local...');
  let configData;
  try {
    const raw = await readFile(join(__dirname, '..', 'config.json.backup'), 'utf-8');
    configData = JSON.parse(raw);
  } catch (err) {
    console.error('No se pudo leer config.json.backup:', err.message);
    process.exit(1);
  }
  console.log('Config.json leído:', configData);

  const existingConfig = await GameConfig.findById('gameConfig');

  if (existingConfig) {
    console.log('Ya existe configuración en MongoDB, saltando migración de config');
    console.log('Configuración actual:', existingConfig);
  } else {
    const newConfig = await GameConfig.create({
      _id: 'gameConfig',
      faseJuego: 'FASE_PRETEMPORADA',
      tournament: {
        totalMatches: configData.totalMatches || 144,
        squadSize: configData.squadSize || 25,
        squadFormation: configData.squadFormation || { G: 3, D: 8, M: 8, F: 6 }
      },
      updatedBy: 'system',
      updatedAt: new Date()
    });
    console.log('Configuración migrada a MongoDB:', newConfig);
  }

  const adminUsername = process.env.ADMIN_USERNAME;
  if (adminUsername) {
    const result = await User.updateOne(
      { username: adminUsername },
      { $set: { isAdmin: true } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Usuario ${adminUsername} marcado como admin`);
    } else {
      console.log(`Usuario ${adminUsername} no encontrado en la base de datos`);
    }
  } else {
    console.log('No se proporcionó ADMIN_USERNAME, saltando designación de admin');
  }

  console.log('Migración completada exitosamente');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Error en migración:', err);
  process.exit(1);
});
