import 'dotenv/config';
import http from 'http';
import https from 'https';
import { connectDB, User, Invitation } from './db/index.js';
import { guardarFichero, leerFichero } from './github.js';
import { register, login, getProfile, saveProfile, getTakenAvatars, getAllPlayers, getSquad, saveSquad, changePassword } from './api/auth.js';
import { scrapMatchStats } from './scripts/matchStats.js';

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://porra-spa.vercel.app';

const nuevoUsuario = () => {
  let codigo = Math.random().toString(36).slice(-4).toUpperCase();
  return codigo;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
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

await connectDB();

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (reqUrl.pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Body inválido' }));
      return;
    }
    const result = await register(body.username, body.password, body.invitationCode);
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  if (reqUrl.pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Body inválido' }));
      return;
    }
    const result = await login(body.username, body.password);
    res.writeHead(result.ok ? 200 : 401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  if (reqUrl.pathname === '/api/auth/profile' && req.method === 'GET') {
    const username = reqUrl.searchParams.get('username');
    if (!username) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Parámetro username requerido' }));
      return;
    }
    const result = await getProfile(username);
    res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  if (reqUrl.pathname === '/api/auth/profile' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body || !body.username) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Body inválido, se requiere username' }));
      return;
    }
    const result = await saveProfile(body.username, { avatar: body.avatar });
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // Endpoint: Cambiar contraseña
  if (reqUrl.pathname === '/api/auth/change-password' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body || !body.username || !body.currentPassword || !body.newPassword) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Body inválido, se requiere username, currentPassword y newPassword' }));
      return;
    }
    const result = await changePassword(body.username, body.currentPassword, body.newPassword);
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // Endpoint: Configuración del torneo (se mantiene en GitHub)
  if (reqUrl.pathname === '/api/config' && req.method === 'GET') {
    try {
      const config = await leerFichero('config.json');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, config }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'No se pudo cargar la configuración' }));
    }
    return;
  }

  // Endpoint: Avatares ya cogidos por otros usuarios
  if (reqUrl.pathname === '/api/avatars/taken' && req.method === 'GET') {
    const taken = await getTakenAvatars();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, taken }));
    return;
  }

  // Endpoint: Todos los jugadores registrados (para clasificación)
  if (reqUrl.pathname === '/api/players' && req.method === 'GET') {
    const players = await getAllPlayers();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, players }));
    return;
  }

  // Endpoint: Obtener predicciones de un usuario
  if (reqUrl.pathname === '/api/predictions' && req.method === 'GET') {
    const username = reqUrl.searchParams.get('username');
    if (!username) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Parámetro username requerido' }));
      return;
    }
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Usuario no encontrado' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, predictions: user.predictions || {} }));
    return;
  }

  // Endpoint: Guardar/actualizar predicciones de un usuario
  if (reqUrl.pathname === '/api/predictions' && req.method === 'PUT') {
    const body = await parseBody(req);
    if (!body || !body.username || !body.predictions) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Body inválido, se requiere username y predictions' }));
      return;
    }
    const user = await User.findOne({ username: body.username.toLowerCase() });
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Usuario no encontrado' }));
      return;
    }
    user.predictions = body.predictions;
    await user.save();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Endpoint: Obtener plantilla ideal de un usuario
  if (reqUrl.pathname === '/api/squad' && req.method === 'GET') {
    const username = reqUrl.searchParams.get('username');
    if (!username) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Parámetro username requerido' }));
      return;
    }
    const result = await getSquad(username);
    res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // Endpoint: Guardar/actualizar plantilla ideal de un usuario
  if (reqUrl.pathname === '/api/squad' && req.method === 'PUT') {
    const body = await parseBody(req);
    if (!body || !body.username || !body.squad) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Body inválido, se requiere username y squad' }));
      return;
    }
    const result = await saveSquad(body.username, body.squad);
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // Endpoint: Estadísticas de un partido (scraping Sofascore - se mantiene en GitHub)
  if (reqUrl.pathname.startsWith('/api/match-stats/') && req.method === 'GET') {
    const eventId = reqUrl.pathname.split('/api/match-stats/')[1];
    if (!eventId || isNaN(eventId)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'ID de partido inválido' }));
      return;
    }
    try {
      const stats = await scrapMatchStats(Number(eventId));
      await guardarFichero(
        `data/sofascore/partidos/${eventId}.json`,
        JSON.stringify(stats, null, 2),
        `Match stats: ${eventId}`
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(stats));
    } catch (e) {
      const status = e.message === 'NOT_FOUND' ? 404 : 500;
      const error = e.message === 'NOT_FOUND' ? 'Partido no encontrado en Sofascore' : 'Error al obtener estadísticas del partido';
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error }));
    }
    return;
  }

  // Endpoint para nuevoUsuario
  if (reqUrl.pathname === '/nuevoUsuario') {
    const claveUsuario = nuevoUsuario();

    await Invitation.create({
      code: claveUsuario,
      usedBy: null,
      createdAt: new Date()
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ clave: claveUsuario }, null, 2));
    return;
  }

  // Endpoint para obtener un usuario por su clave
  if (reqUrl.pathname === '/usuario') {
    const clave = reqUrl.searchParams.get('clave');
    if (!clave) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'error',
        message: 'Debe proporcionar una clave de usuario.'
      }, null, 2));
      return;
    }

    const usuario = await User.findOne({ clave: clave });
    if (!usuario) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'error',
        message: 'Usuario no encontrado.'
      }, null, 2));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(usuario, null, 2));
    return;
  }

  // Debug: listar usuarios e invitaciones
  if (reqUrl.pathname === '/api/debug/users') {
    const invitations = await Invitation.find({});
    const users = await User.find({});
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ invitations, users }, null, 2));
    return;
  }

  // Respuesta por defecto
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
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
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT} (http://localhost:${PORT})`);
});
