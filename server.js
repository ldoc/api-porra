import 'dotenv/config';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import zlib from 'zlib';
import jwt from 'jsonwebtoken';
import { connectDB, User, Invitation, MatchStats } from './db/index.js';
import GameConfig from './db/models/GameConfig.js';
import { register, login, getProfile, saveProfile, getTakenAvatars, getAllPlayers, getSquad, saveSquad, changePassword } from './api/auth.js';
import { scrapMatchStats } from './scripts/matchStats.js';
import { authenticate, rateLimiter, checkBodySize, setSecurityHeaders, validateUsername, authRateLimiter } from './api/middleware.js';

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://porra-spa.vercel.app';
const JWT_SECRET = process.env.JWT_SECRET;

const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const registerLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const globalLimiter = rateLimiter({ windowMs: 60 * 1000, max: 120 });
const authenticatedLimiter = authRateLimiter({ windowMs: 60 * 1000, max: 30 });

/**
 * Calcula los IDs de los 8 primeros equipos de la clasificación real
 * Replica la lógica de desempate UCL del frontend (8 criterios)
 * @returns {Promise<number[]>} Array de 8 team IDs
 */
async function getTop8TeamIds() {
  try {
    const allMatchStats = await MatchStats.find({}, 'stats').lean();
    if (!allMatchStats || allMatchStats.length === 0) return [];

    // Recopilar todos los team IDs y calcular estadísticas básicas
    const teamStats = {};

    for (const ms of allMatchStats) {
      const stats = ms.stats;
      if (!stats) continue;

      const teamIds = Object.keys(stats).filter(k => k !== 'jugadores').map(Number);
      if (teamIds.length !== 2) continue;

      const [homeId, awayId] = teamIds;
      const homeGoals = stats[homeId]?.goles ?? 0;
      const awayGoals = stats[awayId]?.goles ?? 0;

      // Inicializar equipos si no existen
      for (const tid of teamIds) {
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

      // Registrar rivalidad
      home.rivals.add(awayId);
      away.rivals.add(homeId);

      // Registrar partido para stats de rivales
      home.matches.push({ goalsFor: homeGoals, goalsAgainst: awayGoals, isHome: true, rivalId: awayId });
      away.matches.push({ goalsFor: awayGoals, goalsAgainst: homeGoals, isHome: false, rivalId: homeId });

      // Goles
      home.gf += homeGoals;
      home.gc += awayGoals;
      away.gf += awayGoals;
      away.gc += homeGoals;

      // Diferencia de goles
      home.gd = home.gf - home.gc;
      away.gd = away.gf - away.gc;

      // Resultado
      if (homeGoals > awayGoals) {
        home.wins++;
        home.points += 3;
        away.losses++;
      } else if (homeGoals < awayGoals) {
        away.wins++;
        away.points += 3;
        home.losses++;
      } else {
        home.draws++;
        home.points++;
        away.draws++;
        away.points++;
      }

      // Goles como visitante
      away.awayGoals += awayGoals;
      if (awayGoals > homeGoals) away.awayWins++;
    }

    const teams = Object.values(teamStats);

    // Calcular stats de rivales (criterios 6-8)
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

    // Ordenar con criterios de desempate UCL
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

    return teams.slice(0, 8).map(t => t.teamId);
  } catch (err) {
    console.error('Error calculating top 8 teams:', err);
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

const FASES_VALIDAS = ['FASE_PRETEMPORADA', 'FASE_LIGA', 'FASE_PRE16'];

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
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
    const result = await register(body.username, body.password, body.invitationCode);
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
            squadFormation: { G: 3, D: 8, M: 8, F: 6 }
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
          squadFormation: config.tournament.squadFormation
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

  // Endpoint: Todos los jugadores registrados (para clasificación)
  if (reqUrl.pathname === '/api/players' && req.method === 'GET') {
    const phaseCheck = await checkPhaseConsistency(req, res);
    if (!phaseCheck) return;
    const players = await getAllPlayers();
    const fase = await getFaseJuego();
    const showPoints = fase !== 'FASE_PRETEMPORADA';
    if (!showPoints) {
      // Pre-temporada: solo nombre y avatar (sin puntos ni aciertos)
      sendJson(req, res, 200, {
        ok: true,
        players: players.map(p => ({ name: p.name, avatar: p.avatar }))
      }, 300);
    } else {
      sendJson(req, res, 200, { ok: true, players }, 300);
    }
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
    const fase = await getFaseJuego();
    if (fase !== 'FASE_PRETEMPORADA') {
      sendJson(req, res, 403, { ok: false, error: 'Los pronosticos estan bloqueados' });
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
    user.predictions = body.predictions;
    await user.save();
    sendJson(req, res, 200, { ok: true });
    return;
  }

  // Endpoint: Obtener predicciones de fase final de un usuario
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
      sendJson(req, res, 403, { ok: false, error: 'Solo puedes ver tus propios pronosticos finales' });
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
      sendJson(req, res, 403, { ok: false, error: 'Los pronosticos finales estan bloqueados' });
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

    // Validación: los 8 primeros clasificados no pueden ir a deciseisavos
    const fp = body.finalPredictions;
    if (fp.roundOf32 && Array.isArray(fp.roundOf32) && fp.roundOf32.length > 0) {
      const top8Ids = await getTop8TeamIds();
      if (top8Ids.length > 0) {
        const top8Set = new Set(top8Ids);
        const invalidTeams = fp.roundOf32.filter(id => top8Set.has(id));
        if (invalidTeams.length > 0) {
          sendJson(req, res, 400, { ok: false, error: 'Los 8 primeros clasificados pasan directamente a octavos. No pueden asignarse a deciseisavos.' });
          return;
        }
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
      const matchStats = await MatchStats.find({});
      sendJson(req, res, 200, { ok: true, matchStats });
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
      let query;
      if (isPublic || !auth.ok) {
        query = User.find({}, 'username predictions finalPredictions');
      } else {
        query = User.find({ username: auth.username }, 'username predictions finalPredictions');
      }
      const users = await query;
      const predictions = {};
      for (const user of users) {
        if (user.predictions && Object.keys(user.predictions).length > 0) {
          predictions[user.username] = {
            predictions: user.predictions,
            finalPredictions: user.finalPredictions || null
          };
        }
      }
      sendJson(req, res, 200, { ok: true, predictions });
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al obtener predicciones' });
    }
    return;
  }

  // Endpoint para obtener un usuario por su clave
  if (reqUrl.pathname === '/usuario') {
    const clave = reqUrl.searchParams.get('clave');
    if (!clave) {
      sendJson(req, res, 400, {
        status: 'error',
        message: 'Debe proporcionar una clave de usuario.'
      });
      return;
    }

    const usuario = await User.findOne({ clave: clave }, '-passwordHash -__v');
    if (!usuario) {
      sendJson(req, res, 404, {
        status: 'error',
        message: 'Usuario no encontrado.'
      });
      return;
    }

    sendJson(req, res, 200, usuario);
    return;
  }


  // Respuesta por defecto
  sendJson(req, res, 200, {
    status: 'ok',
    message: '¡Servidor Node.js activo y funcionando!',
    endpoints: {
      usuario: '/usuario?clave=xxxx',
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
