#!/usr/bin/env node
import mongoose from 'mongoose';
import { readFileSync, readdirSync } from 'fs';
import { config } from 'dotenv';
config();

const backupDir = process.argv[2];
const dbName = process.argv[3];
if (!backupDir) {
  console.error('Uso: node scripts/restoreDB.js <directorio-backup> [nombre-db]');
  console.error('Ejemplo: node scripts/restoreDB.js data/backups/2026_08_30_14_27_56');
  console.error('         node scripts/restoreDB.js data/backups/2026_08_30_14_27_56 mi_db_test');
  process.exit(1);
}

const files = readdirSync(backupDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.error(`No se encontraron archivos JSON en ${backupDir}`);
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
console.log(`Restaurando backup desde ${backupDir}`);
if (dbName) console.log(`Base de datos destino: ${dbName}`);

await mongoose.connect(uri, dbName ? { dbName } : {});

// JSON.stringify convierte ObjectId a string de 24 hex. Al restaurar hay que
// devolverlos a ObjectId, si no Mongoose no encuentra los documentos al guardar
// (DocumentNotFoundError por _id con tipo incorrecto).
function restoreIds(value) {
  if (Array.isArray(value)) {
    return value.map(restoreIds);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === '_id' && typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) {
        out[key] = new mongoose.Types.ObjectId(val);
      } else {
        out[key] = restoreIds(val);
      }
    }
    return out;
  }
  return value;
}

// JSON.stringify convierte Date a string ISO. Como el restore usa insertMany
// crudo (sin Mongoose, sin casteo), hay que devolver los campos Date a Date;
// si no, los .toISOString() de server.js revientan (500 'Error al obtener
// estadísticas', etc.). Solo campos Date conocidos por colección:
// fechaInicio/fechaFin de messages son String y NO se tocan.
const DATE_FIELDS = {
  matchstats: ['lastUpdated'],
  messages: ['createdAt'],
  invitations: ['createdAt'],
  users: ['createdAt'],
  gameconfigs: ['updatedAt']
};

function restoreDates(collectionName, doc) {
  for (const field of DATE_FIELDS[collectionName] || []) {
    if (typeof doc[field] === 'string') {
      const dt = new Date(doc[field]);
      if (!isNaN(dt)) doc[field] = dt;
    }
  }
  return doc;
}

let totalDocs = 0;

for (const file of files) {
  const collectionName = file.replace('.json', '');
  const docs = JSON.parse(readFileSync(`${backupDir}/${file}`, 'utf8')).map(restoreIds).map(d => restoreDates(collectionName, d));

  if (docs.length === 0) {
    console.log(`  ${collectionName}: vacío, saltando`);
    continue;
  }

  const collection = mongoose.connection.db.collection(collectionName);
  await collection.deleteMany({});
  await collection.insertMany(docs);

  console.log(`  ${collectionName}: ${docs.length} documentos restaurados`);
  totalDocs += docs.length;
}

await mongoose.disconnect();
console.log(`Restauración completada: ${totalDocs} documentos`);
