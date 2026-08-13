import dotenv from 'dotenv';
dotenv.config();
import { connectDB, disconnectDB, User } from '../db/index.js';

// Uso: node scripts/resetUsersConfirm.js [usuario1] [usuario2] ...
// Sin argumentos, resetea por defecto a leandro, marmoto y daniel.
const DEFAULTS = ['leandro'];
const USERNAMES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULTS;

await connectDB();

for (const username of USERNAMES) {
  const user = await User.findOne({ username });
  if (!user) {
    console.error(`Usuario "${username}" no encontrado`);
    continue;
  }
  console.log(`ANTES ${username}: predictionsConfirmed=${user.predictionsConfirmed}, finalPredictions=${user.finalPredictions ? 'SET' : 'null'}`);
  user.predictionsConfirmed = false;
  user.finalPredictions = null;
  await user.save();
  console.log(`DESPUES ${username}: predictionsConfirmed=${user.predictionsConfirmed}, finalPredictions=${user.finalPredictions}`);
}

await disconnectDB();
process.exit(0);
