# Imágenes de equipos y jugadores en WebP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modificar `scripts/equipos.js` y `scripts/jugadores.js` para que todas las imágenes se guarden en `.webp`, convirtiendo con sharp los PNG que devuelva Sofascore.

**Architecture:** Añadir la dependencia `sharp`. En ambos scripts, tras descargar el buffer de imagen, detectar su formato por firma de bytes; si es WebP se guarda tal cual, si es PNG se convierte a WebP y se guarda siempre como `{id}.webp`. El placeholder `EMPTY_IMAGE` se convierte a WebP una sola vez al cargar el script.

**Tech Stack:** Node.js (ES Modules), `sharp` (conversión de imágenes).

## Global Constraints

- Usar ES Modules (`import/export`), como el resto del proyecto.
- Naming en español para funciones y variables (convención del proyecto).
- NO tocar `teams.json`, `jugadores.json` ni el campo `extension`.
- NO borrar ni convertir los PNG ya existentes en `data/`.
- Calidad WebP: `quality: 85` (valor estándar, transparencia conservada por sharp).
- Todos los archivos escritos deben terminar en `.webp`.

---

### Task 1: Añadir dependencia `sharp` y convertir a WebP en `scripts/equipos.js`

**Files:**
- Modify: `package.json`
- Modify: `scripts/equipos.js`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `equipos.js` con la lógica de conversión WebP lista para replicar en `jugadores.js`.

- [ ] **Step 1: Instalar `sharp` y comprobar que queda en package.json**

Run:
```bash
npm install sharp
```
Expected: se añade `"sharp": "^0.x.y"` a `dependencies` en `package.json`.

- [ ] **Step 2: Importar sharp y convertir el placeholder `EMPTY_IMAGE`**

En `scripts/equipos.js`:
- Añadir al inicio: `import sharp from 'sharp';`
- Tras la definición de `EMPTY_IMAGE` (línea 20), añadir la conversión a WebP del placeholder:

```javascript
const EMPTY_IMAGE_WEBP = await sharp(EMPTY_IMAGE).webp({ quality: 85 }).toBuffer();
```

Nota: como es un módulo de nivel superior con `await`, es válido porque el proyecto usa ES Modules.

- [ ] **Step 3: Sustituir `EMPTY_IMAGE` por `EMPTY_IMAGE_WEBP` en `fetchSofascoreImage`**

En la respuesta 404 de `fetchSofascoreImage` (línea 98), cambiar `resolve(EMPTY_IMAGE)` por `resolve(EMPTY_IMAGE_WEBP)`.

- [ ] **Step 4: Añadir la función de normalización a WebP**

Añadir tras `extensionFromImageBuffer`:

```javascript
async function toWebpBuffer(buffer) {
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return buffer;
  }
  return await sharp(buffer).webp({ quality: 85 }).toBuffer();
}
```

- [ ] **Step 5: Usar `toWebpBuffer` y guardar siempre en `.webp`**

En el bucle de `obtenerEquipos()` (líneas 139-149), sustituir el bloque de guardado:

```javascript
const image = await fetchSofascoreImage(`https://img.sofascore.com/api/v1/team/${equipo.team.id}/image`);
const webp = await toWebpBuffer(image);
fs.writeFileSync(`data/sofascore/imgEquipos/${equipo.team.id}.webp`, webp);
```

(Eliminar el uso de `extensionFromImageBuffer` en el bucle, ahora redundante.)

- [ ] **Step 6: Verificar ejecución**

Run: `node scripts/equipos.js`
Expected: termina sin errores, escribe `data/sofascore/imgEquipos/*.webp`. Comprobar que los archivos recién escritos terminan en `.webp`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/equipos.js
git commit -m "feat: guardar escudos de equipos en WebP con sharp"
```

---

### Task 2: Convertir a WebP en `scripts/jugadores.js`

**Files:**
- Modify: `scripts/jugadores.js`

**Interfaces:**
- Consumes: la misma lógica (`toWebpBuffer`, placeholder WebP) definida en Task 1; aquí se replica en `jugadores.js`.
- Produces: `jugadores.js` guardando todas las fotos en `.webp`.

- [ ] **Step 1: Importar sharp y convertir el placeholder `EMPTY_IMAGE`**

En `scripts/jugadores.js`:
- Añadir al inicio: `import sharp from 'sharp';`
- Tras la definición de `EMPTY_IMAGE` (línea 19), añadir:

```javascript
const EMPTY_IMAGE_WEBP = await sharp(EMPTY_IMAGE).webp({ quality: 85 }).toBuffer();
```

- [ ] **Step 2: Sustituir `EMPTY_IMAGE` por `EMPTY_IMAGE_WEBP` en `fetchSofascoreImage`**

En la respuesta 404 (línea 96), cambiar `resolve(EMPTY_IMAGE)` por `resolve(EMPTY_IMAGE_WEBP)`.

- [ ] **Step 3: Añadir la función de normalización a WebP**

Tras `extensionFromImageBuffer`, añadir:

```javascript
async function toWebpBuffer(buffer) {
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return buffer;
  }
  return await sharp(buffer).webp({ quality: 85 }).toBuffer();
}
```

- [ ] **Step 4: Usar `toWebpBuffer` y guardar siempre en `.webp`**

En el bucle de `obtenerJugadores()` (líneas 139-152), sustituir el bloque de guardado:

```javascript
const image = await fetchSofascoreImage(`https://img.sofascore.com/api/v1/player/${jugador.player.id}/image`);
const webp = await toWebpBuffer(image);
fs.writeFileSync(`data/sofascore/imgJugadores/${jugador.player.id}.webp`, webp);
```

(Eliminar el uso de `extensionFromImageBuffer` en el bucle.)

- [ ] **Step 5: Verificar ejecución**

Run: `node scripts/jugadores.js`
Expected: termina sin errores, escribe `data/sofascore/imgJugadores/*.webp`. Comprobar que los archivos recién escritos terminan en `.webp`.

- [ ] **Step 6: Commit**

```bash
git add scripts/jugadores.js
git commit -m "feat: guardar fotos de jugadores en WebP con sharp"
```

---

### Task 3: Verificación final

**Files:**
- Ninguno modificado.

- [ ] **Step 1: Confirmar que los PNG previos siguen intactos**

Run:
```bash
ls data/sofascore/imgEquipos/*.png | wc -l
ls data/sofascore/imgJugadores/*.png | wc -l
```
Expected: los conteos de `.png` no han disminuido respecto al estado previo a la ejecución (25 y 682 respectivamente).

- [ ] **Step 2: Confirmar coherencia global**

Run: `git status --short`
Expected: solo aparecen `package.json`, `package-lock.json`, `scripts/equipos.js`, `scripts/jugadores.js` (modificados) y los `.webp` nuevos en `data/` si no están en `.gitignore`. Los JSON y los `.png` no deben aparecer modificados/borrados.
