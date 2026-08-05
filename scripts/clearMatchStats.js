#!/usr/bin/env node
import mongoose from 'mongoose';
import MatchStats from '../db/models/MatchStats.js';
import { config } from 'dotenv';
config();

await mongoose.connect(process.env.MONGODB_URI);
const result = await MatchStats.deleteMany({});
console.log(`Eliminados ${result.deletedCount} documentos de matchStats`);
await mongoose.disconnect();
