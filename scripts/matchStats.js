import https from 'https';

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
            if (res.statusCode === 404) {
                res.resume();
                reject(new Error('NOT_FOUND'));
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`Petición fallida con código HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Error al parsear la respuesta JSON: ' + e.message));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function processPlayer(playerEntry) {
    const p = playerEntry.player;
    const s = playerEntry.statistics || {};

    return {
        id: String(p.id),
        nombre: p.name,
        puntos: s.rating || 0
    };
}

export async function scrapMatchStats(eventId) {
    const eventUrl = `https://www.sofascore.com/api/v1/event/${eventId}`;
    const lineupsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/lineups`;

    const [eventData, lineupsData] = await Promise.all([
        fetchSofascore(eventUrl),
        fetchSofascore(lineupsUrl)
    ]);

    const ev = eventData.event;
    const homeId = String(ev.homeTeam?.id);
    const awayId = String(ev.awayTeam?.id);

    const homePlayers = (lineupsData.home?.players || []).map(processPlayer);
    const awayPlayers = (lineupsData.away?.players || []).map(processPlayer);

    return {
        [homeId]: { goles: ev.homeScore?.current ?? 0 },
        [awayId]: { goles: ev.awayScore?.current ?? 0 },
        jugadores: [...homePlayers, ...awayPlayers]
    };
}
