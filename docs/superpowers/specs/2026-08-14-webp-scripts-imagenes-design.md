# Diseño: Imágenes de equipos y jugadores en WebP

**Fecha:** 2026-08-14
**Proyecto:** api-porra
**Alcance:** `scripts/equipos.js` y `scripts/jugadores.js`

---

## Contexto

Los scripts de scraping (`scripts/equipos.js` y `scripts/jugadores.js`) descargan las imágenes de escudos de equipos y fotos de jugadores desde `img.sofascore.com` y las guardan en `data/sofascore/imgEquipos/` y `data/sofascore/imgJugadores/`. Hoy detectan el formato por firma de bytes y guardan cada archivo con su extensión real (`png` o `webp`), resultando en una mezcla de formatos.

## Objetivo

A partir de ahora, todas las imágenes que guarden estos scripts serán **`.webp`**. Si Sofascore devuelve un PNG, se convierte a WebP antes de guardar.

## No está en alcance

- **No** convertir ni borrar los PNG ya descargados en `data/` (son de la temporada pasada; se quedan tal cual).
- **No** tocar `teams.json`, `jugadores.json` ni el campo `extension` (lo gestiona el frontend).
- **No** modificar el servidor ni el frontend.

## Cambios

### 1. Dependencia `sharp`

Añadir `sharp` al `package.json` de api-porra. Es la librería usada para convertir PNG → WebP. No requiere configuración adicional.

### 2. `scripts/equipos.js`

En el bucle de `obtenerEquipos()`:

- Tras obtener `image` con `fetchSofascoreImage`, detectar formato con `extensionFromImageBuffer`.
- Si es WebP → se usa el buffer tal cual.
- Si es PNG → convertir: `await sharp(image).webp({ quality: 85 }).toBuffer()`.
- Escribir siempre a `data/sofascore/imgEquipos/${equipo.team.id}.webp`.

El placeholder `EMPTY_IMAGE` (PNG 1×1 transparente usado cuando Sofascore responde 404) se convierte también a WebP una sola vez al cargar el script, para que el fallback también quede en `.webp`.

### 3. `scripts/jugadores.js`

Mismo cambio en el bucle de `obtenerJugadores()`:

- Convertir a WebP si el buffer es PNG.
- Escribir siempre a `data/sofascore/imgJugadores/${jugador.player.id}.webp`.

Mismo tratamiento del `EMPTY_IMAGE`.

## Consideraciones

- **Calidad WebP:** `quality: 85`, valor estándar con buena relación peso/calidad para imágenes de 150×150 (escudos y fotos se muestran a 20–48px en la app).
- **Transparencia:** `sharp` conserva el canal alfa en WebP por defecto, adecuado para los escudos con fondo transparente.
- **Placeholder:** al convertir `EMPTY_IMAGE` a WebP, el fallback 404 queda también en `.webp`, coherente con el resto.

## Verificación

- `node scripts/equipos.js` y `node scripts/jugadores.js` ejecutados sin errores.
- Todos los archivos escritos terminan en `.webp`.
- Los PNG previos en `data/` permanecen intactos.
