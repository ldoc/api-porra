# Diseño: Script de Generación de PDF de Pronósticos

## Objetivo

Generar un PDF oficial con los pronósticos de todos los jugadores antes de que comience la fase de liguillas. Cada página del PDF representa un "contrato" de lo que cada jugador ha rellenado, sirviendo como referencia oficial ante posibles reclamaciones.

## Decisiones de Diseño

- **PDFKit** como librería de generación (ligera, sin navegador, soporta imágenes WebP)
- **Script standalone** (`node scripts/generatePDF.js`), no endpoint del API
- **Una página por jugador** con layout comprimido (fuentes 6-8pt)
- **Bracket visual** horizontal en forma de pirámide para eliminatorias
- **Imágenes incluidas**: escudos de equipo y fotos de jugadores (WebP)

## Estructura del PDF

### Página 1 — Portada

- Título: "Pronósticos de la Porra — Champions League 2025-26"
- Fecha y hora de generación
- Total de jugadores incluidos
- Aviso/Disclaimer:

> "Revisa tus pronósticos en este PDF. Los datos introducidos deberían coincidir en la web y en el PDF, pero cualquier reclamación se resolverá a partir de este documento (esto es lo que realmente vale)."

### Páginas 2+ — Una por jugador (A4 portrait, layout comprimido)

Dimensiones: A4 (595 × 842pt), márgenes 40pt → área útil 515 × 762pt.

#### Sección 1: Header (30pt)

- Emoji avatar del jugador + nombre en 10pt bold
- Línea separadora horizontal

#### Sección 2: Pronósticos de Liga (~292pt)

- Título "PRONÓSTICOS DE LIGA" en 8pt bold
- Grid 4×2 (4 columnas × 2 filas) con las 8 jornadas
- Cada celda = 1 jornada (18 partidos)
- Formato por partido: `Local X-Y Visitante` en 6pt
- Nombres de equipo abreviados (máx 12-14 caracteres)
- Columna: 125pt de ancho, 5pt de gap entre columnas
- Fila: 133pt de alto (19 líneas × 7pt), 10pt de gap entre filas

#### Sección 3: Eliminatorias — Bracket Visual (~154pt)

- Título "ELIMINATORIAS" en 8pt bold
- **No es un bracket de emparejamientos**, sino una pirámide de progresión que muestra qué equipos predice el usuario que llegarán a cada ronda
- Pirámide horizontal de izquierda a derecha, 5 columnas:
  - **16avos** (roundOf32): 8 equipos → escudo 14×14pt + nombre abreviado 6pt
  - **Octavos** (roundOf16): 8 equipos
  - **Cuartos** (quarterFinalists): 4 equipos
  - **Semis** (semiFinalists): 2 equipos
  - **Final** (runnerUp): 1 equipo
  - **Campeón** (champion): 1 equipo (destacado, más grande o con borde)
- Cada columna se alinea verticalmente centrada respecto a la anterior
- Líneas verticales de conexión entre columnas para indicar progresión
- Espaciado vertical: 16pt entre equipos del mismo nivel
- Si un slot está vacío (usuario no seleccionó equipo), se muestra "---"

#### Sección 4: Plantilla Ideal (~138pt)

- Título "PLANTILLA IDEAL" en 8pt bold
- 4 columnas por posición:
  - **Porteros** (3 jugadores): 120pt ancho
  - **Defensas** (8 jugadores): 140pt ancho
  - **Medios** (8 jugadores): 140pt ancho
  - **Delanteros** (6 jugadores): 120pt ancho
- Cada jugador: foto 12×12pt + nombre 6pt + club 6pt
- Línea: 14pt de alto

## Datos Necesarios

