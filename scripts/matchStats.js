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

function processPlayer(playerEntry, teamId, assistsMap) {
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
        penaltiParado: 0,
        asistencias: assistsMap[String(p.id)] || 0
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

export async function fetchLiveIncidents(eventId) {
  const data = await fetchSofascore(`https://www.sofascore.com/api/v1/event/${eventId}/incidents`).catch(() => null);
  const out = [];
  for (const i of data?.incidents || []) {
    if (i.incidentType === 'substitution') out.push({ key: `sub-${i.time ?? ''}-${i.playerIn?.id ?? ''}`, tipo: 'sub', minuto: i.time ?? 0, teamId: i.team?.id, playerId: i.playerIn?.id, playerName: i.playerIn?.name });
    else if (i.incidentType === 'card') out.push({ key: `card-${i.time ?? ''}-${i.player?.id ?? ''}-${i.incidentClass ?? ''}`, tipo: 'card', minuto: i.time ?? 0, teamId: i.team?.id, playerId: i.player?.id, playerName: i.player?.name });
  }
  return out.slice(-20);
}

export async function fetchEventInfo(eventId) {
    const eventData = await fetchSofascore(`https://www.sofascore.com/api/v1/event/${eventId}`);
    const ev = eventData?.event || {};
    const homeGoles = ev.homeScore?.display ?? 0;
    const awayGoles = ev.awayScore?.display ?? 0;
    return extractLiveMeta(eventData, homeGoles, awayGoles);
}

export function buildTeamStats(goles, tandaPenaltis) {
    const stats = { goles };
    if (tandaPenaltis !== undefined) {
        stats.tandaPenaltis = tandaPenaltis;
    }
    return stats;
}

export async function scrapMatchStats(eventId) {
    const eventUrl = `https://www.sofascore.com/api/v1/event/${eventId}`;
    const lineupsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/lineups`;
    const incidentsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/incidents`;
    const fantasyUrl = `https://www.sofascore.com/api/v1/fantasy/event/${eventId}`;

    const [eventData, lineupsData, incidentsData, fantasyData] = await Promise.all([
        fetchSofascore(eventUrl),
        fetchSofascore(lineupsUrl),
        fetchSofascore(incidentsUrl).catch(() => null),
        fetchSofascore(fantasyUrl).catch(() => null)
    ]);

    const assistsMap = {};
    if (fantasyData?.playerStatistics) {
        for (const ps of fantasyData.playerStatistics) {
            const assistsStat = ps.statistics?.find(s => s.key === 'assists');
            if (assistsStat) {
                assistsMap[String(ps.playerId)] = parseInt(assistsStat.value, 10) || 0;
            }
        }
    }

    const ev = eventData.event;
    const homeTeamId = ev.homeTeam?.id;
    const awayTeamId = ev.awayTeam?.id;
    const homeId = String(homeTeamId);
    const awayId = String(awayTeamId);

    const homePlayers = (lineupsData.home?.players || []).map(p => processPlayer(p, homeTeamId, assistsMap));
    const awayPlayers = (lineupsData.away?.players || []).map(p => processPlayer(p, awayTeamId, assistsMap));

    const allPlayers = [...homePlayers, ...awayPlayers];

    const goalkeepers = allPlayers.filter(p => p.posicion === 'G' && p.minutos > 0);
    const gkStatsPromises = goalkeepers.map(async (gk) => {
        const penaltySave = await fetchPlayerStatistics(eventId, gk.id);
        gk.penaltiParado = penaltySave;
    });
    await Promise.all(gkStatsPromises);

    const { penaltiesScored, goalsByGoalkeeper } = processIncidents(incidentsData);
    const homeGoals = ev.homeScore?.display ?? 0;
    const awayGoals = ev.awayScore?.display ?? 0;

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

    const homeTeamStats = buildTeamStats(homeGoals, ev.homeScore?.penalties);
    const awayTeamStats = buildTeamStats(awayGoals, ev.awayScore?.penalties);

    return {
        [homeId]: homeTeamStats,
        [awayId]: awayTeamStats,
        jugadores: allPlayers
    };
}
export function extractLiveMeta(eventData, homeGoals, awayGoals) {
  const ev = eventData?.event || {};
  const type = String(ev.status?.type || '').toLowerCase();
  const desc = String(ev.status?.description || '').toLowerCase();
  let estado = 'live';
  if (type === 'finished' || type === 'ft' || desc.includes('finished') || desc.includes('full')) estado = 'finalizado';
  else if (type === 'halftime' || type === 'ht' || desc.includes('half-time') || desc.includes('halftime')) estado = 'descanso';
  const minuto = Number(ev.time?.minute ?? ev.minute ?? 0) || 0;
  return {
    estado,
    minuto,
    homeTeamId: ev.homeTeam?.id,
    awayTeamId: ev.awayTeam?.id,
    homeGoles: homeGoals ?? 0,
    awayGoles: awayGoals ?? 0
  };
}
