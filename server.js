import 'dotenv/config';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import zlib from 'zlib';
import { connectDB, User, Invitation, MatchStats } from './db/index.js';
import { leerFichero } from './github.js';
import { register, login, getProfile, saveProfile, getTakenAvatars, getAllPlayers, getSquad, saveSquad, changePassword } from './api/auth.js';
import { scrapMatchStats } from './scripts/matchStats.js';
import { authenticate, rateLimiter, checkBodySize, setSecurityHeaders, validateUsername, authRateLimiter } from './api/middleware.js';

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://porra-spa.vercel.app';

const nuevoUsuario = () => {
  let codigo = crypto.randomBytes(3).toString('hex').toUpperCase();
  return codigo;
}

const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const registerLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const globalLimiter = rateLimiter({ windowMs: 60 * 1000, max: 120 });
const nuevoUsuarioLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const authenticatedLimiter = authRateLimiter({ windowMs: 60 * 1000, max: 30 });

// Cache de config con TTL de 60s
let _configCache = null;
let _configCacheTime = 0;
const CONFIG_CACHE_TTL = 60_000;

async function getConfig() {
  if (_configCache && Date.now() - _configCacheTime < CONFIG_CACHE_TTL) {
    return _configCache;
  }
  try {
    _configCache = await leerFichero('config.json');
    _configCacheTime = Date.now();
  } catch {
    _configCache = null;
  }
  return _configCache;
}

async function esFrozen() {
  const config = await getConfig();
  if (!config || !config.championsStartRoundsDate) return false;
  return new Date() >= new Date(config.championsStartRoundsDate);
}

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  // Endpoint: Configuración del torneo (se mantiene en GitHub)
  if (reqUrl.pathname === '/api/config' && req.method === 'GET') {
    try {
      const config = await getConfig();
      sendJson(req, res, 200, { ok: true, config }, 3600);
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'No se pudo cargar la configuración' });
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
    const players = await getAllPlayers();
    const frozen = await esFrozen();
    if (!frozen) {
      // Pre-freeze: solo nombre y avatar (sin puntos ni aciertos)
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
    const auth = authenticate(req);
    const username = reqUrl.searchParams.get('username') || (auth.ok ? auth.username : null);
    if (!username) {
      sendJson(req, res, 400, { ok: false, error: 'Parámetro username requerido' });
      return;
    }
    // Privacidad pre-freeze: solo el propio usuario puede ver sus predicciones
    if (!await esFrozen()) {
      if (!auth.ok || auth.username !== username) {
        sendJson(req, res, 403, { ok: false, error: 'Acceso denegado antes del freeze' });
        return;
      }
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
    if (await esFrozen()) {
      sendJson(req, res, 403, { ok: false, error: 'Los pronósticos están bloqueados hasta la fecha de freeze' });
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

  // Endpoint: Obtener plantilla ideal de un usuario (lectura pública, escritura requiere auth)
  if (reqUrl.pathname === '/api/squad' && req.method === 'GET') {
    const auth = authenticate(req);
    const username = reqUrl.searchParams.get('username') || (auth.ok ? auth.username : null);
    if (!username) {
      sendJson(req, res, 400, { ok: false, error: 'Parámetro username requerido' });
      return;
    }
    // Privacidad pre-freeze: solo el propio usuario puede ver su plantilla
    if (!await esFrozen()) {
      if (!auth.ok || auth.username !== username) {
        sendJson(req, res, 403, { ok: false, error: 'Acceso denegado antes del freeze' });
        return;
      }
    }
    const result = await getSquad(username);
    sendJson(req, res, result.ok ? 200 : 404, result, 300);
    return;
  }

  // Endpoint: Obtener plantillas de TODOS los usuarios (una sola query)
  if (reqUrl.pathname === '/api/squad/all' && req.method === 'GET') {
    const auth = authenticate(req);
    try {
      const frozen = await esFrozen();
      let query;
      if (frozen || !auth.ok) {
        // Tras freeze: todas. Sin auth: todas (fallback, aunque el frontend siempre envía token).
        query = User.find({}, 'username squad');
      } else {
        // Pre-freeze con auth: solo el propio usuario
        query = User.find({ username: auth.username }, 'username squad');
      }
      const users = await query;
      const squads = {};
      for (const user of users) {
        if (user.squad && user.squad.length > 0) {
          squads[user.username] = user.squad;
        }
      }
      sendJson(req, res, 200, { ok: true, squads }, frozen ? 300 : 0);
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al obtener plantillas' });
    }
    return;
  }

  // Endpoint: Guardar/actualizar plantilla ideal de un usuario
  if (reqUrl.pathname === '/api/squad' && req.method === 'PUT') {
    if (await esFrozen()) {
      sendJson(req, res, 403, { ok: false, error: 'La plantilla está bloqueada hasta la fecha de freeze' });
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
    const auth = authenticate(req);
    try {
      const frozen = await esFrozen();
      let query;
      if (frozen || !auth.ok) {
        query = User.find({}, 'username predictions');
      } else {
        query = User.find({ username: auth.username }, 'username predictions');
      }
      const users = await query;
      const predictions = {};
      for (const user of users) {
        if (user.predictions && Object.keys(user.predictions).length > 0) {
          predictions[user.username] = user.predictions;
        }
      }
      sendJson(req, res, 200, { ok: true, predictions });
    } catch (e) {
      sendJson(req, res, 500, { ok: false, error: 'Error al obtener predicciones' });
    }
    return;
  }

  // Endpoint para nuevoUsuario
  if (reqUrl.pathname === '/nuevoUsuario') {
    const rateLimitResult = nuevoUsuarioLimiter(req);
    if (!rateLimitResult.ok) {
      sendJson(req, res, rateLimitResult.status, { ok: false, error: rateLimitResult.error });
      return;
    }
    const claveUsuario = nuevoUsuario();

    await Invitation.create({
      code: claveUsuario,
      usedBy: null,
      createdAt: new Date()
    });

    sendJson(req, res, 200, { clave: claveUsuario });
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
      nuevoUsuario: '/nuevoUsuario',
      usuario: '/usuario?clave=xxxx',
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      getProfile: 'GET /api/auth/profile?username=xxxx',
      saveProfile: 'POST /api/auth/profile',
      changePassword: 'POST /api/auth/change-password',
      config: 'GET /api/config',
      avatarsTaken: 'GET /api/avatars/taken',
      players: 'GET /api/players',
      getPredictions: 'GET /api/predictions?username=xxxx',
      savePredictions: 'PUT /api/predictions',
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