| Dato | Fuente | Notas |
|------|--------|-------|
| Usuarios + predicciones | MongoDB `users` | Solo `predictionsConfirmed: true` |
| Partidos (144) | `data/sofascore/calendar.json` | eventId, equipos, jornada (ronda 1-8) |
| Equipos (36) | `data/sofascore/teams.json` | id, name |
| Escudos | `data/sofascore/imgEquipos/{teamId}.webp` | Imágenes WebP |
| Jugadores | `data/sofascore/jugadores.json` | id, nombre, posicion, equipo |
| Fotos jugadores | `data/sofascore/imgJugadores/{playerId}.webp` | Imágenes WebP |
| Config torneo | MongoDB `gameconfigs` | faseJuego, tournament |

## Estructura de Archivos

```
scripts/
  generatePDF.js              # Punto de entrada standalone
api/
  pdf/
    generator.js              # Motor principal de generación del PDF
    layout.js                 # Cálculos de layout y posicionamiento
    bracket.js                # Dibujado del bracket de eliminatorias
    predictions.js            # Tabla de pronósticos por jornada
    plantilla.js              # Sección de plantilla ideal
    cover.js                  # Página de portada
    utils.js                  # Helpers (abreviar nombres, cargar imágenes)
```

## Flujo del Script

```
1. Conectar a MongoDB Atlas (usando db/connection.js)
2. Cargar datos estáticos:
   - calendar.json → partidos de liga agrupados por jornada (ronda 1-8)
   - teams.json → mapa de equipos (id → name)
   - jugadores.json → mapa de jugadores (id → datos)
3. Obtener todos los usuarios con predictionsConfirmed = true
4. Crear PDF (PDFKit, A4 portrait)
5. Generar portada (cover.js)
6. Para cada usuario:
   a. doc.addPage()
   b. Dibujar header (nombre + avatar)
   c. Dibujar pronósticos de liga (predictions.js — grid 4×2)
   d. Dibujar bracket de eliminatorias (bracket.js)
   e. Dibujar plantilla ideal (plantilla.js)
7. Guardar PDF en data/pronosticos_porra.pdf
8. Desconectar MongoDB
9. Mostrar resumen: "PDF generado: X jugadores, Y páginas"
```

## Abreviaturas de Equipos

Para ajustar nombres largos en columnas de 125pt a 6pt:

| Nombre completo | Abreviatura |
|----------------|-------------|
| Royale Union Saint-Gilloise | R. Union SG |
| Internazionale | Inter |
| Sporting CP | Sporting CP |
| Eintracht Frankfurt | E. Frankfurt |
| Olympique Marseille | O. Marseille |
| PSV Eindhoven | PSV |
| Borussia Dortmund | B. Dortmund |
| Bayer Leverkusen | B. Leverkusen |

Se implementará una función `abreviarNombre(name)` que trunca nombres largos (>14 chars) de forma inteligente.

## Dependencia Nueva

- `pdfkit` (única dependencia nueva)

## Archivo de Salida

- `data/pronosticos_porra.pdf` (o configurable via variable de entorno `PDF_OUTPUT_PATH`)
- El directorio `data/` ya está en `.gitignore`

## Notas de Implementación

- Los nombres de equipo del calendario ya están en formato completo (no códigos), se pueden usar directamente
- Las imágenes WebP son soportadas por PDFKit nativamente
- El script debe ser idempotente: sobreescribe el PDF si ya existe
- No requiere autenticación (es un script local del admin)
- Debe mostrar progreso en consola: "Generando página X/Y..."

## Manejo de Errores y Casos Borde

- **Imagen no encontrada**: Si falta un escudo o foto de jugador, mostrar un placeholder gris con las iniciales del equipo/jugador en lugar de fallar
- **Predicciones incompletas**: Si un usuario no tiene predicciones para un partido, mostrar "-" en lugar de resultado
- **Plantilla incompleta**: Si un usuario tiene menos de 25 jugadores en la plantilla, mostrar los que tenga y "---" en los slots vacíos
- **Eliminatorias vacías**: Si un usuario no ha seleccionado equipos para una ronda, mostrar "---" en cada slot
- **Sin usuarios**: Si no hay usuarios con `predictionsConfirmed: true`, generar solo la portada y mostrar aviso en consola
- **Escudo/foto corrupto**: Si una imagen WebP no se puede leer, usar placeholder
