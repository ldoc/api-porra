#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db/index.js';
import LiveEvent from '../db/models/LiveEvent.js';

await connectDB();
try {
  await LiveEvent.syncIndexes();
  const idx = await mongoose.connection.db.collection('liveevents').indexes();
  console.log('Índices liveevents:', JSON.stringify(idx.map(i => i.name)));
} catch (e) {
  console.error('Error creando índices liveevents:', e.message);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close();
}
