import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getUser, saveUser, leerFichero, guardarFichero } from '../github.js';

const JWT_SECRET = process.env.JWT_SECRET || 'porra-ucl-secret-change-in-production';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const hashToVerify = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return hash === hashToVerify;
}

async function getInvitations() {
  try {
    return await leerFichero('data/users/_invitations.json');
  } catch (e) {
    return {};
  }
}

async function saveInvitations(invitations) {
  await guardarFichero(
    'data/users/_invitations.json',
    JSON.stringify(invitations, null, 2),
    'Update invitations index'
  );
}

export async function register(username, password, invitationCode) {
  if (!username || !password || !invitationCode) {
    return { ok: false, error: 'Usuario, contraseña y código de invitación son obligatorios' };
  }
  if (username.length < 3) {
    return { ok: false, error: 'El usuario debe tener al menos 3 caracteres' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres' };
  }

  const clave = invitationCode.toUpperCase().trim();

  const existingUser = await getUser(username.toLowerCase());
  if (existingUser) {
    return { ok: false, error: 'El nombre de usuario ya existe' };
  }

  const invitations = await getInvitations();
  if (!(clave in invitations)) {
    return { ok: false, error: 'Código de invitación inválido' };
  }
  if (invitations[clave] !== null) {
    return { ok: false, error: 'Este código de invitación ya ha sido utilizado' };
  }

  const passwordHash = hashPassword(password);

  await saveUser(username.toLowerCase(), {
    clave,
    username: username.toLowerCase(),
    passwordHash,
    createdAt: new Date().toISOString()
  });

  invitations[clave] = username.toLowerCase();
  await saveInvitations(invitations);

  const token = jwt.sign(
    { username: username.toLowerCase() },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    ok: true,
    token,
    user: { username: username.toLowerCase() }
  };
}

export async function login(username, password) {
  if (!username || !password) {
    return { ok: false, error: 'Usuario y contraseña son obligatorios' };
  }

  const user = await getUser(username.toLowerCase());
  if (!user || !user.passwordHash) {
    return { ok: false, error: 'Credenciales incorrectas' };
  }

  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return { ok: false, error: 'Credenciales incorrectas' };
  }

  const token = jwt.sign(
    { username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    ok: true,
    token,
    user: {
      username: user.username,
      avatar: user.avatar || null
    }
  };
}

export async function getProfile(username) {
  if (!username) {
    return { ok: false, error: 'Usuario requerido' };
  }

  const user = await getUser(username.toLowerCase());
  if (!user) {
    return { ok: false, error: 'Usuario no encontrado' };
  }

  return {
    ok: true,
    avatar: user.avatar || null
  };
}

export async function getTakenAvatars() {
  const invitations = await getInvitations();
  const taken = [];

  for (const [clave, username] of Object.entries(invitations)) {
    if (!username) continue;
    try {
      const user = await getUser(username);
      if (user && user.avatar) {
        taken.push(user.avatar);
      }
    } catch (e) {
      // skip broken user files
    }
  }

  return taken;
}

export async function getAllPlayers() {
  const invitations = await getInvitations();
  const players = [];

  for (const [clave, username] of Object.entries(invitations)) {
    if (!username) continue;
    try {
      const user = await getUser(username);
      if (user && user.username) {
        players.push({
          name: user.username,
          avatar: user.avatar || null,
          points: user.points || 0,
          hits: user.hits || 0,
        });
      }
    } catch (e) {
      // skip broken user files
    }
  }

  return players;
}

export async function saveProfile(username, profileData) {
  if (!username) {
    return { ok: false, error: 'Usuario requerido' };
  }

  const user = await getUser(username.toLowerCase());
  if (!user) {
    return { ok: false, error: 'Usuario no encontrado' };
  }

  const updatedUser = {
    ...user,
    avatar: profileData.avatar || user.avatar
  };

  await saveUser(username.toLowerCase(), updatedUser);

  return {
    ok: true,
    avatar: updatedUser.avatar
  };
}
