# Instrucciones para Agentes IA - api-porra

## Visión General

API REST en Node.js para gestionar datos de fútbol (Liga de Campeones). Obtiene datos de Sofascore y los almacena en JSON local y en GitHub.

## Stack Tecnológico

- **Runtime**: Node.js (ES Modules)
- **Servidor**: `http` nativo (sin frameworks)
- **GitHub API**: Octokit para persistir ficheros en el repositorio
- **Fuente de datos**: Sofascore API (no oficial)

## Estructura del Proyecto

```
api-porra/
├── server.js              # Servidor HTTP principal
├── github.js              # Funciones de persistencia en GitHub
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
│   └── usuarios/          # (vacío)
└── package.json
```

## API Endpoints (server.js)

| Método | Ruta             | Descripción                                    |
|--------|------------------|------------------------------------------------|
| GET    | `/hola`          | Test simple, retorna "adios"                   |
| GET    | `/clave`         | Devuelve variables de entorno (debug)          |
| GET    | `/lineups/:id`   | Obtiene alineaciones de un partido por ID      |
| GET    | `/lineups?id=`   | Mismo endpoint con query parameter             |
| GET    | `/`              | Info del servidor y lista de endpoints         |

## Función guardarFichero (github.js)

```js
import { guardarFichero } from './github.js';

// Parámetros:
//   ruta    - Ruta del fichero en el repositorio (ej: "data/archivo.json")
//   datos   - Contenido a guardar (string)
//   message - Mensaje del commit

await guardarFichero("data/archivo.json", contenidoJSON, "Actualizar datos");
```

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

- `fetchSofascoreLineups` está referenciada en `server.js` pero **no está definida** en ningún fichero. Necesita implementarse.
- Los scripts de scraping (`scripts/`) usan headers de Chrome para evitar bloqueos de Sofascore.
- El token de GitHub (`ghp_...`) está hardcodeado en `github.js` - considerar usar variable de entorno.
