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

let totalDocs = 0;

for (const file of files) {
  const collectionName = file.replace('.json', '');
  const docs = JSON.parse(readFileSync(`${backupDir}/${file}`, 'utf8'));
  
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
