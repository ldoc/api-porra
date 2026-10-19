#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db/index.js';
import LiveEvent from '../db/models/LiveEvent.js';

await connectDB();
try {
  const duplicates = await mongoose.connection.db.collection('liveevents').aggregate([
    { $group: { _id: { eventId: '$eventId', sourceId: '$sourceId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]).toArray();

  if (duplicates.length) {
    console.error('ABORTADO: existen documentos duplicados por {eventId, sourceId} en liveevents.');
    for (const d of duplicates) {
      console.error(`  eventId=${d._id.eventId} sourceId=${d._id.sourceId} documentos=${d.count}`);
    }
    console.error('Elimina los duplicados y vuelve a ejecutar este script. No se han tocado los índices.');
    process.exitCode = 1;
  } else {
    await LiveEvent.syncIndexes();
    const idx = await mongoose.connection.db.collection('liveevents').indexes();
    console.log('Índices liveevents:', JSON.stringify(idx.map(i => i.name)));
  }
} catch (e) {
  if (e.code === 11000 || /E11000/.test(e.message)) {
    console.error('ABORTADO: no se pudo crear el índice único {eventId, sourceId} porque hay duplicados.');
    console.error('Elimina los duplicados y vuelve a ejecutar este script.');
  } else {
    console.error('Error creando índices liveevents:', e.message);
  }
  process.exitCode = 1;
} finally {
  await mongoose.connection.close();
}
