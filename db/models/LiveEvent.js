import mongoose from 'mongoose';

const liveEventSchema = new mongoose.Schema({
  eventId: { type: Number, required: true },
  ingestedAt: { type: Date, required: true, index: true },
  ts: { type: Date, required: true, index: true },
  minute: { type: Number, default: null },
  second: { type: Number, default: 0 },
  type: { type: String, required: true },
  teamId: { type: Number, default: null },
  playerId: { type: Number, default: null },
  sourceId: { type: String, required: true },
  seq: { type: Number, default: 0 },
  source: { type: String, default: 'scraper', index: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  expireAt: { type: Date, required: true }
}, { collection: 'liveevents', timestamps: false });

liveEventSchema.index({ eventId: 1, sourceId: 1 }, { unique: true });
liveEventSchema.index({ eventId: 1, ts: 1 });
liveEventSchema.index({ source: 1, ingestedAt: 1 });
liveEventSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const LiveEvent = mongoose.model('LiveEvent', liveEventSchema);

export default LiveEvent;
