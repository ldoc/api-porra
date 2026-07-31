import 'dotenv/config';
import http from 'http';
import https from 'https';
import { guardarFichero, leerFichero } from './github.js';
import { register, login, getProfile, saveProfile, getTakenAvatars, getAllPlayers } from './api/auth.js';

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://porra-spa.vercel.app';

const nuevoUsuario = () => {
  // generamos un código alfanumerico de 4 caracteres
  let codigo = Math.random().toString(36).slice(-4).toUpperCase();
  return codigo;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  // Endpoint: Configuración del torneo
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

  // // Endpoint /clave
  // if (reqUrl.pathname === '/clave') {
  //   res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  //   const keysEncontradas = Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('NODE_') && !k.startsWith('x_'));
  //   res.end(JSON.stringify({
  //     clave: process.env.CLAVE || process.env.clave || null,
  //     keysEncontradas: keysEncontradas
  //   }, null, 2));
  //   return;
  // }


  // Endpoint para nuevoUsuario
  if (reqUrl.pathname === '/nuevoUsuario') {
    let invitations = {};
    try {
      invitations = await leerFichero('data/users/_invitations.json') || {};
    } catch (e) {
      invitations = {};
    }

    const claveUsuario = nuevoUsuario();
    invitations[claveUsuario] = null;

    await guardarFichero(
      'data/users/_invitations.json',
      JSON.stringify(invitations, null, 2),
      `New invitation code: ${claveUsuario}`
    );

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

    // Leemos el fichero del usuario
    const usuario = await leerFichero(`data/users/${clave}.json`);
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
    const invitations = await leerFichero('data/users/_invitations.json').catch(() => ({}));
    const users = [];
    for (const [clave, username] of Object.entries(invitations || {})) {
      let userData = null;
      if (username) {
        userData = await leerFichero(`data/users/${username}.json`).catch(() => null);
      }
      users.push({ clave, registeredTo: username, userData });
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ invitations, users }, null, 2));
    return;
  }

  // Respuesta por defecto si no coincide con los endpoints anteriores
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
      config: 'GET /api/config',
      avatarsTaken: 'GET /api/avatars/taken',
      players: 'GET /api/players'
    },
    timestamp: new Date().toISOString()
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT} (http://localhost:${PORT})`);
});
