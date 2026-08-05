import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../db/index.js';
import { Invitation } from '../db/index.js';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido en las variables de entorno');
}
const JWT_SECRET = process.env.JWT_SECRET;

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

  const existingUser = await User.findOne({ username: username.toLowerCase() });
  if (existingUser) {
    return { ok: false, error: 'El nombre de usuario ya existe' };
  }

  const invitation = await Invitation.findOne({ code: clave });
  if (!invitation) {
    return { ok: false, error: 'Código de invitación inválido' };
  }
  if (invitation.usedBy !== null) {
    return { ok: false, error: 'Este código de invitación ya ha sido utilizado' };
  }

  const passwordHash = hashPassword(password);

  await User.create({
    clave,
    username: username.toLowerCase(),
    passwordHash,
    createdAt: new Date()
  });

  invitation.usedBy = username.toLowerCase();
  await invitation.save();

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

  const user = await User.findOne({ username: username.toLowerCase() });
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

  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) {
    return { ok: false, error: 'Usuario no encontrado' };
  }

  return {
    ok: true,
    avatar: user.avatar || null
  };
}

export async function getTakenAvatars() {
  const taken = await User.find({ avatar: { $ne: null } }).distinct('avatar');
  return taken;
}

export async function getAllPlayers() {
  const users = await User.find({}, 'username avatar points hits');
  return users.map(user => ({
    name: user.username,
    avatar: user.avatar || null,
    points: user.points || 0,
    hits: user.hits || 0,
  }));
}

export async function saveProfile(username, profileData) {
  if (!username) {
    return { ok: false, error: 'Usuario requerido' };
  }

  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) {
    return { ok: false, error: 'Usuario no encontrado' };
  }

  user.avatar = profileData.avatar || user.avatar;
  await user.save();

  return {
    ok: true,
    avatar: user.avatar
  };
}

export async function getSquad(username) {
  if (!username) {
    return { ok: false, error: 'Usuario requerido' };
  }

  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) {
    return { ok: false, error: 'Usuario no encontrado' };
  }

  return {
    ok: true,
    squad: user.squad || []
  };
}

export async function saveSquad(username, squad) {
  if (!username) {
    return { ok: false, error: 'Usuario requerido' };
  }

  if (!Array.isArray(squad)) {
    return { ok: false, error: 'squad debe ser un array' };
  }

  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) {
    return { ok: false, error: 'Usuario no encontrado' };
  }

  const teams = squad.map(p => p.equipo);
  const uniqueTeams = new Set(teams);
  if (uniqueTeams.size !== teams.length) {
    return { ok: false, error: 'No puede haber jugadores del mismo equipo repetidos' };
  }

  user.squad = squad;
  await user.save();

  return {
    ok: true,
    squad: user.squad
  };
}

export async function changePassword(username, currentPassword, newPassword) {
  if (!username || !currentPassword || !newPassword) {
    return { ok: false, error: 'Usuario, contraseña actual y nueva contraseña son obligatorios' };
  }

  if (newPassword.length < 6) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres' };
  }

  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) {
    return { ok: false, error: 'Usuario no encontrado' };
  }

  const isValid = verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    return { ok: false, error: 'La contraseña actual es incorrecta' };
  }

  user.passwordHash = hashPassword(newPassword);
  await user.save();

  return { ok: true, message: 'Contraseña actualizada correctamente' };
}
