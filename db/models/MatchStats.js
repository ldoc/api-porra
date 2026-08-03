import mongoose from 'mongoose';

const matchStatsSchema = new mongoose.Schema({
  eventId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  stats: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

const MatchStats = mongoose.model('MatchStats', matchStatsSchema);

export default MatchStats;