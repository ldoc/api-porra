import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTeamStats,
    fetchMatchData,
    scrapMatchSource,
    resolveGkPenalties,
    penaltyIncidentIds
} from '../scripts/matchStats.js';

function eventData() {
    return {
        event: {
            status: { type: 'inprogress', code: 6 },
            lastPeriod: 'period1',
            time: { currentPeriodStartTimestamp: 1791910027 },
            homeTeam: { id: 1 },
            awayTeam: { id: 2 },
            homeScore: { display: 0 },
            awayScore: { display: 0 }
        }
    };
}

function lineupsWithRating(rating) {
    return {
        home: { players: [
            { player: { id: 11 }, position: 'M', substitute: false, statistics: { rating, minutesPlayed: 60 } }
        ] },
        away: { players: [
            { player: { id: 21 }, position: 'M', substitute: false, statistics: { rating: 6.5, minutesPlayed: 60 } }
        ] }
    };
}

test('fetchMatchData pide lineups fresco cada tick aunque fantasy esté cacheado', async () => {
    let rating = 7.0;
    let lineupsCalls = 0;
    let fantasyCalls = 0;
    const fetchers = {
        fetchEvent: async () => eventData(),
        fetchIncidents: async () => ({ incidents: [] }),
        fetchFantasy: async () => { fantasyCalls++; return { playerStatistics: [] }; },
        fetchLineups: async () => { lineupsCalls++; return lineupsWithRating(rating); }
    };
    const warmFantasy = { playerStatistics: [] };

    const tick1 = await fetchMatchData(101, { fantasyData: warmFantasy, fetchers });
    const obs1 = await scrapMatchSource(101, tick1);
    rating = 8.0;
    const tick2 = await fetchMatchData(101, { fantasyData: warmFantasy, fetchers });
    const obs2 = await scrapMatchSource(101, tick2);

    assert.equal(lineupsCalls, 2);
    assert.equal(fantasyCalls, 0);
    assert.equal(obs1.ratings[11], 7.0);
    assert.equal(obs2.ratings[11], 8.0);
});

test('fetchMatchData registra fallos de incidents/fantasy y reintenta en el siguiente tick', async () => {
    let incidentsFail = true;
    const fetchers = {
        fetchEvent: async () => eventData(),
        fetchIncidents: async () => {
            if (incidentsFail) throw new Error('HTTP 503');
            return { incidents: [] };
        },
        fetchFantasy: async () => ({ playerStatistics: [] }),
        fetchLineups: async () => lineupsWithRating(7.0)
    };
    const failed = await fetchMatchData(102, { fetchers });
    assert.equal(failed.incidentsData, null);
    assert.deepEqual(failed.failures, [{ endpoint: 'incidents', message: 'HTTP 503' }]);

    incidentsFail = false;
    const retried = await fetchMatchData(102, { fetchers });
    assert.deepEqual(retried.failures, []);
    assert.deepEqual(retried.incidentsData, { incidents: [] });
});

test('penaltyIncidentIds detecta solo incidencias de penalti', () => {
    const data = { incidents: [
        { id: 1, incidentType: 'inGamePenalty', incidentClass: 'missed' },
        { id: 2, incidentType: 'goal', incidentClass: 'penalty' },
        { id: 3, incidentType: 'card', incidentClass: 'yellow' }
    ] };
    assert.deepEqual([...penaltyIncidentIds(data)], ['1', '2']);
});

test('resolveGkPenalties cachea solo fetches correctos y refresca con un penalti nuevo', async () => {
    const cache = new Map();
    const seen = new Map();
    const gk = { id: 12, penaltiParado: 0 };
    let calls = 0;
    let fail = true;
    const fetchStats = async () => {
        calls++;
        return fail ? { ok: false } : { ok: true, value: calls };
    };

    const first = await resolveGkPenalties({
        eventId: 200, goalkeepers: [gk],
        incidentsData: { incidents: [{ id: 1, incidentType: 'inGamePenalty' }] },
        cache, seen, fetchStats
    });
    assert.equal(first.allOk, false);
    assert.equal(cache.has('200:12'), false);
    assert.equal(gk.penaltiParado, 0);

    fail = false;
    const second = await resolveGkPenalties({
        eventId: 200, goalkeepers: [gk],
        incidentsData: { incidents: [{ id: 1, incidentType: 'inGamePenalty' }] },
        cache, seen, fetchStats
    });
    assert.equal(second.allOk, true);
    assert.equal(cache.get('200:12').value, 2);
    assert.equal(gk.penaltiParado, 2);

    const before = calls;
    await resolveGkPenalties({
        eventId: 200, goalkeepers: [gk],
        incidentsData: { incidents: [{ id: 1, incidentType: 'inGamePenalty' }] },
        cache, seen, fetchStats
    });
    assert.equal(calls, before, 'mismo penalti no debe refrescar');

    fail = true;
    const failedRefresh = await resolveGkPenalties({
        eventId: 200, goalkeepers: [gk],
        incidentsData: { incidents: [
            { id: 1, incidentType: 'inGamePenalty' },
            { id: 2, incidentType: 'inGamePenalty' }
        ] },
        cache, seen, fetchStats
    });
    assert.equal(failedRefresh.allOk, false);
    assert.equal(gk.penaltiParado, 2, 'mantiene el ultimo valor conocido');

    fail = false;
    await resolveGkPenalties({
        eventId: 200, goalkeepers: [gk],
        incidentsData: { incidents: [
            { id: 1, incidentType: 'inGamePenalty' },
            { id: 2, incidentType: 'inGamePenalty' }
        ] },
        cache, seen, fetchStats
    });
    assert.equal(gk.penaltiParado, 4);
    assert.equal(calls, before + 2);
});

test('incluye tandaPenaltis cuando hay tanda', () => {
    assert.deepEqual(buildTeamStats(2, 4), { goles: 2, tandaPenaltis: 4 });
});

test('omite tandaPenaltis cuando no hubo tanda', () => {
    assert.deepEqual(buildTeamStats(2, undefined), { goles: 2 });
});

test('conserva tandaPenaltis 0 cuando Sofascore lo expone', () => {
    assert.deepEqual(buildTeamStats(2, 0), { goles: 2, tandaPenaltis: 0 });
});
