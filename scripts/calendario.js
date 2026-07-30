import https from 'https';
import fs from 'node:fs';

// Configurar ciphers específicos de Chrome para pasar el filtro de huella TLS
const chromeCiphers = [
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305'
].join(':');

function fetchSofascore(endpointUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(endpointUrl);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
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
        reject(new Error(`Petición fallida con código HTTP ${res.statusCode}`));
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
          reject(new Error('Error al parsear la respuesta JSON: ' + e.message));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

async function obtenerCalendario() {
  try {
    //https://www.sofascore.com/api/v1/unique-tournament/7/season/76953/events/round/1
    // hay 8 rondas en la fase de grupos
    let partidosArray = [];
    for (let i = 1; i <= 8; i++) {
      const url = `https://www.sofascore.com/api/v1/unique-tournament/7/season/76953/events/round/${i}`;
      const data = await fetchSofascore(url);
      const partidos = data.events.map(p => ({
        ronda: i,
        id: p.id,
        fecha: p.startTimestamp,
        equipoLocal: {
          id: p.homeTeam.id,
          name: p.homeTeam.name
        },
        equipoVisitante: {
          id: p.awayTeam.id,
          name: p.awayTeam.name
        }
      }));
      console.log('\n✅ JSON obtenido con éxito (' + partidos.length + ' partidos)');
      // guardamos el json en un archivo llamado calendar.json
      partidosArray.push(...partidos);
    }
    await fs.writeFileSync(`data/sofascore/calendar.json`, JSON.stringify(partidosArray, null, 2));
    return partidosArray;
  }  catch (error) {
    console.error('❌ Error:', error.message);
  }
}

obtenerCalendario();
