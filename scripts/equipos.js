import https from 'https';
import fs from 'node:fs';
import sharp from 'sharp';

const url = 'https://www.sofascore.com/api/v1/unique-tournament/7/season/96518/standings/total';

// Configurar ciphers específicos de Chrome para pasar el filtro de huella TLS
const chromeCiphers = [
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305'
].join(':');

// PNG transparente 1x1 como placeholder cuando no hay imagen
const EMPTY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const EMPTY_IMAGE_WEBP = await sharp(EMPTY_IMAGE).webp({ quality: 85 }).toBuffer();

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

// creamos una función para obtener la imagen del escudo del equipo teniendo en cuenta la funcion anterior para evitar response 403
function fetchSofascoreImage(urlImagen) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlImagen);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      ciphers: chromeCiphers,
      honorCipherOrder: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com'
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];

      if (res.statusCode === 404) {
        res.resume();
        resolve(EMPTY_IMAGE_WEBP);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Petición fallida con código HTTP ${res.statusCode}`));
        return;
      }

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

function extensionFromImageBuffer(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'png';
}

async function toWebpBuffer(buffer) {
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return buffer;
  }
  return await sharp(buffer).webp({ quality: 85 }).toBuffer();
}

async function obtenerEquipos() {
  try {
    const data = await fetchSofascore(url);
    /*const equipos = data.standings[0].rows.map(row => ({
      idCompetition: row.id,
      name: row.team.name,
      id: row.team.id
    }));*/
    let equipos = [];
    for (const equipo of data.standings[0].rows) {
      // recuperamos la imagen del escudo del equipo (https://img.sofascore.com/api/v1/team/42/image)
      const image = await fetchSofascoreImage(`https://img.sofascore.com/api/v1/team/${equipo.team.id}/image`);
      const webp = await toWebpBuffer(image);
      fs.writeFileSync(`data/sofascore/imgEquipos/${equipo.team.id}.webp`, webp);
      equipos.push({
        idCompetition: equipo.id,
        name: equipo.team.name,
        id: equipo.team.id,
      });
    }
    console.log('\n✅ JSON obtenido con éxito (' + equipos.length + ' equipos)');
    // guardamos el json en un archivo llamado equipos.json
    await fs.writeFileSync('data/sofascore/teams.json', JSON.stringify(equipos, null, 2));
    return equipos;
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

obtenerEquipos();
