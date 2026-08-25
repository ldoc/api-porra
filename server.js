import 'dotenv/config';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { connectDB, User, Invitation, MatchStats } from './db/index.js';
import GameConfig from './db/models/GameConfig.js';
import { register, login, getProfile, saveProfile, getTakenAvatars, getAllPlayers, getSquad, saveSquad, changePassword } from './api/auth.js';
import { scrapMatchStats } from './scripts/matchStats.js';
import { authenticate, rateLimiter, checkBodySize, setSecurityHeaders, validateUsername, authRateLimiter } from './api/middleware.js';
import { getFinalPredictionsViolations } from './api/finalPredictions.js';
import { validateFasesFechas } from './api/fasesFechas.js';
import { computeWeakEtag, etagMatches } from './api/etag.js';
import { parseSinceParam } from './api/matchStatsFilter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://porra-spa.vercel.app';
const JWT_SECRET = process.env.JWT_SECRET;

const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const registerLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const globalLimiter = rateLimiter({ windowMs: 60 * 1000, max: 120 });
const authenticatedLimiter = authRateLimiter({ windowMs: 60 * 1000, max: 30 });

/**
 * Calcula la clasificación pronosticada de un usuario basándose en sus predicciones
 * @param {Object} predictions - Objeto con predicciones { eventId: { home, away } }
 * @returns {Promise<Array>} Array ordenado de equipos con { id, position }
 */
async function calculateUserStandings(predictions) {
  try {
    if (!predictions || Object.keys(predictions).length === 0) return [];

    const calendar = await import('./data/sofascore/calendar.json', { assert: { type: 'json' } })
      .then(m => m.default)
      .catch(() => null);

    if (!calendar) return [];

    // Solo se consideran los 144 partidos de la fase de liga
    const calendarLiga = calendar.filter(m => m.fase === 'liga');

    const teamStats = {};

    for (const match of calendarLiga) {
      const pred = predictions[match.id];
      if (!pred || pred.home === null || pred.away === null) continue;

      const homeId = match.equipoLocal?.id ?? match.homeTeam?.id;
      const awayId = match.equipoVisitante?.id ?? match.awayTeam?.id;
      if (!homeId || !awayId) continue;

      for (const tid of [homeId, awayId]) {
        if (!teamStats[tid]) {
          teamStats[tid] = {
            teamId: tid,
            points: 0,
            gf: 0,
            gc: 0,
            gd: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            awayGoals: 0,
            awayWins: 0,
            matches: [],
            rivals: new Set()
          };
        }
      }

      const home = teamStats[homeId];
      const away = teamStats[awayId];

      home.rivals.add(awayId);
      away.rivals.add(homeId);

      home.matches.push({ goalsFor: pred.home, goalsAgainst: pred.away, isHome: true, rivalId: awayId });
      away.matches.push({ goalsFor: pred.away, goalsAgainst: pred.home, isHome: false, rivalId: homeId });

      home.gf += pred.home;
      home.gc += pred.away;
      away.gf += pred.away;
      away.gc += pred.home;

      home.gd = home.gf - home.gc;
      away.gd = away.gf - away.gc;

      if (pred.home > pred.away) {
        home.wins++;
        home.points += 3;
        away.losses++;
      } else if (pred.home < pred.away) {
        away.wins++;
        away.points += 3;
        home.losses++;
      } else {
        home.draws++;
        home.points++;
        away.draws++;
        away.points++;
      }

      away.awayGoals += pred.away;
      if (pred.away > pred.home) away.awayWins++;
    }

    const teams = Object.values(teamStats);

    for (const team of teams) {
      let rivalPointsSum = 0;
      let rivalGDSum = 0;
      let rivalGFSum = 0;

      for (const rivalId of team.rivals) {
        const rival = teamStats[rivalId];
        if (rival) {
          rivalPointsSum += rival.points;
          rivalGDSum += rival.gd;
          rivalGFSum += rival.gf;
        }
      }

      team.rivalPointsSum = rivalPointsSum;
      team.rivalGDSum = rivalGDSum;
      team.rivalGFSum = rivalGFSum;
    }

    teams.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      if (b.awayGoals !== a.awayGoals) return b.awayGoals - a.awayGoals;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.awayWins !== a.awayWins) return b.awayWins - a.awayWins;
      if (b.rivalPointsSum !== a.rivalPointsSum) return b.rivalPointsSum - a.rivalPointsSum;
      if (b.rivalGDSum !== a.rivalGDSum) return b.rivalGDSum - a.rivalGDSum;
      if (b.rivalGFSum !== a.rivalGFSum) return b.rivalGFSum - a.rivalGFSum;
      return 0;
    });

    return teams.map((t, i) => ({ id: t.teamId, position: i + 1 }));
  } catch (err) {
    console.error('Error calculating user standings:', err);
    return [];
  }
}

