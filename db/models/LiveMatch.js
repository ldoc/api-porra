import mongoose from 'mongoose';

const liveMatchSchema = new mongoose.Schema({
  eventId: { type: Number, required: true, unique: true, index: true },
  stats: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['LIVE', 'HT', 'FT'], default: 'LIVE' },
  lastUpdated: { type: Date, default: Date.now, index: -1 },
  expireAt: { type: Date, required: true, index: true }
}, { collection: 'livematches', timestamps: false });

liveMatchSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const LiveMatch = mongoose.model('LiveMatch', liveMatchSchema);

export default LiveMatch;
