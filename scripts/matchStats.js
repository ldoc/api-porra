import { fetchSofascore } from './sofascoreHttp.js';
import { liveMinute } from '../api/live.js';

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

export function buildTeamStats(goles, tandaPenaltis) {
    const stats = { goles };
    if (tandaPenaltis !== undefined) {
        stats.tandaPenaltis = tandaPenaltis;
    }
    return stats;
}

export function buildAssistsMap(fantasyData) {
    const assists = {};
    if (fantasyData?.playerStatistics) {
        for (const ps of fantasyData.playerStatistics) {
            const a = ps.statistics?.find(s => s.key === 'assists');
            if (a) assists[String(ps.playerId)] = parseInt(a.value, 10) || 0;
        }
    }
    return assists;
}

export async function scrapMatchFull(eventId) {
    const eventUrl = `https://www.sofascore.com/api/v1/event/${eventId}`;
    const lineupsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/lineups`;
    const incidentsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/incidents`;
    const fantasyUrl = `https://www.sofascore.com/api/v1/fantasy/event/${eventId}`;

    const [eventData, incidentsData, fantasyData] = await Promise.all([
        fetchSofascore(eventUrl),
        fetchSofascore(incidentsUrl).catch(() => null),
        fetchSofascore(fantasyUrl).catch(() => null)
    ]);

    const ev = eventData.event;
    const notStarted = ev.status?.type === 'notstarted' || ev.status?.type === 'willsoonstart';
    let lineupsData = null;
    try {
        lineupsData = await fetchSofascore(lineupsUrl);
    } catch (e) {
        if (!notStarted) throw e;
    }

    const assistsMap = buildAssistsMap(fantasyData);

    const homeTeamId = ev.homeTeam?.id;
    const awayTeamId = ev.awayTeam?.id;
    const homeId = String(homeTeamId);
    const awayId = String(awayTeamId);

    const homePlayers = (lineupsData?.home?.players || []).map(p => processPlayer(p, homeTeamId, assistsMap));
    const awayPlayers = (lineupsData?.away?.players || []).map(p => processPlayer(p, awayTeamId, assistsMap));

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

    const stats = {
        [homeId]: homeTeamStats,
        [awayId]: awayTeamStats,
        jugadores: allPlayers
    };

    return {
        stats,
        statusType: ev.status?.type ?? null,
        statusCode: ev.status?.code ?? null,
        minute: liveMinute(ev.lastPeriod, ev.time?.currentPeriodStartTimestamp, Math.floor(Date.now() / 1000))
    };
}

export async function scrapMatchStats(eventId) {
    const { stats } = await scrapMatchFull(eventId);
    return stats;
}

export function normalizeIncidents(incidentsData, homeTeamId, awayTeamId) {
    const out = [];
    for (const inc of incidentsData?.incidents || []) {
        const teamId = inc.isHome ? homeTeamId : awayTeamId;
        const base = { sourceId: String(inc.id), time: inc.time ?? null, addedTime: inc.addedTime ?? null, teamId };
        switch (inc.incidentType) {
            case 'goal':
                out.push({ ...base, type: 'goal', class: inc.incidentClass,
                    playerId: inc.player?.id ?? null,
                    assistId: inc.footballPassingNetworkAction?.[0]?.player?.id ?? null,
                    homeScore: inc.homeScore ?? null, awayScore: inc.awayScore ?? null, isHome: !!inc.isHome });
                break;
            case 'inGamePenalty':
                if (inc.incidentClass === 'missed') {
                    out.push({ ...base, type: 'penalty_saved', keeperId: inc.footballPassingNetworkAction?.[0]?.goalkeeper?.id ?? null, takerId: inc.player?.id ?? null });
                    out.push({ ...base, type: 'penalty_missed', takerId: inc.player?.id ?? null, sourceId: String(inc.id) + '-taker' });
                }
                break;
            case 'card':
                out.push({ ...base, type: 'card', class: inc.incidentClass, cardType: inc.incidentClass, playerId: inc.player?.id ?? null });
                break;
            case 'substitution':
                out.push({ ...base, type: 'substitution', inId: inc.playerIn?.id ?? null, outId: inc.playerOut?.id ?? null });
                break;
            case 'varDecision':
                if (inc.incidentClass === 'goalDisallowed') {
                    out.push({ ...base, type: 'goal_cancelled', class: inc.incidentClass, playerId: inc.player?.id ?? null });
                }
                break;
            default:
                break;
        }
    }
    return out;
}

export async function scrapMatchSource(eventId) {
    const eventUrl = `https://www.sofascore.com/api/v1/event/${eventId}`;
    const lineupsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/lineups`;
    const incidentsUrl = `https://www.sofascore.com/api/v1/event/${eventId}/incidents`;
    const fantasyUrl = `https://www.sofascore.com/api/v1/fantasy/event/${eventId}`;

    const [eventData, incidentsData, fantasyData] = await Promise.all([
        fetchSofascore(eventUrl),
        fetchSofascore(incidentsUrl).catch(() => null),
        fetchSofascore(fantasyUrl).catch(() => null)
    ]);
    const ev = eventData.event;
    const homeTeamId = ev.homeTeam?.id;
    const awayTeamId = ev.awayTeam?.id;

    let lineupsData = null;
    try { lineupsData = await fetchSofascore(lineupsUrl); } catch (e) {
        const notStarted = ev.status?.type === 'notstarted' || ev.status?.type === 'willsoonstart';
        if (!notStarted) throw e;
    }

    const players = [...(lineupsData?.home?.players || []), ...(lineupsData?.away?.players || [])];
    const starters = players.filter(p => !p.substitute).map(p => p.player?.id).filter(Boolean);
    const ratings = {};
    const minutes = {};
    for (const p of players) {
        const id = p.player?.id;
        if (!id) continue;
        if (p.statistics?.rating != null) ratings[id] = p.statistics.rating;
        if (p.statistics?.minutesPlayed != null) minutes[id] = p.statistics.minutesPlayed;
    }

    return {
        eventId,
        status: null, // lo resuelve el scraper con liveStatusFromSofascore
        statusType: ev.status?.type ?? null,
        statusCode: ev.status?.code ?? null,
        minute: liveMinute(ev.lastPeriod, ev.time?.currentPeriodStartTimestamp, Math.floor(Date.now() / 1000)),
        period: ev.lastPeriod ?? null,
        score: { home: ev.homeScore?.display ?? 0, away: ev.awayScore?.display ?? 0 },
        homeTeamId, awayTeamId,
        starters, ratings, minutes,
        assists: buildAssistsMap(fantasyData),
        incidents: normalizeIncidents(incidentsData, homeTeamId, awayTeamId)
    };
}
