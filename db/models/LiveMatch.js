import mongoose from 'mongoose';

const liveMatchSchema = new mongoose.Schema({
  eventId: { type: Number, required: true, unique: true, index: true },
  estado: { type: String, required: true, enum: ['live', 'descanso', 'finalizado'], default: 'live' },
  minuto: { type: Number, default: 0 },
  homeTeamId: { type: Number, required: true },
  awayTeamId: { type: Number, required: true },
  homeGoles: { type: Number, required: true },
  awayGoles: { type: Number, required: true },
  stats: { type: mongoose.Schema.Types.Mixed, required: true },
  incidents: { type: [new mongoose.Schema({ key: String, tipo: { type: String, enum: ['sub', 'card'] }, minuto: Number, teamId: Number, playerId: Number, playerName: String }, { _id: false })], default: [] },
  scrapedAt: { type: Date, default: Date.now, index: -1 },
  finishedAt: { type: Date, default: null }
});

const LiveMatch = mongoose.model('LiveMatch', liveMatchSchema, 'livematchs');

export default LiveMatch;
