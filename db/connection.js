import mongoose from 'mongoose';

let connected = false;

export async function connectDB() {
  if (connected) return;

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    connected = true;
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

export function disconnectDB() {
  if (!connected) return;
  mongoose.disconnect();
  connected = false;
}
