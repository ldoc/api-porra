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

// PNG transparente 1x1 como placeholder cuando no hay imagen
const EMPTY_IMAGE = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

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
          resolve(EMPTY_IMAGE);
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

async function obtenerJugadores() {
    try {
        console.log('Obteniendo json de equipos');
        let equipos = JSON.parse(fs.readFileSync('data/sofascore/teams.json', 'utf-8'));
        let jugadoresAdd = [];
        for (let i = 0; i < equipos.length; i++) {
            console.log('procesando: ' + equipos[i].nombre + ' --> faltan: ' + (equipos.length - i));
            const url = 'https://www.sofascore.com/api/v1/team/' + equipos[i].id + '/players';
            console.log(url);
            let jugadoresEquipo = await fetchSofascore(url);
            let jugadores = [];
            for (let j = 0; j < jugadoresEquipo.players.length; j++) {
                const jugador = jugadoresEquipo.players[j];
                // recuperamos la imagen del jugador (https://img.sofascore.com/api/v1/player/922573/image)
                const image = await fetchSofascoreImage(`https://img.sofascore.com/api/v1/player/${jugador.player.id}/image`);
                const ext = extensionFromImageBuffer(image);
                fs.writeFileSync(`data/sofascore/imgJugadores/${jugador.player.id}.${ext}`, image);
                jugadores.push({
                    id: jugador.player.id,
                    nombre: jugador.player.name,
                    posicion: jugador.player.position,
                    club: jugador.player.team.name,
                    equipo: equipos[i].id
                });
            };
            console.log('------------------------------')
            jugadoresAdd = jugadoresAdd.concat(jugadores);
        }
        console.log('\n✅ JSON obtenido con éxito (' + equipos.length + ' equipos)');
        // guardamos el json en un ar   chivo llamado equipos.json
        await fs.writeFileSync('data/sofascore/jugadores.json', JSON.stringify(jugadoresAdd, null, 2));
        return jugadoresAdd;
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

obtenerJugadores();
