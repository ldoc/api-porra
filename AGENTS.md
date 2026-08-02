# Instrucciones para Agentes IA - api-porra

## Visión General

API REST en Node.js para gestionar datos de fútbol (Liga de Campeones). Obtiene datos de Sofascore y los almacena en JSON local y en GitHub. Incluye sistema de autenticación de usuarios con JWT.

## Stack Tecnológico

- **Runtime**: Node.js (ES Modules)
- **Servidor**: `http` nativo (sin frameworks)
- **GitHub API**: Octokit para persistir ficheros en el repositorio
- **Fuente de datos**: Sofascore API (no oficial)
- **Autenticación**: JWT (jsonwebtoken) + hash de contraseñas con scrypt (crypto nativo)

## Estructura del Proyecto

```
api-porra/
├── server.js              # Servidor HTTP principal
├── github.js              # Funciones de persistencia en GitHub
├── config.json            # Configuración del torneo (freeze date, etc.)
├── api/
│   └── auth.js            # Módulo de autenticación (register/login/getTakenAvatars)
├── scripts/
│   ├── calendario.js      # Scraping de calendario de partidos
│   ├── equipos.js         # Scraping de equipos + escudos
│   └── jugadores.js       # Scraping de jugadores + fotos
├── data/
│   ├── sofascore/
│   │   ├── calendar.json  # Calendario de partidos
│   │   ├── teams.json     # Equipos
│   │   ├── jugadores.json # Jugadores
│   │   ├── imgEquipos/    # Escudos (PNG/WEBP)
│   │   ├── imgJugadores/  # Fotos de jugadores (PNG/WEBP)
│   │   └── partidos/      # Datos de partidos
│   └── users/             # Usuarios registrados ({username}.json)
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

### Plantilla Ideal

| Método | Ruta                  | Descripción                                    |
|--------|-----------------------|------------------------------------------------|
| GET    | `/api/squad`          | Obtener plantilla ideal del usuario (username) |
| PUT    | `/api/squad`          | Guardar plantilla ideal del usuario (username, squad) |

### Configuración y Avatares

| Método | Ruta                  | Descripción                                    |
|--------|-----------------------|------------------------------------------------|
| GET    | `/api/config`         | Configuración del torneo (freeze date, etc.)   |
| GET    | `/api/avatars/taken`  | Lista de avatares ya cogidos por usuarios      |
| GET    | `/api/players`        | Lista de todos los jugadores registrados       |

### Legacy (compatibilidad)

| Método | Ruta             | Descripción                                    |
|--------|------------------|------------------------------------------------|
| GET    | `/nuevoUsuario`  | Crear código de invitación (guarda `data/users/{clave}.json`) |
| GET    | `/usuario?clave=X` | Obtener usuario por su clave                |
| GET    | `/`              | Info del servidor y lista de endpoints         |

### Modelo de Datos de Usuario (auth)

```json
{
  "clave": "EOW5",
  "username": "nombreusuario",
  "passwordHash": "salt:hash",
  "avatar": "⚽",
  "createdAt": "2026-07-31T00:00:00.000Z",
  "squad": [
    { "id": 804508, "nombre": "Viktor Gyökeres", "posicion": "F", "club": "Arsenal", "equipo": 42 },
    { "id": 804509, "nombre": "Omar Marmoush", "posicion": "F", "club": "Man City", "equipo": 130 },
    ...
  ]
}
```

### Flujo de Registro

1. Admin crea código de invitación con GET `/nuevoUsuario` → crea `data/users/EOW5.json` con `{"clave": "EOW5"}`
2. Usuario se registra con POST `/api/auth/register` → body: `{username, password, invitationCode: "EOW5"}`
3. Backend busca `data/users/EOW5.json` → si existe y NO tiene `passwordHash`, permite registro
4. Guarda los datos del usuario en ese mismo fichero: `{clave, username, passwordHash, createdAt}`
5. Devuelve JWT para la sesión

### Respuesta Login/Register

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "username": "nombreusuario", "avatar": "⚽" }
}
```

### Respuesta Profile

```json
// GET /api/auth/profile?username=nombreusuario
{
  "ok": true,
  "avatar": "⚽"
}

// POST /api/auth/profile
// Body: { "username": "nombreusuario", "avatar": "🏆" }
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
    "championsFreezeDate": "2026-09-15T21:00:00Z",
    "championsFreezeLabel": "Fase de Grupos",
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
{
  "ok": true,
  "players": [
    { "name": "usuario1", "avatar": "⚽", "points": 12, "hits": 3 },
    { "name": "usuario2", "avatar": "🏆", "points": 8, "hits": 2 }
  ]
}
```

## Variables de Entorno

| Variable         | Descripción                                    | Ejemplo                          |
|------------------|------------------------------------------------|----------------------------------|
| `GITHUB_TOKEN`   | Personal Access Token con permisos de escritura | `ghp_...`                       |
| `JWT_SECRET`     | Secreto para firmar tokens JWT                 | `mi-secreto-seguro`             |
| `FRONTEND_URL`   | URL del frontend para CORS                     | `https://porra-spa.vercel.app`  |
| `PORT`           | Puerto del servidor (default: 3000)            | `3000`                          |

## Funciones de GitHub (github.js)

```js
import { guardarFichero, leerFichero, getUser, saveUser } from './github.js';

// Guardar archivo genérico
await guardarFichero("data/archivo.json", contenidoJSON, "Actualizar datos");

// Leer archivo genérico
const data = await leerFichero("data/archivo.json");

// Obtener usuario por username
const user = await getUser("nombreusuario");

// Guardar/actualizar usuario
await saveUser("nombreusuario", { username, passwordHash, avatar, createdAt });
```

## Funciones de Auth (api/auth.js)

```js
import { register, login, getProfile, saveProfile, getTakenAvatars, getAllPlayers, getSquad, saveSquad } from './api/auth.js';

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
const players = await getAllPlayers(); // [{ name, avatar, points, hits }, ...]

// Obtener plantilla ideal del usuario
const squad = await getSquad(username); // [{ id, nombre, posicion, club, equipo }, ...]

// Guardar plantilla ideal del usuario
const result = await saveSquad(username, squad); // { ok, squad }
```

## Seguridad

- Las contraseñas se hashean con **scrypt** (crypto nativo de Node.js) - nunca se almacenan en texto plano
- Los tokens JWT expiran en **7 días**
- Los códigos de invitación se almacenan como ficheros JSON en GitHub (`data/users/{clave}.json`)
- Un código de invitación solo se puede usar una vez (si el fichero ya tiene `passwordHash`, ya fue registrado)
- CORS configurado para permitir solo el origen del frontend

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

## Configuración

- **Puerto**: `process.env.PORT` o `3000` por defecto
- **Inicio**: `npm start` o `node server.js`

## Notas Importantes

- Los scripts de scraping (`scripts/`) usan headers de Chrome para evitar bloqueos de Sofascore.
- Los endpoints legacy (`/nuevoUsuario`, `/usuario`) se mantienen por compatibilidad.
