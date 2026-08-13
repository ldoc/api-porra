# Diseño: Campo `tandaPenaltis` en matchstats

## Contexto

La función `scrapMatchStats` de `scripts/matchStats.js` extrae estadísticas de los partidos de Sofascore y su valor de retorno se guarda en la colección `matchstats` de MongoDB (vía `GET /api/match-stats/:eventId` en `server.js`).

Actualmente el return tiene esta forma:

```js
return {
    [homeId]: { goles: homeGoals },
    [awayId]: { goles: awayGoals },
    jugadores: allPlayers
};
```

Se quiere registrar si el partido se decidió en tanda de penaltis. Sofascore expone la puntuación de la tanda en `homeScore.penalties` y `awayScore.penalties` (p.ej. 4 y 3).

## Cambio

En `scripts/matchStats.js` (función `scrapMatchStats`):

1. Extraer la puntuación de la tanda de penaltis de cada equipo:
   - `const homePenalties = ev.homeScore?.penalties;`
   - `const awayPenalties = ev.awayScore?.penalties;`

2. Construir el objeto de cada equipo añadiendo el campo `tandaPenaltis` **solo cuando exista** el campo `penalties` en Sofascore:

```js
const homeTeamStats = { goles: homeGoals };
const awayTeamStats = { goles: awayGoals };
if (homePenalties !== undefined) homeTeamStats.tandaPenaltis = homePenalties;
if (awayPenalties !== undefined) awayTeamStats.tandaPenaltis = awayPenalties;
```

3. Devolver:

```js
return {
    [homeId]: homeTeamStats,
    [awayId]: awayTeamStats,
    jugadores: allPlayers
};
```

## Comportamiento esperado

- Partido decidido en tanda (p.ej. 4-3): `{ "42": { "goles": 2, "tandaPenaltis": 4 }, "2825": { "goles": 0, "tandaPenaltis": 3 }, "jugadores": [...] }`
- Partido sin tanda: `{ "42": { "goles": 2 }, "2825": { "goles": 0 }, "jugadores": [...] }` (campo omitido)

## Impacto

- `server.js` no requiere cambios: guarda directamente el return de `scrapMatchStats` en MongoDB.
- El modelo `MatchStats` (`db/models/MatchStats.js`) usa `type: Mixed` para `stats`, por lo que no requiere cambios.
- Los consumidores existentes (cálculo de puntos, frontend) no se ven afectados: solo se añade un campo nuevo cuando aplica.