async function getFaseJuego() {
  try {
    const config = await GameConfig.findById('gameConfig');
    return config?.faseJuego || 'FASE_PRETEMPORADA';
  } catch (error) {
    console.error('Error obteniendo fase del juego:', error);
    return 'FASE_PRETEMPORADA';
  }
}

/**
 * Devuelve la fase del calendario cuyos pronósticos deben ocultarse a otros usuarios
 * durante una fase PRE (en edición). Devuelve null si no aplica.
 */
function getHiddenFaseForOthers(faseJuego) {
  if (faseJuego === 'FASE_PRETEMPORADA' || !faseJuego?.startsWith('FASE_PRE')) return null;
  const faseMap = {
    'FASE_PRE16': '16',
    'FASE_PRE8': '8',
    'FASE_PRE4': '4',
    'FASE_PRESEMIS': 'semis',
    'FASE_PREFINAL': 'final'
  };
  return faseMap[faseJuego] || null;
}

async function checkPhaseConsistency(req, res) {
  const clientPhase = req.headers['x-client-phase'];
  if (!clientPhase) {
    return { match: true };
  }
  const currentPhase = await getFaseJuego();
  if (clientPhase !== currentPhase) {
    sendJson(req, res, 409, {
      ok: false,
      error: 'PHASE_CHANGED',
      currentPhase,
      previousPhase: clientPhase
    });
    return null;
  }
  return { match: true };
}

async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ username: decoded.username });

    if (!user || !user.isAdmin) {
      return null;
    }

    return user;
  } catch (error) {
    return null;
  }
}

const fasesPath = path.join(__dirname, 'data', 'fases.json');
const fasesData = JSON.parse(fs.readFileSync(fasesPath, 'utf8'));
const FASES_VALIDAS = fasesData.fases.map(f => f.nombre);

