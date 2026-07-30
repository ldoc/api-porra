import 'dotenv/config';
import http from 'http';
import https from 'https';
import { guardarFichero } from './github.js';

const PORT = process.env.PORT || 3000;

const nuevoUsuario = () => {
  // generamos un código alfanumerico de 4 caracteres
  let codigo = Math.random().toString(36).slice(-4).toUpperCase();
  return codigo;
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const claveUsuario = nuevoUsuario();
    const objUsuario = {
      clave: claveUsuario,
    }
    // guardamos el usuario en github
    await guardarFichero(`data/users/${claveUsuario}.json`, JSON.stringify(objUsuario, null, 2), `Creación de nuevo usuario: ${claveUsuario}`);
    res.end(JSON.stringify(objUsuario, null, 2));
    return;
  }

  // Respuesta por defecto si no coincide con los endpoints anteriores
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    status: 'ok',
    message: '¡Servidor Node.js activo y funcionando!',
    endpoints: {
      nuevoUsuario: '/nuevoUsuario'
    },
    timestamp: new Date().toISOString()
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT} (http://localhost:${PORT})`);
});
