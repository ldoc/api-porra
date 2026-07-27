const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/hola') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('adios');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    status: 'ok',
    message: '¡Servidor Node.js activo y funcionando!',
    timestamp: new Date().toISOString()
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT} (http://localhost:${PORT})`);
});
