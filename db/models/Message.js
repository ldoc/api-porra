import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['noticia', 'aviso', 'felicitacion', 'resumen', 'mantenimiento']
  },
  fechaInicio: {
    type: String,
    default: null
  },
  fechaFin: {
    type: String,
    default: null
  },
  readBy: {
    type: [String],
    default: []
  },
  createdBy: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageSchema.index({ createdAt: -1, _id: -1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;