function setCorsHeaders(req, res) {
  const origin = req.headers['origin'];
  const allowedOrigins = [
    'https://porra-spa.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080'
  ];
  if (allowedOrigins.includes(origin) || (origin && origin.startsWith('http://localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Phase');
}

function parseBody(req, maxSizeBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (isNaN(contentLength) || contentLength > maxSizeBytes) {
      resolve({ __error: { status: 413, error: 'Body demasiado grande' } });
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(req, res, statusCode, data, cacheSeconds) {
  const json = JSON.stringify(data);
  const baseHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
  if (cacheSeconds) {
    baseHeaders['Cache-Control'] = `public, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
  }
  if (statusCode === 200 && req?.method === 'GET') {
    const etag = computeWeakEtag(json);
    baseHeaders['ETag'] = etag;
    if (etagMatches(req.headers['if-none-match'], etag)) {
      res.writeHead(304, baseHeaders);
      res.end();
      return;
    }
  }
  const acceptEncoding = req?.headers?.['accept-encoding'] || '';
  if (acceptEncoding.includes('gzip') && json.length > 1024) {
    zlib.gzip(json, (err, compressed) => {
      if (err) {
        res.writeHead(statusCode, baseHeaders);
        res.end(json);
        return;
      }
      res.writeHead(statusCode, {
        ...baseHeaders,
        'Content-Encoding': 'gzip',
        'Content-Length': compressed.length
      });
      res.end(compressed);
    });
  } else {
    res.writeHead(statusCode, baseHeaders);
    res.end(json);
  }
}

await connectDB();

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  setCorsHeaders(req, res);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const globalRateResult = globalLimiter(req);
  if (!globalRateResult.ok) {
    sendJson(req, res, globalRateResult.status, { ok: false, error: globalRateResult.error });
    return;
  }

  if (reqUrl.pathname === '/api/auth/register' && req.method === 'POST') {
    const rateLimitResult = registerLimiter(req);
    if (!rateLimitResult.ok) {
      sendJson(req, res, rateLimitResult.status, { ok: false, error: rateLimitResult.error });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido' });
      return;
    }
    const usernameValidation = validateUsername(body.username);
    if (!usernameValidation.ok) {
      sendJson(req, res, 400, { ok: false, error: usernameValidation.error });
      return;
    }
    body.username = usernameValidation.username;
    const faseJuego = await getFaseJuego();
    const result = await register(body.username, body.password, body.invitationCode, faseJuego);
    sendJson(req, res, result.ok ? 200 : 400, result);
    return;
  }

  if (reqUrl.pathname === '/api/auth/login' && req.method === 'POST') {
    const rateLimitResult = loginLimiter(req);
    if (!rateLimitResult.ok) {
      sendJson(req, res, rateLimitResult.status, { ok: false, error: rateLimitResult.error });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido' });
      return;
    }
    const result = await login(body.username, body.password);
    sendJson(req, res, result.ok ? 200 : 401, result);
    return;
  }

  if (reqUrl.pathname === '/api/auth/profile' && req.method === 'GET') {
    const auth = authenticate(req);
    if (!auth.ok) {
      sendJson(req, res, auth.status, { ok: false, error: auth.error });
      return;
    }
    const result = await getProfile(auth.username);
    sendJson(req, res, result.ok ? 200 : 404, result);
    return;
  }

  if (reqUrl.pathname === '/api/auth/profile' && req.method === 'POST') {
    const auth = authenticate(req);
    if (!auth.ok) {
      sendJson(req, res, auth.status, { ok: false, error: auth.error });
      return;
    }
    const authRateResult = authenticatedLimiter(req);
    if (!authRateResult.ok) {
      sendJson(req, res, authRateResult.status, { ok: false, error: authRateResult.error });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido' });
      return;
    }
    const result = await saveProfile(auth.username, { avatar: body.avatar });
    sendJson(req, res, result.ok ? 200 : 400, result);
    return;
  }

  // Endpoint: Cambiar contraseña
  if (reqUrl.pathname === '/api/auth/change-password' && req.method === 'POST') {
    const auth = authenticate(req);
    if (!auth.ok) {
      sendJson(req, res, auth.status, { ok: false, error: auth.error });
      return;
    }
    const authRateResult = authenticatedLimiter(req);
    if (!authRateResult.ok) {
      sendJson(req, res, authRateResult.status, { ok: false, error: authRateResult.error });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido, se requiere currentPassword y newPassword' });
      return;
    }
    if (!body.currentPassword || !body.newPassword) {
      sendJson(req, res, 400, { ok: false, error: 'Body inválido, se requiere currentPassword y newPassword' });
      return;
    }
    const result = await changePassword(auth.username, body.currentPassword, body.newPassword);
    sendJson(req, res, result.ok ? 200 : 400, result);
    return;
  }

  // Endpoint: Configuración del torneo (MongoDB)
  if (reqUrl.pathname === '/api/config' && req.method === 'GET') {
    try {
      const config = await GameConfig.findById('gameConfig');
      
      if (!config) {
        sendJson(req, res, 200, {
          ok: true,
          config: {
            faseJuego: 'FASE_PRETEMPORADA',
            totalMatches: 144,
            squadSize: 25,
            squadFormation: { G: 3, D: 8, M: 8, F: 6 },
            fasesFechas: {}
          }
        });
        return;
      }
      
      sendJson(req, res, 200, {
        ok: true,
        config: {
          faseJuego: config.faseJuego,
          totalMatches: config.tournament.totalMatches,
          squadSize: config.tournament.squadSize,
          squadFormation: config.tournament.squadFormation,
          fasesFechas: config.fasesFechas || {}
        }
      });
    } catch (e) {
      console.error('Error obteniendo config:', e);
      sendJson(req, res, 500, { ok: false, error: 'Error interno' });
    }
    return;
  }

  // Endpoint Admin: Cambiar fase del juego
  if (reqUrl.pathname === '/api/admin/fase-juego' && req.method === 'PUT') {
    const admin = await verifyAdmin(req);
    if (!admin) {
      sendJson(req, res, 403, { ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido' });
      return;
    }
    const { faseJuego } = body;
    if (!FASES_VALIDAS.includes(faseJuego)) {
      sendJson(req, res, 400, { ok: false, error: `Fase inválida. Valores permitidos: ${FASES_VALIDAS.join(', ')}` });
      return;
    }
    try {
      const config = await GameConfig.findByIdAndUpdate(
        'gameConfig',
        { $set: { faseJuego, updatedBy: admin.username, updatedAt: new Date() } },
        { new: true, upsert: true }
      );
      sendJson(req, res, 200, {
        ok: true,
        faseJuego: config.faseJuego,
        updatedBy: config.updatedBy,
        updatedAt: config.updatedAt
      });
    } catch (error) {
      console.error('Error cambiando fase:', error);
      sendJson(req, res, 500, { ok: false, error: 'Error interno del servidor' });
    }
    return;
  }

  // Endpoint Admin: Actualizar configuración completa
  if (reqUrl.pathname === '/api/admin/config' && req.method === 'PUT') {
    const admin = await verifyAdmin(req);
    if (!admin) {
      sendJson(req, res, 403, { ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido' });
      return;
    }
    const { faseJuego, tournament } = body;
    const updateData = { updatedBy: admin.username, updatedAt: new Date() };
    if (faseJuego) {
      if (!FASES_VALIDAS.includes(faseJuego)) {
        sendJson(req, res, 400, { ok: false, error: `Fase inválida. Valores permitidos: ${FASES_VALIDAS.join(', ')}` });
        return;
      }
      updateData.faseJuego = faseJuego;
    }
    if (tournament) {
      updateData.tournament = tournament;
    }
    try {
      const config = await GameConfig.findByIdAndUpdate(
        'gameConfig',
        { $set: updateData },
        { new: true, upsert: true }
      );
      sendJson(req, res, 200, {
        ok: true,
        config: {
          faseJuego: config.faseJuego,
          totalMatches: config.tournament.totalMatches,
          squadSize: config.tournament.squadSize,
          squadFormation: config.tournament.squadFormation
        },
        updatedBy: config.updatedBy,
        updatedAt: config.updatedAt
      });
    } catch (error) {
      console.error('Error actualizando config:', error);
      sendJson(req, res, 500, { ok: false, error: 'Error interno del servidor' });
    }
    return;
  }

  // Endpoint Admin: Actualizar fechas de inicio/fin de las fases
  if (reqUrl.pathname === '/api/admin/fases-fechas' && req.method === 'PUT') {
    const admin = await verifyAdmin(req);
    if (!admin) {
      sendJson(req, res, 403, { ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido' });
      return;
    }
    const valid = validateFasesFechas(body.fasesFechas, FASES_VALIDAS);
    if (!valid.ok) {
      sendJson(req, res, 400, { ok: false, error: valid.error });
      return;
    }
    try {
      const config = await GameConfig.findByIdAndUpdate(
        'gameConfig',
        { $set: { fasesFechas: valid.fasesFechas, updatedBy: admin.username, updatedAt: new Date() } },
        { new: true, upsert: true }
      );
      sendJson(req, res, 200, {
        ok: true,
        fasesFechas: config.fasesFechas,
        updatedBy: config.updatedBy,
        updatedAt: config.updatedAt
      });
    } catch (error) {
      console.error('Error actualizando fechas de fases:', error);
      sendJson(req, res, 500, { ok: false, error: 'Error interno del servidor' });
    }
    return;
  }

  // Endpoint Admin: Listar códigos de invitación
  if (reqUrl.pathname === '/api/admin/invitations' && req.method === 'GET') {
    const admin = await verifyAdmin(req);
    if (!admin) {
      sendJson(req, res, 403, { ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
      return;
    }
    try {
      const invitations = await Invitation.find({}).sort({ createdAt: -1 });
      sendJson(req, res, 200, { ok: true, invitations });
    } catch (error) {
      console.error('Error obteniendo invitaciones:', error);
      sendJson(req, res, 500, { ok: false, error: 'Error interno del servidor' });
    }
    return;
  }

  // Endpoint Admin: Crear código de invitación
  if (reqUrl.pathname === '/api/admin/invitations' && req.method === 'POST') {
    const admin = await verifyAdmin(req);
    if (!admin) {
      sendJson(req, res, 403, { ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
      return;
    }
    try {
      const code = crypto.randomBytes(3).toString('hex').toUpperCase();
      const invitation = await Invitation.create({
        code,
        usedBy: null,
        createdAt: new Date()
      });
      sendJson(req, res, 201, { ok: true, invitation });
    } catch (error) {
      console.error('Error creando invitación:', error);
      sendJson(req, res, 500, { ok: false, error: 'Error interno del servidor' });
    }
    return;
  }

  // Endpoint Admin: Eliminar código de invitación
  if (reqUrl.pathname.startsWith('/api/admin/invitations/') && req.method === 'DELETE') {
    const admin = await verifyAdmin(req);
    if (!admin) {
      sendJson(req, res, 403, { ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
      return;
    }
    const code = reqUrl.pathname.split('/api/admin/invitations/')[1];
    if (!code || code.length !== 6) {
      sendJson(req, res, 400, { ok: false, error: 'Código inválido' });
      return;
    }
    try {
      const invitation = await Invitation.findOne({ code: code.toUpperCase() });
      if (!invitation) {
        sendJson(req, res, 404, { ok: false, error: 'Código no encontrado' });
        return;
      }
      if (invitation.usedBy !== null) {
        sendJson(req, res, 400, { ok: false, error: 'No se puede eliminar un código ya utilizado' });
        return;
      }
      await Invitation.deleteOne({ code: code.toUpperCase() });
      sendJson(req, res, 200, { ok: true, deleted: code.toUpperCase() });
    } catch (error) {
      console.error('Error eliminando invitación:', error);
      sendJson(req, res, 500, { ok: false, error: 'Error interno del servidor' });
    }
    return;
  }

  // Endpoint: Avatares ya cogidos por otros usuarios
  if (reqUrl.pathname === '/api/avatars/taken' && req.method === 'GET') {
    const taken = await getTakenAvatars();
    sendJson(req, res, 200, { ok: true, taken }, 300);
    return;
  }

  if (reqUrl.pathname === '/api/players' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const players = await getAllPlayers();
    sendJson(req, res, 200, { ok: true, players }, 300);
    return;
  }

  // Endpoint: Obtener predicciones de un usuario (lectura pública, escritura requiere auth)
  if (reqUrl.pathname === '/api/predictions' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const auth = authenticate(req);
    const username = reqUrl.searchParams.get('username') || (auth.ok ? auth.username : null);
    if (!username) {
      sendJson(req, res, 400, { ok: false, error: 'Parámetro username requerido' });
      return;
    }
    // Privacidad pre-temporada: solo el propio usuario puede ver sus predicciones
    const fase = await getFaseJuego();
    const isPublic = fase !== 'FASE_PRETEMPORADA';
    if (!isPublic && (!auth.ok || auth.username !== username)) {
      sendJson(req, res, 403, { ok: false, error: 'Solo puedes ver tus propios pronosticos' });
      return;
    }
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      sendJson(req, res, 404, { ok: false, error: 'Usuario no encontrado' });
      return;
    }
    sendJson(req, res, 200, { ok: true, predictions: user.predictions || {} });
    return;
  }

  // Endpoint: Guardar/actualizar predicciones de un usuario
  if (reqUrl.pathname === '/api/predictions' && req.method === 'PUT') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const auth = authenticate(req);
    if (!auth.ok) {
      sendJson(req, res, auth.status, { ok: false, error: auth.error });
      return;
    }
    const authRateResult = authenticatedLimiter(req);
    if (!authRateResult.ok) {
      sendJson(req, res, authRateResult.status, { ok: false, error: authRateResult.error });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido, se requiere predictions' });
      return;
    }
    if (!body.predictions) {
      sendJson(req, res, 400, { ok: false, error: 'Body inválido, se requiere predictions' });
      return;
    }
    const user = await User.findOne({ username: auth.username });
    if (!user) {
      sendJson(req, res, 404, { ok: false, error: 'Usuario no encontrado' });
      return;
    }
    // Validar que solo se modifiquen partidos de la fase actual
    const fase = await getFaseJuego();
    const faseMap = {
      'FASE_PRETEMPORADA': 'liga',
      'FASE_LIGA': 'liga',
      'FASE_PRE16': '16',
      'FASE_16': '16',
      'FASE_PRE8': '8',
      'FASE_8': '8',
      'FASE_PRE4': '4',
      'FASE_4': '4',
      'FASE_PRESEMIS': 'semis',
      'FASE_SEMIS': 'semis',
      'FASE_PREFINAL': 'final',
      'FASE_FINAL': 'final',
      'FASE_POSTFINAL': 'final'
    };
    const currentFase = faseMap[fase] || 'liga';

    // Solo validar si no es fase pretemporada (en pretemporada se guardan predicciones de liga)
    if (fase !== 'FASE_PRETEMPORADA') {
      let calendar;
      try {
        calendar = await import('./data/sofascore/calendar.json', { assert: { type: 'json' } })
          .then(m => m.default);
      } catch {
        calendar = null;
      }

      if (calendar) {
        const matchFaseMap = {};
        for (const match of calendar) {
          matchFaseMap[match.id] = match.fase;
        }

        const existingPredictions = user.predictions || {};

        for (const [eventId, pred] of Object.entries(body.predictions)) {
          const matchFase = matchFaseMap[eventId];
          if (matchFase && matchFase !== currentFase) {
            const existing = existingPredictions[eventId];
            const changed = !existing ||
              existing.home !== pred.home ||
              existing.away !== pred.away;
            if (changed) {
              sendJson(req, res, 403, {
                ok: false,
                error: `No se pueden modificar predicciones de la fase "${matchFase}". Solo se permiten cambios en la fase actual: "${currentFase}"`
              });
              return;
            }
          }
        }
      }
    }

    user.predictions = body.predictions;
    await user.save();
    sendJson(req, res, 200, { ok: true });
    return;
  }

  // Endpoint: Confirmar pronosticos de liga (permanente)
  if (reqUrl.pathname === '/api/predictions/confirm' && req.method === 'POST') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const currentPhase = await getFaseJuego();
    if (currentPhase !== 'FASE_PRETEMPORADA') {
      sendJson(req, res, 409, { ok: false, error: 'La confirmación solo está disponible en FASE_PRETEMPORADA' });
      return;
    }
    const auth = authenticate(req);
    if (!auth.ok) {
      sendJson(req, res, auth.status, { ok: false, error: auth.error });
      return;
    }
    const user = await User.findOne({ username: auth.username });
    if (!user) {
      sendJson(req, res, 404, { ok: false, error: 'Usuario no encontrado' });
      return;
    }
    if (user.predictionsConfirmed) {
      sendJson(req, res, 409, { ok: false, error: 'Ya has confirmado tus pronosticos' });
      return;
    }
    const predictions = user.predictions || {};
    const gameConfig = await GameConfig.findById('gameConfig');
    const totalMatches = gameConfig?.tournament?.totalMatches || 144;
    let filledCount = 0;
    for (const matchId of Object.keys(predictions)) {
      const p = predictions[matchId];
      if (p && typeof p.home === 'number' && typeof p.away === 'number') {
        filledCount++;
      }
    }
    if (filledCount < totalMatches) {
      sendJson(req, res, 400, { ok: false, error: `Faltan pronosticos. Has completado ${filledCount} de ${totalMatches} partidos` });
      return;
    }
    user.predictionsConfirmed = true;
    await user.save();
    sendJson(req, res, 200, { ok: true, predictionsConfirmed: true });
    return;
  }

  // Endpoint: Obtener predicciones de eliminatorias de un usuario
  if (reqUrl.pathname === '/api/final-predictions' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const auth = authenticate(req);
    const username = reqUrl.searchParams.get('username') || (auth.ok ? auth.username : null);
    if (!username) {
      sendJson(req, res, 400, { ok: false, error: 'Parámetro username requerido' });
      return;
    }
    // Privacidad pre-temporada: solo el propio usuario puede ver sus predicciones
    const fase = await getFaseJuego();
    const isPublic = fase !== 'FASE_PRETEMPORADA';
    if (!isPublic && (!auth.ok || auth.username !== username)) {
      sendJson(req, res, 403, { ok: false, error: 'Solo puedes ver tus propios pronosticos de eliminatorias' });
      return;
    }
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      sendJson(req, res, 404, { ok: false, error: 'Usuario no encontrado' });
      return;
    }
    sendJson(req, res, 200, { ok: true, finalPredictions: user.finalPredictions || null });
    return;
  }

  // Endpoint: Guardar/actualizar predicciones de fase final
  if (reqUrl.pathname === '/api/final-predictions' && req.method === 'PUT') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const fase = await getFaseJuego();
    if (fase !== 'FASE_PRETEMPORADA') {
      sendJson(req, res, 403, { ok: false, error: 'Los pronosticos de eliminatorias estan bloqueados' });
      return;
    }
    const auth = authenticate(req);
    if (!auth.ok) {
      sendJson(req, res, auth.status, { ok: false, error: auth.error });
      return;
    }
    const authRateResult = authenticatedLimiter(req);
    if (!authRateResult.ok) {
      sendJson(req, res, authRateResult.status, { ok: false, error: authRateResult.error });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido, se requiere finalPredictions' });
      return;
    }
    if (!body.finalPredictions) {
      sendJson(req, res, 400, { ok: false, error: 'Body inválido, se requiere finalPredictions' });
      return;
    }

    // Validación: los 8 primeros clasificados de la clasificación pronosticada no pueden ir a deciseisavos
    const fp = body.finalPredictions;
    const userForValidation = await User.findOne({ username: auth.username });
    const standings = userForValidation?.predictions
      ? await calculateUserStandings(userForValidation.predictions)
      : [];
    const teamPositionMap = new Map(standings.map((team, index) => [team.id, index + 1]));

    if (fp.roundOf32 && Array.isArray(fp.roundOf32) && fp.roundOf32.length > 0 && teamPositionMap.size >= 8) {
      const top8Set = new Set(standings.slice(0, 8).map(team => team.id));
      const invalidTeams = fp.roundOf32.filter(id => top8Set.has(id));
      if (invalidTeams.length > 0) {
        sendJson(req, res, 400, { ok: false, error: 'Los 8 primeros clasificados pasan directamente a octavos. No pueden asignarse a deciseisavos.' });
        return;
      }
    }

    // Validación: restricciones por grupos de posiciones
    if (standings && standings.length >= 24) {
      const violations = getFinalPredictionsViolations(fp, teamPositionMap);
      if (violations.length > 0) {
        sendJson(req, res, 400, { ok: false, error: violations[0] });
        return;
      }
    }

    const user = await User.findOne({ username: auth.username });
    if (!user) {
      sendJson(req, res, 404, { ok: false, error: 'Usuario no encontrado' });
      return;
    }
    user.finalPredictions = body.finalPredictions;
    await user.save();
    sendJson(req, res, 200, { ok: true });
    return;
  }

  // Endpoint: Obtener plantilla ideal de un usuario (lectura pública, escritura requiere auth)
  if (reqUrl.pathname === '/api/squad' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const auth = authenticate(req);
    const username = reqUrl.searchParams.get('username') || (auth.ok ? auth.username : null);
    if (!username) {
      sendJson(req, res, 400, { ok: false, error: 'Parámetro username requerido' });
      return;
    }
    // Privacidad pre-temporada: solo el propio usuario puede ver su plantilla
    const fase = await getFaseJuego();
    const isPublic = fase !== 'FASE_PRETEMPORADA';
    if (!isPublic && (!auth.ok || auth.username !== username)) {
      sendJson(req, res, 403, { ok: false, error: 'Solo puedes ver tu propia plantilla' });
      return;
    }
    const result = await getSquad(username);
    sendJson(req, res, result.ok ? 200 : 404, result, 300);
    return;
  }

  // Endpoint: Obtener plantillas de TODOS los usuarios (una sola query)
  if (reqUrl.pathname === '/api/squad/all' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const auth = authenticate(req);
    try {
      const fase = await getFaseJuego();
      const isPublic = fase !== 'FASE_PRETEMPORADA';
      let query;
      if (isPublic || !auth.ok) {
        // Fase activa: todas. Sin auth: todas (fallback, aunque el frontend siempre envía token).
        query = User.find({}, 'username squad');
      } else {
        // Pre-temporada con auth: solo el propio usuario
        query = User.find({ username: auth.username }, 'username squad');
      }
      const users = await query;
      const squads = {};
      for (const user of users) {
        if (user.squad && user.squad.length > 0) {
          squads[user.username] = user.squad;
        }
      }
      sendJson(req, res, 200, { ok: true, squads }, isPublic ? 300 : 0);
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al obtener plantillas' });
    }
    return;
  }

  // Endpoint: Guardar/actualizar plantilla ideal de un usuario
  if (reqUrl.pathname === '/api/squad' && req.method === 'PUT') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const fase = await getFaseJuego();
    if (fase !== 'FASE_PRETEMPORADA') {
      sendJson(req, res, 403, { ok: false, error: 'La plantilla esta bloqueada' });
      return;
    }
    const auth = authenticate(req);
    if (!auth.ok) {
      sendJson(req, res, auth.status, { ok: false, error: auth.error });
      return;
    }
    const authRateResult = authenticatedLimiter(req);
    if (!authRateResult.ok) {
      sendJson(req, res, authRateResult.status, { ok: false, error: authRateResult.error });
      return;
    }
    const body = await parseBody(req);
    if (!body || body.__error) {
      const status = body?.__error?.status || 400;
      sendJson(req, res, status, { ok: false, error: body?.__error?.error || 'Body inválido, se requiere squad' });
      return;
    }
    if (!body.squad) {
      sendJson(req, res, 400, { ok: false, error: 'Body inválido, se requiere squad' });
      return;
    }
    const result = await saveSquad(auth.username, body.squad);
    sendJson(req, res, result.ok ? 200 : 400, result);
    return;
  }

  // Endpoint: Total de matchstats (ligero, para polling)
  if (reqUrl.pathname === '/api/match-stats/updated' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    try {
      const result = await MatchStats.findOne({}, 'eventId lastUpdated').sort({ lastUpdated: -1 });
      const count = await MatchStats.countDocuments();
      sendJson(req, res, 200, {
        ok: true,
        count,
        lastUpdated: result?.lastUpdated || null
      });
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al obtener estado' });
    }
    return;
  }

  // Endpoint: Estadísticas de un partido (scraping Sofascore - se mantiene en GitHub)
  if (reqUrl.pathname.startsWith('/api/match-stats/') && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const eventId = reqUrl.pathname.split('/api/match-stats/')[1];
    if (!eventId || isNaN(eventId)) {
      sendJson(req, res, 400, { ok: false, error: 'ID de partido inválido' });
      return;
    }
    try {
      const stats = await scrapMatchStats(Number(eventId));
      await MatchStats.findOneAndUpdate(
        { eventId: Number(eventId) },
        { eventId: Number(eventId), stats, lastUpdated: new Date() },
        { upsert: true, new: true }
      );
      sendJson(req, res, 200, stats);
    } catch (e) {
      const status = e.message === 'NOT_FOUND' ? 404 : 500;
      const error = e.message === 'NOT_FOUND' ? 'Partido no encontrado en Sofascore' : 'Error al obtener estadísticas del partido';
      sendJson(req, res, status, { ok: false, error });
    }
    return;
  }

  // Endpoint: Obtener todos los matchstats
  if (reqUrl.pathname === '/api/match-stats' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    try {
      const sinceResult = parseSinceParam(reqUrl.searchParams.get('since'));
      if (!sinceResult.ok) {
        sendJson(req, res, 400, { ok: false, error: 'Parámetro since inválido' });
        return;
      }
      const lastDoc = await MatchStats.findOne({}, { lastUpdated: 1 }).sort({ lastUpdated: -1 }).lean();
      const serverTime = lastDoc ? lastDoc.lastUpdated.toISOString() : null;
      const filter = sinceResult.date ? { lastUpdated: { $gt: sinceResult.date } } : {};
      const matchStats = await MatchStats.find(filter).sort({ eventId: 1 });
      sendJson(req, res, 200, { ok: true, matchStats, serverTime });
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al obtener estadísticas' });
    }
    return;
  }

  // Endpoint: Eliminar un matchstat por eventId
  if (reqUrl.pathname.startsWith('/api/match-stats/') && req.method === 'DELETE') {
    const eventId = parseInt(reqUrl.pathname.split('/api/match-stats/')[1]);
    if (isNaN(eventId)) {
      sendJson(req, res, 400, { ok: false, error: 'eventId inválido' });
      return;
    }
    try {
      const result = await MatchStats.deleteOne({ eventId });
      if (result.deletedCount === 0) {
        sendJson(req, res, 404, { ok: false, error: 'MatchStat no encontrado' });
      } else {
        sendJson(req, res, 200, { ok: true, deleted: eventId });
      }
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al eliminar estadísticas' });
    }
    return;
  }

  // Endpoint: Obtener predicciones de todos los usuarios
  if (reqUrl.pathname === '/api/predictions/all' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const auth = authenticate(req);
    try {
      const fase = await getFaseJuego();
      const isPublic = fase !== 'FASE_PRETEMPORADA';
      const hiddenFase = getHiddenFaseForOthers(fase);
      let query;
      if (isPublic || !auth.ok) {
        query = User.find({}, 'username predictions finalPredictions squad');
      } else {
        query = User.find({ username: auth.username }, 'username predictions finalPredictions squad');
      }
      const users = await query;

      // Construir mapa eventId → fase para filtrar predicciones de la fase oculta
      let matchFaseMap = null;
      if (hiddenFase) {
        try {
          const calendar = await import('./data/sofascore/calendar.json', { assert: { type: 'json' } })
            .then(m => m.default);
          matchFaseMap = {};
          for (const match of calendar) {
            matchFaseMap[match.id] = match.fase;
          }
        } catch {
          matchFaseMap = null;
        }
      }

      const predictions = {};
      for (const user of users) {
        let userPredictions = user.predictions || {};
        if (hiddenFase && matchFaseMap && auth.ok && user.username !== auth.username) {
          userPredictions = {};
          for (const [eventId, pred] of Object.entries(user.predictions || {})) {
            if (matchFaseMap[eventId] !== hiddenFase) {
              userPredictions[eventId] = pred;
            }
          }
        }
        const hasPredictions = Object.keys(userPredictions).length > 0;
        const hasFinal = user.finalPredictions && Object.keys(user.finalPredictions).length > 0;
        const hasSquad = Array.isArray(user.squad) && user.squad.length > 0;
        if (hasPredictions || hasFinal || hasSquad) {
          predictions[user.username] = {
            predictions: userPredictions,
            finalPredictions: user.finalPredictions || null,
            squad: user.squad || null
          };
        }
      }
      sendJson(req, res, 200, { ok: true, predictions });
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al obtener predicciones' });
    }
    return;
  }

  // Respuesta por defecto
  sendJson(req, res, 200, {
    status: 'ok',
    message: '¡Servidor Node.js activo y funcionando!',
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      getProfile: 'GET /api/auth/profile?username=xxxx',
      saveProfile: 'POST /api/auth/profile',
      changePassword: 'POST /api/auth/change-password',
      config: 'GET /api/config',
      adminFaseJuego: 'PUT /api/admin/fase-juego (admin)',
      adminConfig: 'PUT /api/admin/config (admin)',
      avatarsTaken: 'GET /api/avatars/taken',
      players: 'GET /api/players',
      getPredictions: 'GET /api/predictions?username=xxxx',
      savePredictions: 'PUT /api/predictions',
      confirmPredictions: 'POST /api/predictions/confirm',
      getFinalPredictions: 'GET /api/final-predictions?username=xxxx',
      saveFinalPredictions: 'PUT /api/final-predictions',
      getSquad: 'GET /api/squad?username=xxxx',
      saveSquad: 'PUT /api/squad',
      matchStats: 'GET /api/match-stats/:eventId'
    },
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT} (http://localhost:${PORT})`);
});
