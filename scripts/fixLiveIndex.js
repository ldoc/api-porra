#!/usr/bin/env node
/**
 * fixLiveIndex.js — Migra el índice TTL de `livematches`.
 *
 * Elimina el índice `expireAt_1` SIN TTL (si existe) y lo recrea con
 * `expireAfterSeconds: 0` a partir del schema. Solo modifica índices:
 * NO borra documentos.
 *
 * Uso:
 *   node --env-file=.env scripts/fixLiveIndex.js --db prod
 *   node --env-file=.env scripts/fixLiveIndex.js --db test
 *
 * La URI se deriva de `MONGODB_URI` reemplazando el nombre de la base de datos.
 */
import mongoose from 'mongoose';
import LiveMatch from '../db/models/LiveMatch.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
}

function withDb(uri, db) {
  const q = uri.indexOf('?');
  const base = q >= 0 ? uri.slice(0, q) : uri;
  const query = q >= 0 ? uri.slice(q) : '';
  const slash = base.lastIndexOf('/');
  return base.slice(0, slash + 1) + db + query;
}

const db = arg('db', 'test');
const uriRaw = process.env.MONGODB_URI;
if (!uriRaw) {
  console.error('Falta MONGODB_URI. Usa: node --env-file=.env scripts/fixLiveIndex.js --db <test|prod>');
  process.exit(1);
}
if (!['test', 'prod'].includes(db)) {
  console.error(`Base no permitida: "${db}". Usa --db test o --db prod.`);
  process.exit(1);
}

const uri = withDb(uriRaw, db);
console.log(`Base de datos objetivo: ${db}`);
if (db === 'prod') console.log('AVISO: se van a modificar ÍNDICES en PRODUCCIÓN (no se borran datos).');

await mongoose.connect(uri);
const coll = mongoose.connection.db.collection('livematches');

const brief = (idx) => idx.map(i => ({ name: i.name, key: i.key, ttl: i.expireAfterSeconds }));
const before = await coll.indexes();
console.log('Índices ANTES:', JSON.stringify(brief(before)));

const existing = before.find(i => i.name === 'expireAt_1');
if (existing && existing.expireAfterSeconds === undefined) {
  await coll.dropIndex('expireAt_1');
  console.log('drop expireAt_1 (sin TTL): ok');
} else if (existing) {
  console.log('expireAt_1 ya tiene TTL; no hace falta drop');
} else {
  console.log('expireAt_1 no existe; se creará');
}

await LiveMatch.syncIndexes();

const after = await coll.indexes();
console.log('Índices DESPUÉS:', JSON.stringify(brief(after)));

const ttl = after.find(i => i.name === 'expireAt_1');
if (ttl && ttl.expireAfterSeconds === 0) {
  console.log('OK: TTL activo (expireAfterSeconds=0)');
} else {
  console.error('FALLO: expireAt_1 no quedó con TTL');
  process.exitCode = 1;
}

await mongoose.disconnect();
