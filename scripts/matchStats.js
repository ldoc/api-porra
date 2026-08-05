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

function processPlayer(playerEntry, teamId) {
    const p = playerEntry.player;
    const s = playerEntry.statistics || {};

    return {
        id: String(p.id),
        nombre: p.name,
        posicion: playerEntry.position,
        equipo: teamId,
        puntos: s.rating || 0,
        goles: s.goals || 0,
        minutos: s.minutesPlayed || 0,
        paradas: s.saves || 0,
        esSuplente: playerEntry.substitute || false,
        penaltiMarcado: 0,
        penaltiParado: 0
    };
}

async function fetchPlayerStatistics(eventId, playerId) {
    const statsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/player/${playerId}/statistics`;
    try {
        const data = await fetchSofascore(statsUrl);
        return data?.statistics?.penaltySave || 0;
    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return 0;
        }
        console.error(`Error obteniendo stats del jugador ${playerId}:`, error.message);
        return 0;
    }
}

function processIncidents(incidentsData) {
    const penaltiesScored = {};
    const penaltiesSaved = {};
    const goalsByGoalkeeper = {};

    if (!incidentsData || !incidentsData.incidents) {
        return { penaltiesScored, penaltiesSaved, goalsByGoalkeeper };
    }

    for (const incident of incidentsData.incidents) {
        if (incident.incidentType === 'goal' && incident.incidentClass === 'penalty') {
            const pid = String(incident.player?.id);
            if (pid) penaltiesScored[pid] = (penaltiesScored[pid] || 0) + 1;
        }

        if (incident.incidentType === 'inGamePenalty' && incident.incidentClass === 'missed') {
            const gk = incident.footballPassingNetworkAction?.[0]?.goalkeeper;
            if (gk) {
                const gkId = String(gk.id);
                penaltiesSaved[gkId] = (penaltiesSaved[gkId] || 0) + 1;
            }
        }

        if (incident.incidentType === 'goal') {
            const gk = incident.footballPassingNetworkAction?.[0]?.goalkeeper;
            if (gk) {
                const gkId = String(gk.id);
                goalsByGoalkeeper[gkId] = (goalsByGoalkeeper[gkId] || 0) + 1;
            }
        }
    }

    return { penaltiesScored, penaltiesSaved, goalsByGoalkeeper };
}

export async function scrapMatchStats(eventId) {
    const eventUrl = `https://www.sofascore.com/api/v1/event/${eventId}`;
    const lineupsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/lineups`;
    const incidentsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/incidents`;

    const [eventData, lineupsData, incidentsData] = await Promise.all([
        fetchSofascore(eventUrl),
        fetchSofascore(lineupsUrl),
        fetchSofascore(incidentsUrl).catch(() => null)
    ]);

    const ev = eventData.event;
    const homeTeamId = ev.homeTeam?.id;
    const awayTeamId = ev.awayTeam?.id;
    const homeId = String(homeTeamId);
    const awayId = String(awayTeamId);

    const homePlayers = (lineupsData.home?.players || []).map(p => processPlayer(p, homeTeamId));
    const awayPlayers = (lineupsData.away?.players || []).map(p => processPlayer(p, awayTeamId));

    const allPlayers = [...homePlayers, ...awayPlayers];

    const goalkeepers = allPlayers.filter(p => p.posicion === 'G' && p.minutos > 0);
    const gkStatsPromises = goalkeepers.map(async (gk) => {
        const penaltySave = await fetchPlayerStatistics(eventId, gk.id);
        gk.penaltiParado = penaltySave;
    });
    await Promise.all(gkStatsPromises);

    const { penaltiesScored, goalsByGoalkeeper } = processIncidents(incidentsData);
    const homeGoals = ev.homeScore?.current ?? 0;
    const awayGoals = ev.awayScore?.current ?? 0;

    for (const player of allPlayers) {
        player.penaltiMarcado = penaltiesScored[player.id] || 0;
        if (player.posicion === 'G') {
            player.golesRecibidos = goalsByGoalkeeper[player.id] || 0;
        }
    }

    // Asignar goles no atribuidos a porteros identificados
    // Los goles que recibe el portero del equipo local son los del visitante, y viceversa
    const homeGks = allPlayers.filter(p => p.posicion === 'G' && p.equipo === homeTeamId && p.minutos > 0);
    const awayGks = allPlayers.filter(p => p.posicion === 'G' && p.equipo === awayTeamId && p.minutos > 0);

    const homeGksAttributed = homeGks.reduce((sum, g) => sum + (g.golesRecibidos || 0), 0);
    const awayGksAttributed = awayGks.reduce((sum, g) => sum + (g.golesRecibidos || 0), 0);

    // Porteros locales reciben goles del visitante
    const homeMissing = awayGoals - homeGksAttributed;
    // Porteros visitantes reciben goles del local
    const awayMissing = homeGoals - awayGksAttributed;

    if (homeMissing > 0 && homeGks.length > 0) {
        const mainGk = homeGks.sort((a, b) => b.minutos - a.minutos)[0];
        mainGk.golesRecibidos = (mainGk.golesRecibidos || 0) + homeMissing;
    }

    if (awayMissing > 0 && awayGks.length > 0) {
        const mainGk = awayGks.sort((a, b) => b.minutos - a.minutos)[0];
        mainGk.golesRecibidos = (mainGk.golesRecibidos || 0) + awayMissing;
    }

    return {
        [homeId]: { goles: homeGoals },
        [awayId]: { goles: awayGoals },
        jugadores: allPlayers
    };
}
