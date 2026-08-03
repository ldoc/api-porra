import dotenv from 'dotenv';
dotenv.config();
import { connectDB, User, Invitation } from '../db/index.js';
import { leerFichero } from '../github.js';

async function migrate() {
  await connectDB();
  
  console.log('Migrando invitaciones...');
  const invitationsData = await leerFichero('data/users/_invitations.json');
  
  if (!invitationsData || Object.keys(invitationsData).length === 0) {
    console.log('No hay invitaciones en GitHub');
    return;
  }

  for (const [code, username] of Object.entries(invitationsData)) {
    const existing = await Invitation.findOne({ code });
    if (!existing) {
      await Invitation.create({
        code,
        usedBy: username,
        createdAt: new Date()
      });
      console.log(`  Invitación ${code} → ${username || '(sin usar)'}`);
    }
  }

  console.log('\nMigrando usuarios...');
  for (const [code, username] of Object.entries(invitationsData)) {
    if (!username) continue;

    const userData = await leerFichero(`data/users/${username}.json`);
    if (!userData) {
      console.log(`  No se pudo leer ${username}, saltando...`);
      continue;
    }

    const existing = await User.findOne({ username });
    if (existing) {
      existing.clave = userData.clave || code;
      existing.passwordHash = userData.passwordHash;
      existing.avatar = userData.avatar || null;
      existing.squad = userData.squad || [];
      existing.predictions = userData.predictions || null;
      existing.createdAt = userData.createdAt ? new Date(userData.createdAt) : existing.createdAt;
      await existing.save();
      console.log(`  ${username} actualizado ✓`);
    } else {
      await User.create({
        clave: userData.clave || code,
        username: userData.username || username,
        passwordHash: userData.passwordHash,
        avatar: userData.avatar || null,
        squad: userData.squad || [],
        predictions: userData.predictions || null,
        createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date()
      });
      console.log(`  ${username} migrado ✓`);
    }
  }

  const userCount = await User.countDocuments();
  const invCount = await Invitation.countDocuments();
  console.log(`\nMigración completada: ${userCount} usuarios, ${invCount} invitaciones`);
  
  process.exit(0);
}

migrate().catch(err => {
  console.error('Error en migración:', err);
  process.exit(1);
});
