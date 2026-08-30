#!/usr/bin/env node
import mongoose from 'mongoose';
import { writeFileSync, mkdirSync } from 'fs';
import { config } from 'dotenv';
config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI no definida en .env');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').split('.')[0];
const backupDir = `data/backups/${timestamp}`;
mkdirSync(backupDir, { recursive: true });

console.log(`Backup MongoDB → ${backupDir}`);

await mongoose.connect(uri);

const collections = await mongoose.connection.db.listCollections().toArray();
let totalDocs = 0;

for (const { name } of collections) {
  const docs = await mongoose.connection.db.collection(name).find().toArray();
  const filePath = `${backupDir}/${name}.json`;
  writeFileSync(filePath, JSON.stringify(docs, null, 2));
  console.log(`  ${name}: ${docs.length} documentos`);
  totalDocs += docs.length;
}

await mongoose.disconnect();
console.log(`Backup completado: ${totalDocs} documentos en ${collections.length} colecciones`);
