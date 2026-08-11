import https from 'https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const chromeCiphers = [
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305'
].join(':');

const SOFA_BASE = 'https://www.sofascore.com/api/v1';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _fetchRaw(endpointUrl) {
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

async function fetchSofascore(endpointUrl, reintentos = 3) {
  for (let intento = 1; intento <= reintentos; intento++) {
    try {
      return await _fetchRaw(endpointUrl);
    } catch (err) {
      if (intento === reintentos) throw err;
      console.log(`    ⚠️ Intento ${intento} fallido, reintentando en 2s...`);
      await delay(2000);
    }
  }
}

function buildUrl(template, params) {
  let url = template;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`{${key}}`, value);
  }
  return SOFA_BASE + url;
}

function mapEvent(p, fase, ronda) {
  return {
    ronda,
    fase,
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
  };
}

async function obtenerFase(faseNombre, faseConfig, config, rondaEspecifica = null) {
  const params = {
    tournamentId: config.tournamentId,
    seasonId: config.seasonId
  };

  if (faseConfig.tipo === 'rondas') {
    const partidos = [];
    const inicio = rondaEspecifica || 1;
    const fin = rondaEspecifica || faseConfig.rondas;
    for (let ronda = inicio; ronda <= fin; ronda++) {
      if (ronda > inicio) await delay(1500);
      const url = buildUrl(faseConfig.urlTemplate, { ...params, ronda });
      console.log(`  ⚽ Ronda ${ronda}: ${url}`);
      const data = await fetchSofascore(url);
      const faseValue = faseConfig.faseValue || faseNombre;
      const mapped = data.events.map(p => mapEvent(p, faseValue, ronda));
      partidos.push(...mapped);
      console.log(`  ✅ Ronda ${ronda}: ${mapped.length} partidos`);
    }
    return partidos;
  } else {
    const url = buildUrl(faseConfig.urlTemplate, {
      ...params,
      roundId: faseConfig.roundId,
      slug: faseConfig.slug
    });
    const faseValue = faseConfig.faseValue || faseNombre;
    console.log(`  ⚽ ${faseNombre} (${faseValue}): ${url}`);
    const data = await fetchSofascore(url);
    const mapped = data.events.map(p => mapEvent(p, faseValue, 1));
    console.log(`  ✅ ${faseNombre}: ${mapped.length} partidos`);
    return mapped;
  }
}

async function obtenerCalendario(fasesSolicitadas = null) {
  const configPath = path.join(PROJECT_ROOT, 'data', 'sofascore', 'seasonConfig.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Parsear fases: puede ser "liga", "liga:3", o null
  const fasesParseadas = (fasesSolicitadas || Object.keys(config.fases)).map(f => {
    const [nombre, ronda] = f.split(':');
    return { nombre, ronda: ronda ? parseInt(ronda) : null };
  });

  // Leer calendario existente
  const calendarPath = path.join(PROJECT_ROOT, 'data', 'sofascore', 'calendar.json');
  let calendarioExistente = [];
  if (fs.existsSync(calendarPath)) {
    try {
      const contenido = fs.readFileSync(calendarPath, 'utf8').trim();
      if (contenido) {
        calendarioExistente = JSON.parse(contenido);
      }
    } catch (e) {
      console.warn('⚠️ calendar.json corrupto o vacío, empezando de cero');
    }
  }

  // Filtrar partidos que se van a reemplazar
  const nuevosPartidos = [];
  for (const { nombre: faseNombre, ronda: rondaEspecifica } of fasesParseadas) {
    const faseConfig = config.fases[faseNombre];
    if (!faseConfig) {
      console.error(`❌ Fase desconocida: ${faseNombre}`);
      continue;
    }

    if (rondaEspecifica) {
      // Solo eliminar partidos de esta fase+ronda concreta
      calendarioExistente = calendarioExistente.filter(p =>
        !(p.fase === faseNombre && p.ronda === rondaEspecifica)
      );
      console.log(`\n📡 Scrapeando fase: ${faseNombre} ronda ${rondaEspecifica}`);
    } else {
      // Eliminar TODOS los partidos de esta fase
      calendarioExistente = calendarioExistente.filter(p => {
        const faseDelPartido = p.fase || 'liga';
        return faseDelPartido !== faseNombre;
      });
      console.log(`\n📡 Scrapeando fase: ${faseNombre} (todas las rondas)`);
    }

    const partidos = await obtenerFase(faseNombre, faseConfig, config, rondaEspecifica);
    nuevosPartidos.push(...partidos);
  }

  // Merge: partidos no reemplazados + nuevos
  const calendarioFinal = [...calendarioExistente, ...nuevosPartidos];

  // Guardar en api-porra
  fs.writeFileSync(calendarPath, JSON.stringify(calendarioFinal, null, 2));
  console.log(`\n💾 Guardado: ${calendarPath} (${calendarioFinal.length} partidos total)`);

  // Copiar a porra-spa
  const porraSpaPath = path.join(PROJECT_ROOT, '..', 'porra-spa', 'data', 'calendar.json');
  if (fs.existsSync(path.dirname(porraSpaPath))) {
    fs.writeFileSync(porraSpaPath, JSON.stringify(calendarioFinal, null, 2));
    console.log(`📋 Copiado a: ${porraSpaPath}`);
  }

  return calendarioFinal;
}

// Si se ejecuta directamente
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const fasesArg = process.argv.slice(2);
  const fases = fasesArg.length > 0 ? fasesArg : null;
  obtenerCalendario(fases)
    .then(partidos => {
      console.log(`\n🎉 Completado: ${partidos.length} partidos en total`);
    })
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}

export { obtenerCalendario, obtenerFase, fetchSofascore };
