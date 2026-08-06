import { readFileSync } from 'fs';
import { connectDB, MatchStats } from '../db/index.js';
import { scrapMatchStats } from './matchStats.js';

const calendar = JSON.parse(readFileSync('./data/sofascore/calendar.json', 'utf8'));

// Get event IDs for rounds 2-8
const rounds2to8 = calendar.filter(m => m.ronda >= 2 && m.ronda <= 8);
const eventIds = rounds2to8.map(m => m.id);

console.log(`Found ${eventIds.length} matches for rounds 2-8`);

await connectDB();

// Check existing
const existing = await MatchStats.find({}, 'eventId');
const existingIds = new Set(existing.map(m => m.eventId));
const toScrape = eventIds.filter(id => !existingIds.has(id));

console.log(`Already in MongoDB: ${existingIds.size}`);
console.log(`To scrape: ${toScrape.length}`);

const delay = ms => new Promise(r => setTimeout(r, ms));

let scraped = 0;
let errors = 0;

for (const eventId of toScrape) {
  const match = rounds2to8.find(m => m.id === eventId);
  const label = `${match.equipoLocal.name} vs ${match.equipoVisitante.name}`;
  
  try {
    process.stdout.write(`[${scraped + 1}/${toScrape.length}] ${label}... `);
    const stats = await scrapMatchStats(eventId);
    
    await MatchStats.findOneAndUpdate(
      { eventId },
      { eventId, stats, lastUpdated: new Date() },
      { upsert: true }
    );
    
    scraped++;
    console.log('OK');
  } catch (err) {
    errors++;
    console.log(`ERROR: ${err.message}`);
  }
  
  // Delay between requests to avoid rate limiting
  await delay(1500);
}

console.log(`\nDone! Scraped: ${scraped}, Errors: ${errors}`);
process.exit(0);
