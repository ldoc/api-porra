# Instrucciones para Agentes IA - api-porra

> **Fases de la competición**: Ver [`data/fases.json`](data/fases.json) para la definición completa de las 13 fases (instrucciones, reglas-app).

## Índice

1. [Visión General](#visión-general)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Estructura del Proyecto](#estructura-del-proyecto)
4. [API Endpoints](#api-endpoints-serverjs)
5. [MongoDB](#mongodb)
6. [Funciones de Auth](#funciones-de-auth-apiauthjs)
7. [Funciones de Scraping](#funciones-de-scraping-scripts)
8. [Seguridad](#seguridad)
9. [Convenciones de Código](#convenciones-de-código)
10. [Datos de Sofascore](#datos-de-sofascore)
11. [Reglas de la Porra - Fase de Liga](#reglas-de-la-porra---fase-de-liga)
12. [Eliminatorias](#eliminatorias-predicciones-de-fase-final)
13. [Configuración](#configuración)
14. [Notas Importantes](#notas-importantes)

## Decisiones arquitectónicas

- **Persistencia en MongoDB Atlas** (mongoose) para usuarios, invitaciones, matchstats y configuración. No hay persistencia en GitHub desde la migración.
- **Control por fases (`faseJuego`)**: la fase actual en `GameConfig` determina edición (solo `FASE_PRETEMPORADA` para liga/plantilla/eliminatorias), visibilidad (fases `FASE_PRE*` ocultan datos de otros usuarios) y qué predicciones se pueden modificar.
- **Frontend y backend desacoplados**: el frontend conoce la fase vía `GET /api/config` y la envía en `X-Client-Phase`; el backend devuelve `PHASE_CHANGED` (409) si hay desfase.
- **Sofascore como única fuente de datos externa**; los endpoints de matchstats scrapean en vivo y cachean en Mongo (`matchstats`).

## Visión General

API REST en Node.js para gestionar datos de fútbol (Liga de Campeones). Obtiene datos de Sofascore y los almacena en MongoDB Atlas. Incluye sistema de autenticación de usuarios con JWT.

## Stack Tecnológico

- **Runtime**: Node.js (ES Modules)
- **Servidor**: `http` nativo (sin frameworks)
- **Base de datos**: MongoDB Atlas con Mongoose (modelos User, Invitation, MatchStats, GameConfig)
- **Fuente de datos**: Sofascore API (no oficial)
- **Autenticación**: JWT (jsonwebtoken) + hash de contraseñas con scrypt (crypto nativo)

## Estructura del Proyecto

```
api-porra/
├── server.js              # Servidor HTTP principal (enrutado de endpoints)
├── api/
│   ├── auth.js            # Módulo de autenticación y usuarios (register/login/squad)
│   ├── middleware.js      # Middlewares: authenticate, rateLimiter, seguridad, CORS
│   └── finalPredictions.js# Validación de predicciones de eliminatorias
├── db/
│   ├── connection.js      # Conexión a MongoDB
│   ├── index.js           # Exporta modelos
│   └── models/            # User, Invitation, MatchStats, GameConfig
├── scripts/
│   ├── calendario.js      # Scraping de calendario de partidos
│   ├── equipos.js         # Scraping de equipos + escudos
│   ├── jugadores.js       # Scraping de jugadores + fotos
│   ├── matchStats.js      # Scraping de estadísticas de partidos
│   └── ...                # Otros scripts de scraping/utilidades
├── data/
│   ├── fases.json         # Definición de las 13 fases de la competición
│   └── sofascore/
│       ├── calendar.json  # Calendario de partidos
│       ├── teams.json     # Equipos
│       ├── jugadores.json # Jugadores
│       ├── imgEquipos/    # Escudos (PNG/WEBP)
│       ├── imgJugadores/  # Fotos de jugadores (PNG/WEBP)
│       ├── partidos/      # Datos de partidos
│       └── seasonConfig.json # Configuración de temporada de Sofascore
├── tests/                 # Tests de validaciones (finalPredictions, matchStats)
└── package.json
```

## API Endpoints (server.js)

### Autenticación

| Método | Ruta                  | Descripción                                    |
|--------|-----------------------|------------------------------------------------|
| POST   | `/api/auth/register`  | Registrar nuevo usuario (username, password, invitationCode) |
| POST   | `/api/auth/login`     | Iniciar sesión (username, password)            |
| GET    | `/api/auth/profile`   | Obtener perfil de usuario (username)           |
| POST   | `/api/auth/profile`   | Guardar perfil de usuario (username, avatar)   |
| POST   | `/api/auth/change-password` | Cambiar contraseña (currentPassword, newPassword) |

### Plantilla Ideal

| Método | Ruta                  | Descripción                                    |
|--------|-----------------------|------------------------------------------------|
| GET    | `/api/squad`          | Obtener plantilla ideal del usuario (username) |
| PUT    | `/api/squad`          | Guardar plantilla ideal del usuario (username, squad) |
| GET    | `/api/squad/all`      | Obtener plantillas de todos los usuarios (para cálculo de puntos) |

### Predicciones

| Método | Ruta                  | Descripción                                    |
|--------|-----------------------|------------------------------------------------|
| GET    | `/api/predictions`    | Obtener predicciones de un usuario (username)  |
| PUT    | `/api/predictions`    | Guardar predicciones de un usuario (username, predictions). Bloqueado si predictionsConfirmed=true |
| POST   | `/api/predictions/confirm` | Confirmar pronósticos de liga (permanente, requiere 144 completos) |
| GET    | `/api/predictions/all`| Obtener predicciones, finalPredictions y plantillas de todos los usuarios (para cálculo de puntos) |

#### Sincronización de fase (cabecera `X-Client-Phase`)

- El frontend envía la cabecera `X-Client-Phase` con la fase que el cliente cree que está activa (`getFaseJuego()`).
- `checkPhaseConsistency` compara esa cabecera con la fase actual en MongoDB. Si difieren, responde **409** `{ ok:false, error:'PHASE_CHANGED', currentPhase, previousPhase }` para que el frontend recargue config y avise al usuario.
- Si la cabecera no viene, la petición continúa sin comprobación.

#### Validación de fase en PUT /api/predictions

- Fuera de `FASE_PRETEMPORADA`, solo se permite **modificar predicciones de la fase actual** (mapeo `faseJuego → fase de calendario`: `FASE_PRETEMPORADA`/`FASE_LIGA`→`liga`, `FASE_PRE16`/`FASE_16`→`16`, `FASE_PRE8`/`FASE_8`→`8`, `FASE_PRE4`/`FASE_4`→`4`, `FASE_PRESEMIS`/`FASE_SEMIS`→`semis`, `FASE_PREFINAL`/`FASE_FINAL`/`FASE_POSTFINAL`→`final`).
- Cambiar predicciones de otras fases devuelve **403**.

#### Reglas de nombre de usuario (`validateUsername`)

- Entre **3 y 20 caracteres**.
- Solo `[a-z0-9_]` (minúsculas, números, guion bajo).
- Se normaliza con `trim().toLowerCase()`.

### Fase Final

| Método | Ruta                  | Descripción                                    |
|--------|-----------------------|------------------------------------------------|
| GET    | `/api/final-predictions` | Obtener predicciones de eliminatorias de un usuario (username) |
| PUT    | `/api/final-predictions` | Guardar predicciones de eliminatorias de un usuario (username, finalPredictions) |

### Configuración y Avatares

| Método | Ruta                  | Descripción                                    |
|--------|-----------------------|------------------------------------------------|
| GET    | `/api/config`         | Configuración del torneo (faseJuego, totalMatches, squadSize, squadFormation) |
| GET    | `/api/avatars/taken`  | Lista de avatares ya cogidos por usuarios      |
| GET    | `/api/players`        | Lista de todos los jugadores registrados       |

### Estadísticas de Partidos

| Método | Ruta                          | Descripción                                    |
|--------|-------------------------------|------------------------------------------------|
| GET    | `/api/match-stats/:eventId`   | Scraping de estadísticas de un partido (Sofascore). Guarda en MongoDB (colección `matchstats`) |
| GET    | `/api/match-stats`            | Obtener todos los matchstats almacenados en MongoDB (para cálculo de puntos) |
| GET    | `/api/match-stats/updated`    | Contador de matchstats y última actualización  |
| DELETE | `/api/match-stats/:eventId`   | Eliminar un matchstat por eventId              |

### Legacy (compatibilidad)

| Método | Ruta | Descripción                                    |
|--------|------|------------------------------------------------|
| GET    | `/`  | Info del servidor y lista de endpoints         |

### Administración (requiere auth admin)

| Método | Ruta                          | Descripción                                    |
|--------|-------------------------------|------------------------------------------------|
| GET    | `/api/admin/invitations`      | Listar todos los códigos de invitación         |
| POST   | `/api/admin/invitations`      | Crear nuevo código de invitación               |
| DELETE | `/api/admin/invitations/:code`| Eliminar código no usado                       |
| PUT    | `/api/admin/fase-juego`       | Cambiar la fase del juego (faseJuego)          |
| PUT    | `/api/admin/config`           | Actualizar configuración completa (faseJuego, tournament) |

### Modelo de Datos de Usuario (auth)

```json
{
  "clave": "EOW5",
  "username": "nombreusuario",
  "passwordHash": "salt:hash",
  "avatar": "⚽",
  "createdAt": "2026-07-31T00:00:00.000Z",
  "squad": [
    { "id": 804508, "nombre": "Viktor Gyökeres", "posicion": "F", "club": "Arsenal", "equipo": 42, "extension": "webp" },
    { "id": 804509, "nombre": "Omar Marmoush", "posicion": "F", "club": "Man City", "equipo": 130, "extension": "webp" },
    ...
  ],
  "predictions": {
    "[eventId]": { "home": 2, "away": 1 }
  },
  "finalPredictions": {
    "champion": 42,
    "runnerUp": null,
    "semiFinalists": [1, 2],
    "quarterFinalists": [],
    "roundOf16": [],
    "roundOf32": []
  },
  "predictionsConfirmed": false,
  "isAdmin": false
}
```

> **Nota**: `predictionsConfirmed` se pone a `true` al confirmar los 144 pronósticos (`POST /api/predictions/confirm`). `isAdmin` marca a los usuarios administradores (acceso a `/api/admin/*`).

### Modelo de Datos de MatchStats

```json
{
  "eventId": 14566909,
  "stats": {
    "42": { "goles": 2 },
    "2825": { "goles": 0 },
    "jugadores": [
      {
        "id": "797291",
        "nombre": "Unai Simón",
        "posicion": "G",
        "equipo": 42,
        "puntos": 6.1,
        "goles": 0,
        "minutos": 90,
        "paradas": 4,
        "esSuplente": false,
        "penaltiMarcado": 0,
        "penaltiParado": 1,
        "golesRecibidos": 0
      }
    ]
  },
  "lastUpdated": "2026-08-03T07:55:04.289Z"
}
```

### Flujo de Registro

1. Admin crea un código de invitación con POST `/api/admin/invitations` → se guarda en MongoDB (colección `invitations`) con `{ code, usedBy: null, createdAt }`
2. Usuario se registra con POST `/api/auth/register` → body: `{username, password, invitationCode: "EOW5"}`
3. Backend valida que `FASE_PRETEMPORADA` esté activa y busca `Invitation.findOne({ code })`
4. Si el código existe y `usedBy` es `null`, crea el usuario en MongoDB (colección `users`) con `{clave, username, passwordHash, createdAt}` y marca el código como usado (`usedBy = username`)
5. Devuelve JWT para la sesión

### Respuesta Login/Register

```json
// POST /api/auth/login (register devuelve user sin avatar)
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "username": "nombreusuario", "avatar": "⚽", "predictionsConfirmed": false }
}
```

### Respuesta Profile

```json
// GET /api/auth/profile (usa el token JWT; NO acepta ?username=)
// Devuelve además isAdmin y predictionsConfirmed
{
  "ok": true,
  "avatar": "⚽",
  "isAdmin": false,
  "predictionsConfirmed": false
}

// POST /api/auth/profile
// Body: { "avatar": "🏆" }  (el username sale del token JWT)
{
  "ok": true,
  "avatar": "🏆"
}
```

### Respuesta Config

```json
// GET /api/config
{
  "ok": true,
  "config": {
    "faseJuego": "FASE_PRETEMPORADA",
    "totalMatches": 144,
    "squadSize": 25,
    "squadFormation": {
      "G": 3,
      "D": 8,
      "M": 8,
      "F": 6
    }
  }
}
```

### Respuesta Avatares Taken

```json
// GET /api/avatars/taken
{
  "ok": true,
  "taken": ["⚽", "🏆", "🦁"]
}
```

### Respuesta Squad

```json
// GET /api/squad?username=nombreusuario
{
  "ok": true,
  "squad": [
    { "id": 804508, "nombre": "Viktor Gyökeres", "posicion": "F", "club": "Arsenal", "equipo": 42 },
    { "id": 804509, "nombre": "Omar Marmoush", "posicion": "F", "club": "Man City", "equipo": 130 },
    ...
  ]
}

// PUT /api/squad
// Body: { "username": "nombreusuario", "squad": [{ id, nombre, posicion, club, equipo }, ...] }
{
  "ok": true,
  "squad": [
    { "id": 804508, "nombre": "Viktor Gyökeres", "posicion": "F", "club": "Arsenal", "equipo": 42 },
    ...
  ]
}
```

### Respuesta Players

```json
// GET /api/players
// Solo nombre y avatar. Los puntos reales se calculan en el frontend
// con GET /api/predictions/all + GET /api/match-stats.
{
  "ok": true,
  "players": [
    { "name": "usuario1", "avatar": "⚽" },
    { "name": "usuario2", "avatar": "🏆" }
  ]
}
```

### Respuesta Match Stats

```json
// GET /api/match-stats/14566909
{
  "2825": { "goles": 0 },
  "42": { "goles": 2 },
  "jugadores": [
    {
      "id": "797291",
      "nombre": "Unai Simón",
      "posicion": "G",
      "equipo": 42,
      "puntos": 6.1,
      "goles": 0,
      "minutos": 90,
      "paradas": 4,
      "esSuplente": false,
      "penaltiMarcado": 0,
      "penaltiParado": 1,
      "golesRecibidos": 0
    }
  ]
}
```

### Respuesta Match Stats All

```json
// GET /api/match-stats
{
  "ok": true,
  "matchStats": [
    {
      "eventId": 14566909,
      "stats": {
        "2825": { "goles": 0 },
        "42": { "goles": 2 },
        "jugadores": [...]
      }
    },
    // ... más partidos
  ]
}
```

### Respuesta Predictions All

```json
// GET /api/predictions/all
{
  "ok": true,
  "predictions": {
    "juan123": {
      "predictions": {
        "14566909": { "home": 2, "away": 1 }
      },
      "finalPredictions": {
        "champion": 42
      },
      "squad": [
        { "id": 804508, "nombre": "Viktor Gyökeres", "posicion": "F", "club": "Arsenal", "equipo": 42 }
      ]
    }
  }
}
```

## MongoDB

El proyecto usa MongoDB Atlas para persistir datos de usuarios, invitaciones y estadísticas de partidos.

### Variables de Entorno

| Variable         | Descripción                                    | Ejemplo                          |
|------------------|------------------------------------------------|----------------------------------|
| `JWT_SECRET`     | Secreto para firmar tokens JWT                 | `mi-secreto-seguro`             |
| `FRONTEND_URL`   | URL del frontend para CORS                     | `https://porra-spa.vercel.app`  |
| `PORT`           | Puerto del servidor (default: 3000)            | `3000`                          |
| `MONGODB_URI`    | URI de conexión a MongoDB Atlas                | `mongodb+srv://...`             |

> **Nota**: `GITHUB_TOKEN` ya no es necesaria. La persistencia GitHub se eliminó tras la migración a MongoDB (los ficheros `data/users/*.json` fueron borrados del repo). `github.js` y `scripts/migrateToMongo.js` fueron eliminados.

## Funciones de Auth (api/auth.js)

```js
import { register, login, getProfile, saveProfile, getTakenAvatars, getAllPlayers, getSquad, saveSquad, changePassword } from './api/auth.js';

// Registrar usuario
const result = await register(username, password, invitationCode);

// Iniciar sesión (devuelve avatar si existe)
const result = await login(username, password);

// Obtener perfil de usuario
const result = await getProfile(username);

// Guardar perfil (avatar)
const result = await saveProfile(username, { avatar });

// Obtener lista de avatares ya cogidos
const taken = await getTakenAvatars(); // ['⚽', '🏆', ...]

// Obtener todos los jugadores registrados (para clasificación)
const players = await getAllPlayers(); // [{ name, avatar }, ...]

// Obtener plantilla ideal del usuario
const squad = await getSquad(username); // [{ id, nombre, posicion, club, equipo }, ...]

// Guardar plantilla ideal del usuario
const result = await saveSquad(username, squad); // { ok, squad }

// Cambiar contraseña del usuario
const result = await changePassword(username, currentPassword, newPassword); // { ok, message }
```

## Funciones de Scraping (scripts/)

```js
import { scrapMatchStats } from './scripts/matchStats.js';

// Scraping de estadísticas de un partido (evento + alineaciones)
const stats = await scrapMatchStats(eventId);
// Returns: { [homeTeamId]: { goles, tandaPenaltis }, [awayTeamId]: { goles, tandaPenaltis }, jugadores: [...] }
// Formato idéntico al que se guarda en Mongo y devuelve GET /api/match-stats/:eventId
```

## Seguridad

- Las contraseñas se hashean con **scrypt** (crypto nativo de Node.js) - nunca se almacenan en texto plano
- Los tokens JWT expiran en **7 días**
- Los códigos de invitación se almacenan en MongoDB (colección `invitations`) con `{ code, usedBy, createdAt }`
- Un código de invitación solo se puede usar una vez (si `usedBy` ya tiene un valor, el código fue usado)
- CORS configurado para permitir solo el origen del frontend
- **Rate limits** (en `api/middleware.js`): login 10 req/15min, register 5 req/15min, peticiones globales 120 req/min, peticiones autenticadas 30 req/min
- **Validación de username**: 3-20 caracteres, solo `[a-z0-9_]`, normalizado a minúsculas (`validateUsername`)

## Convenciones de Código

- Usar **ES Modules** (`import/export`), no CommonJS (`require`)
- Orientado a **naming en español** para funciones y variables
- Ficheros de datos en `data/` con formato JSON
- Las imágenes se guardan detectando el formato (PNG/WEBP)

## Datos de Sofascore

- **Torneo**: Unique tournament ID `7` (Champions League)
- **Temporada**: Season ID `76953`
- **API base**: `https://www.sofascore.com/api/v1/`
- **Imágenes base**: `https://img.sofascore.com/api/v1/`

## Reglas de la Porra - Fase de Liga

### Formato de la Fase de Liga

Todos los partidos de esta fase se juegan de acuerdo con un sistema de liga en el que cada club se enfrenta a ocho rivales distintos en enfrentamientos de partido único. Cada club juega cuatro partidos como local y cuatro partidos como visitante. Los enfrentamientos se definirán por sorteo. La fecha de celebración de este sorteo está prevista para el 27 de agosto de 2026. El comienzo de la fase de liga esta previsto para el 8 de septiembre de 2026.

De acuerdo con los resultados de estos partidos los clubes se clasificarán en un sistema de liga única obteniendo 3 puntos por victoria, 1 punto por empate y 0 puntos por derrota.

### Criterios de Desempate

Si dos o más equipos están empatados al finalizar los partidos de la fase de liga, se aplican los siguientes criterios, en este orden, para determinar la clasificación final:

1. Mayor diferencia de goles
2. Mayor número de goles marcados
3. Mayor número de goles marcados como visitante
4. Mayor número de victorias
5. Mayor número de victorias como visitante
6. Mayor suma de puntos obtenidos por todos los rivales de la fase de liga
7. Mayor suma de diferencia de goles obtenida por todos los rivales de la fase de liga
8. Mayor suma de goles marcados por todos los rivales de la fase de liga
9. Menor número de puntos disciplinarios basado en el número total de tarjetas amarillas y tarjetas rojas recibidas (tarjeta amarilla = 1 punto, tarjeta roja = 3 puntos, expulsión por doble amarilla = 3 puntos)
10. Mayor coeficiente UEFA del club

### Pronóstico de Resultados de la Fase de Liga

Cada participante deberá pronosticar el resultado de cada uno de los 144 partidos previstos para la fase de liga. En base a estos resultados se obtendrá un pronóstico de clasificación para la fase de liga.

### Puntuación por Pronóstico de Partidos

| Concepto | Puntos |
|----------|--------|
| Acierto de resultado (victoria local, empate o victoria visitante) | 8 |
| Acierto de goles marcados por el equipo local | 3 |
| Acierto de goles marcados por el equipo visitante | 3 |
| Acierto de goles marcados por ambos equipos | 1 |
| **Puntuación máxima por partido** | **15** |

### /

Adicionalmente a la puntuación de los partidos, al finalizar la fase de liga se obtendrán puntos por acertar la posición final de cada equipo en la liga.

**Únicamente obtendrán puntos los equipos que hayan finalizado en una posición igual o superior al puesto 24.** Los puntos se asignan del siguiente modo:

| Posición | Puntos | Posición | Puntos | Posición | Puntos | Posición | Puntos |
|----------|--------|----------|--------|----------|--------|----------|--------|
| 1º | 60 | 7º | 21 | 13º | 12 | 19º | 6 |
| 2º | 51 | 8º | 18 | 14º | 11 | 20º | 5 |
| 3º | 43 | 9º | 16 | 15º | 10 | 21º | 4 |
| 4º | 36 | 10º | 15 | 16º | 9 | 22º | 3 |
| 5º | 30 | 11º | 14 | 17º | 8 | 23º | 2 |
| 6º | 25 | 12º | 13 | 18º | 7 | 24º | 1 |

**Regla de puntuación por clasificación**: Solo se recibirán los puntos por el valor más bajo de posición que ocupe un equipo teniendo en cuenta la posición pronosticada y la real.

> Ejemplo: Si se ha pronosticado que un equipo acaba en la posición 7 y finalmente acaba en la posición 3, solo se recibirán los puntos de la posición 7 (21 puntos). Si el equipo acaba en la posición 12, solo se recibirán los puntos de la posición 12 (13 puntos).

### Puntuación de la Plantilla Ideal

Se seleccionará una plantilla compuesta por un total de 25 jugadores formada por 3 porteros, 8 defensas, 8 centrocampistas y 6 delanteros. En la plantilla no podrá haber más de un jugador del mismo club.

Los jugadores seleccionados recibirán puntos a lo largo de la competición de acuerdo con los siguientes criterios:

#### Puntuación Sofascore

Puntuación obtenida en cada partido según la aplicación Sofascore. 6 puntos Sofascore equivalen a 0 puntos. Si la puntuación Sofascore es superior a 6, se obtiene 1 punto por cada 0,3 puntos Sofascore recibidos. La puntuación máxima en Sofascore es de 10 puntos, por lo que el número máximo de puntos que se podrán recibir será de 13. En el caso de que la puntuación Sofascore sea inferior a 6, la puntuación recibida por el jugador será negativa. Hasta 5,7 puntos Sofascore el jugador recibirá un punto negativo (-1). Por debajo de ese valor, por cada 0,3 puntos Sofascore menos, el jugador recibirá un punto negativo adicional.

#### Puntuación por goles marcados

Por cada gol marcado en un partido el jugador recibirá 1 punto adicional. Dependiendo de su demarcación obtendrá puntos adicionales del siguiente modo:

| Demarcación | Puntos adicionales por gol |
|-------------|---------------------------|
| Delantero | +1 |
| Centrocampista | +2 |
| Defensa | +3 |
| Portero | +4 |

En el caso de que el gol se marque de penalti el jugador no recibe esta puntuación adicional por demarcación.

#### Porteros (penaltis parados y goles recibidos)

Esta puntuación aplica solo a los porteros. Los porteros recibirán una puntuación adicional negativa de 1 punto (-1) por cada gol recibido. En el caso de que el portero pare un penalti recibirá una puntuación adicional positiva de 3 puntos (+3).

#### Puntuación por portería a cero

Si al finalizar el partido el equipo no ha recibido goles, el portero recibirá una puntuación adicional positiva de 5 puntos (+5), y los defensas una puntuación adicional positiva de 2 puntos (+2), siempre y cuando en ambos casos hayan jugado más de 70 minutos.

## Eliminatorias (Predicciones de Fase Final)

### Descripción

Los usuarios predicen el cuadro completo de eliminatorias de la Champions League, asignando 24 equipos clasificados de la fase de liga a cada ronda: campeón, subcampeón, semifinalistas, cuartos, octavos y dieciseisavos.

### Distribución de Equipos

| Ronda | Cantidad | Descripción |
|-------|----------|-------------|
| Campeón | 1 | Equipo ganador |
| Subcampeón | 1 | Equipo finalista |
| Semifinalistas | 2 | Equipos en semifinales |
| Cuartos de final | 4 | Equipos en cuartos |
| Octavos de final | 8 | Equipos en octavos |
| Dieciseisavos | 8 | Equipos en dieciseisavos |
| **Total** | **24** | |

### Restricciones de Validación

1. **Top-8 restriction**: Los equipos en puestos 1-8 de la clasificación pronosticada NO pueden colocarse en dieciseisavos (roundOf32)
2. **Sin repetir equipos**: Cada equipo solo puede asignarse a una ronda
3. **Restricciones por grupos de posiciones**: Para limitar la concentración de equipos de ciertos rangos en una misma ronda, se aplican los siguientes límites máximos (2 equipos por grupo):

   **En la caja de DIECISEISAVOS:**
   - Máximo 2 equipos de los que acabaron en posiciones 9, 10, 23 y 24
   - Máximo 2 equipos de los que acabaron en posiciones 11, 12, 21 y 22
   - Máximo 2 equipos de los que acabaron en posiciones 13, 14, 19 y 20
   - Máximo 2 equipos de los que acabaron en posiciones 15, 16, 17 y 18

   **En el conjunto de las cajas fuera de dieciseisavos (campeón, subcampeón, semifinalistas, cuartos y octavos combinadas):**
   - Máximo 2 equipos de los que acabaron en posiciones 9, 10, 23 y 24
   - Máximo 2 equipos de los que acabaron en posiciones 11, 12, 21 y 22
   - Máximo 2 equipos de los que acabaron en posiciones 13, 14, 19 y 20
   - Máximo 2 equipos de los que acabaron en posiciones 15, 16, 17 y 18

   > El límite de las cajas fuera de dieciseisavos se aplica al CONJUNTO de todas ellas (no por caja individual). Ejemplo: con los equipos de posiciones 9, 10, 23 y 24, no se puede poner el 23 en cuartos, el 24 en semifinales y el 10 en octavos; 2 de ellos deben ir obligatoriamente a dieciseisavos.

   **Grupos de restricción:**
   | Grupo | Posiciones |
   |-------|------------|
   | A | 9, 10, 23, 24 |
   | B | 11, 12, 21, 22 |
   | C | 13, 14, 19, 20 |
   | D | 15, 16, 17, 18 |

### Modelo de Datos

```json
{
  "finalPredictions": {
    "champion": "number|null (team ID)",
    "runnerUp": "number|null (team ID)",
    "semiFinalists": "[number] (max 2)",
    "quarterFinalists": "[number] (max 4)",
    "roundOf16": "[number] (max 8)",
    "roundOf32": "[number] (max 8)"
  }
}
```

## Configuración

- **Puerto**: `process.env.PORT` o `3000` por defecto
- **Inicio**: `npm start` o `node server.js`

## Notas Importantes

- Los scripts de scraping (`scripts/`) usan headers de Chrome para evitar bloqueos de Sofascore.
