import mongoose from 'mongoose';

const gameConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'gameConfig' },
  faseJuego: {
    type: String,
    default: 'FASE_PRETEMPORADA'
  },
  tournament: {
    totalMatches: { type: Number, default: 144 },
    squadSize: { type: Number, default: 25 },
    squadFormation: {
      G: { type: Number, default: 3 },
      D: { type: Number, default: 8 },
      M: { type: Number, default: 8 },
      F: { type: Number, default: 6 }
    }
  },
  fasesFechas: { type: Object, default: {} },
  maintenance: {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: 'Web en mantenimiento. Volvemos pronto.' }
  },
  updatedBy: { type: String },
  updatedAt: { type: Date }
}, {
  collection: 'gameconfigs',
  timestamps: false
});

const GameConfig = mongoose.model('GameConfig', gameConfigSchema);

export default GameConfig;
