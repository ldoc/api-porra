const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;

// Configuración de ciphers de Chrome para evitar el bloqueo 403 de Sofascore
const chromeCiphers = [
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305'
].join(':');

function fetchSofascoreLineups(eventId) {
  return new Promise((resolve, reject) => {
    const targetUrl = `https://www.sofascore.com/api/v1/event/${eventId}/lineups`;
    const parsedUrl = new URL(targetUrl);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname,
      method: 'GET',
      ciphers: chromeCiphers,
      honorCipherOrder: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      if (res.statusCode !== 200) {
        reject(new Error(`Sofascore respondió con estado HTTP ${res.statusCode}`));
        return;
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error('Error al parsear la respuesta JSON de Sofascore'));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  // Endpoint /hola
  if (reqUrl.pathname === '/hola') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('adios');
    return;
  }

  // Endpoint para obtener alineaciones por ID de partido:
  // Admite ambos formatos: /lineups/16350227 o /lineups?id=16350227
  const matchPath = reqUrl.pathname.match(/^\/lineups\/([a-zA-Z0-9]+)$/);
  const eventId = matchPath ? matchPath[1] : (reqUrl.pathname === '/lineups' ? reqUrl.searchParams.get('id') : null);

  if (eventId) {
    try {
      const data = await fetchSofascoreLineups(eventId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Respuesta por defecto si no coincide con los endpoints anteriores
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    status: 'ok',
    message: '¡Servidor Node.js activo y funcionando!',
    endpoints: {
      hola: '/hola',
      lineups: '/lineups/:id (ejemplo: /lineups/16350227)'
    },
    timestamp: new Date().toISOString()
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT} (http://localhost:${PORT})`);
});
