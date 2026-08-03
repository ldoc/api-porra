import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  clave: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: null
  },
  squad: {
    type: [{
      id: Number,
      nombre: String,
      posicion: String,
      club: String,
      equipo: Number,
      extension: String
    }],
    default: []
  },
  predictions: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', userSchema);

export default User;
