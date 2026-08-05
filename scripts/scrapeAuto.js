#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import http from 'http';

const STATE_FILE = new URL('./scrapeState.json', import.meta.url).pathname;
const CALENDAR_FILE = '/home/ldoc/Proyectos/porra-spa/data/calendar.json';
const API_BASE = 'http://localhost:3000';
const INTERVAL_MS = 60_000;

function loadState() {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }
  return { lastIndex: 0 };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function fetchLocal(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'GET',
      timeout: 30_000
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Respuesta no válida'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeOne(matchId, index, total) {
  const prefix = `[${index + 1}/${total}]`;
  try {
    const data = await fetchLocal(`${API_BASE}/api/match-stats/${matchId}`);
    const home = Object.keys(data).find(k => k !== 'jugadores');
    const away = Object.keys(data).filter(k => k !== 'jugadores')[1];
    const goles = `${data[home]?.goles ?? '?'} - ${data[away]?.goles ?? '?'}`;
    console.log(`${prefix} ✔ ${matchId} → ${goles}`);
    return true;
  } catch (err) {
    console.log(`${prefix} ✘ ${matchId} → ERROR: ${err.message}`);
    return false;
  }
}

async function main() {
  const calendar = JSON.parse(readFileSync(CALENDAR_FILE, 'utf-8'));
  const matchIds = calendar.map(m => m.id);
  const total = matchIds.length;
  const state = loadState();

  if (state.lastIndex >= total) {
    console.log(`Ya se han scrapeado los ${total} partidos.`);
    return;
  }

  console.log(`Scrapeo automático: 1 partido cada ${INTERVAL_MS / 1000}s`);
  console.log(`Inicio en índice ${state.lastIndex}/${total}\n`);

  let index = state.lastIndex;

  while (index < total) {
    const matchId = matchIds[index];
    await scrapeOne(matchId, index, total);
    index++;
    saveState({ lastIndex: index });

    if (index < total) {
      await sleep(INTERVAL_MS);
    }
  }

  console.log(`\n¡Completado! Se scrapearon todos los ${total} partidos.`);
}

main();
