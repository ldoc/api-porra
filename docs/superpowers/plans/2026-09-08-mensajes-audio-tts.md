# Mensajes con audio TTS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar la skill `mongo-mensajes` para crear mensajes con reproductor de audio, incluyendo la preparación del texto TTS con etiquetas de entonación Fish Audio y la carpeta `data/audio/` en el repo.

**Architecture:** Cambios exclusivamente de documentación en `.opencode/skills/mongo-mensajes/SKILL.md` (que está en `.gitignore`, no se versiona) y una excepción en `.gitignore` para `data/audio/`. No hay cambios de backend, frontend ni modelos.

**Tech Stack:** Markdown. Sin código ejecutable.

## Global Constraints

- El campo `content` de `Message` es HTML renderizado tal cual en el frontend → incrustar `<audio>` no requiere cambios de backend.
- Los navegadores bloquean el autoplay con sonido → el audio se reproduce con botón manual (`<audio controls>`).
- Fish Audio S2 usa sintaxis `[etiqueta]` en corchetes, justo antes de la palabra/frase afectada.
- Las etiquetas de entonación son: `[angry]`, `[sad]`, `[embarrased]`, `[emphasis]`, `[whispering]`, `[soft]`, `[breathy]`, `[excited]`.
- La skill solo prepara el texto TTS (bloque de código) — no llama a la API de Fish Audio.
- Carpeta de audios: `data/audio/`, nombres `YYYY-MM-DD-<slug>.mp3`.
- El reproductor va justo debajo del título, compacto (height 32px), sin JavaScript.

---

### Task 1: Excepción `data/audio/` en `.gitignore`

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: `data/audio/` es trackeable por git (los audios se suben al repo).

- [ ] **Step 1: Añadir la excepción al `.gitignore`**

Añadir tras la línea `!data/sofascore/teams.json` (línea 8):

```gitignore
# Audios para mensajes con texto a voz
!data/audio/
```

Nota: el patrón `data/*` (línea 2) excluye `data/audio` como carpeta; `!data/audio/` la re-incluye **junto con todo su contenido**, de modo que los audios que se depositen en `data/audio/` quedan trackeables por git y se suben al repo. Decisión confirmada por el usuario (opción A).

- [ ] **Step 2: Verificar el comportamiento de git**

Crear la carpeta `data/audio/` con un archivo de prueba y comprobar que queda trackeable:

Run:
```bash
mkdir -p data/audio
touch data/audio/2026-09-08-fase-liga.mp3
git status --short
```

Expected: `?? data/audio/2026-09-08-fase-liga.mp3` aparece en untracked (el audio es trackeable). Confirmar que `git check-ignore data/audio/2026-09-08-fase-liga.mp3` no devuelve ninguna regla (exit code 1). Después eliminar el archivo de prueba: `rm data/audio/2026-09-08-fase-liga.mp3`.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: preparar carpeta data/audio para mensajes con TTS"
```

---

### Task 2: Descripción (frontmatter) de la skill

**Files:**
- Modify: `.opencode/skills/mongo-mensajes/SKILL.md:1-4` (frontmatter `description`)

**Interfaces:**
- Consumes: nada.
- Produces: las keywords de audio/TTS activan la skill cuando el usuario habla de audio en mensajes.

- [ ] **Step 1: Ampliar la `description` del frontmatter**

Añadir al final de la descripción (sin romper el formato YAML de una línea):

```yaml
description: Use when the user wants to create, insert, publish or manage messages/news in MongoDB for api-porra. Covers creating mensajes desde cero with HTML content, noticias, avisos, felicitaciones, resumenes and mantenimiento notifications. Also covers mensajes with embedded audio (text-to-speech): preparing the TTS text with Fish Audio intonation tags, the <audio> player HTML and the data/audio/ folder. Front-load keywords: mongo, mensajes, mensaje, noticia, aviso, felicitacion, resumen, mantenimiento, html, audio, tts, text to speech, texto a voz, fish audio, entonacion, reproductor, crear mensaje, insertar mensaje, publicar noticia, database.
```

- [ ] **Step 2: Verificar**

Run: `head -4 .opencode/skills/mongo-mensajes/SKILL.md`
Expected: frontmatter válido, `description` en una sola línea, comienza con `---` y termina con `---`.

Nota: `.opencode/` está en `.gitignore` → **no commitear** este archivo.

---

### Task 3: Nueva sección "Mensajes con audio"

**Files:**
- Modify: `.opencode/skills/mongo-mensajes/SKILL.md` (insertar tras la tabla de "Tipos disponibles", después de la línea 50)

**Interfaces:**
- Consumes: Task 2 (frontmatter ampliado).
- Produces: la referencia completa de etiquetas TTS, HTML del reproductor, verificación de URL y convención de nombres para las Tasks 4 y 5.

- [ ] **Step 1: Insertar la sección**

Insertar tras la tabla de tipos (línea 50), antes de `## Flujo interactivo obligatorio`:

```markdown
## Mensajes con audio (texto a voz)

Un mensaje puede incluir un reproductor de audio que lee el texto del mensaje con una voz generada por IA. El audio se genera **externamente** con [Fish Audio](https://fish.audio/es/app/): la skill solo prepara el **texto TTS** (bloque de código) para que lo pegues en fish.audio, generes el mp3, lo subas a GitHub y pases la URL raw.

> **Importante — autoplay bloqueado**: los navegadores bloquean la reproducción automática de audio con sonido sin interacción previa del usuario. El reproductor usa el **botón manual** (`<audio controls>`), nunca autoplay.

### Etiquetas de entonación (Fish Audio S2)

| Etiqueta | Efecto |
|----------|--------|
| `[angry]` | Frustrado, agresivo |
| `[sad]` | Melancólico, apagado |
| `[embarrased]` | Avergonzado |
| `[emphasis]` | Énfasis en la palabra/frase siguiente |
| `[whispering]` | Susurro, muy bajo |
| `[soft]` | Suave, gentil |
| `[breathy]` | Voz entrecortada/aireada |
| `[excited]` | Enérgico, entusiasta |

Reglas de colocación:
- La etiqueta va **justo antes** de la palabra/frase que afecta.
- Pueden ir al inicio, medio o final de frase.
- Se pueden combinar: `[whispering] [sad] ...`
- `[emphasis]` solo afecta a la palabra siguiente.
- No abusar: 1-2 etiquetas por frase como máximo; evitar emociones contradictorias en el mismo tramo.

Criterio de aplicación — **según el contenido del texto, no por el tipo de mensaje**:
- **Énfasis** (`[emphasis]`) → fechas, cifras, resultados, nombres propios clave, palabras importantes
- **Entusiasmo** (`[excited]`) → logros, enhorabuenas, buenas noticias, anuncios destacados
- **Seriedad/tristeza** (`[sad]`) → despedidas, noticias malas, cambios
- **Suavidad** (`[soft]`, `[whispering]`, `[breathy]`) → notas finales, disculpas, mensajes personales
- **Frustración** (`[angry]`) → advertencias fuertes, quejas (raro en este contexto)
- **Vergüenza** (`[embarrased]`) → disculpas o aclaraciones

### Entrega del texto TTS

Entregar siempre en un bloque de código para copiar y pegar en fish.audio:

````markdown
**Texto para Fish Audio (cópialo y pégalo en fish.audio):**
```text
[excited] ¡Gran noticia! La fase de liga empieza el 8 de septiembre.
[emphasis] 144 partidos te esperan. Prepara tus pronósticos.
[soft] ¡Suerte a todos!
```
````

Reglas:
- Mismo texto del mensaje, con etiquetas insertadas en los puntos adecuados.
- Sin HTML, sin markdown → solo texto plano con etiquetas Fish Audio.
- El texto TTS y el texto del mensaje deben coincidir en contenido.

Tras entregarlo, decir: *"Genera el audio en fish.audio, súbelo a GitHub y pásame la URL raw."*

### Carpeta de audios en el repo

- Los audios se guardan en **`data/audio/`** del repo api-porra.
- Convención de nombres: `YYYY-MM-DD-<slug>.mp3` (ej. `2026-09-08-fase-liga.mp3`). Minúsculas, guiones, sin espacios ni acentos.
- URL raw resultante:
  ```
  https://raw.githubusercontent.com/<user>/api-porra/<branch>/data/audio/2026-09-08-fase-liga.mp3
  ```

### HTML del reproductor

El reproductor va **justo debajo del título** y **encima del texto**. Compacto, sin JavaScript.

```html
<div style="line-height:1.6;">
  <h3 style="margin:0 0 12px;color:#1a56db;">🏆 ¡La fase de liga está aquí!</h3>

  <div style="margin-bottom:16px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;background:#fafafa;">
    <p style="margin:0 0 4px;font-size:0.8em;color:#555;">▶ Escuchar el mensaje</p>
    <audio controls preload="metadata" style="width:100%;height:32px;">
      <source src="URL_RAW_AUDIO" type="audio/mpeg">
      Tu navegador no soporta audio.
    </audio>
  </div>

  <p>Texto del mensaje...</p>
</div>
```

Reglas:
- `<audio controls>` con `height:32px` (compacto), sin JavaScript.
- Caja con borde `#ddd`, radio `8px`, fondo `#fafafa`, padding `8px 12px`.
- Etiqueta pequeña "▶ Escuchar el mensaje" (`font-size:0.8em`).
- URL raw de GitHub en el `src`, `type="audio/mpeg"` (u otro según extensión: `.wav`, `.ogg`, `.m4a`).

### Verificación de la URL del audio

Antes de insertar, verificar la URL:
- Debe ser de `raw.githubusercontent.com` (o dominio de archivo directo).
- Extensión de audio: `.mp3`, `.wav`, `.ogg`, `.m4a`.
- Comprobación HTTP: `fetch` con status 200 y `Content-Type` de audio.

Si la URL no responde o no es de audio → avisar y pedir otra URL (no insertar). Si el usuario aún no ha subido el audio → pedir que lo haga antes de continuar.
```

- [ ] **Step 2: Verificar**

Run: `grep -n "Mensajes con audio" .opencode/skills/mongo-mensajes/SKILL.md`
Expected: línea que marca el inicio de la sección, antes de `## Flujo interactivo obligatorio`.

Nota: no commitear (`.opencode/` en `.gitignore`).

---

### Task 4: Bifurcación en el flujo interactivo

**Files:**
- Modify: `.opencode/skills/mongo-mensajes/SKILL.md` (sección "Flujo interactivo obligatorio", tras la línea 54)

**Interfaces:**
- Consumes: Task 3 (referencia de audio, HTML, URL).
- Produces: el flujo guiado de audio que usará Task 5.

- [ ] **Step 1: Añadir la bifurcación al inicio del flujo**

Insertar justo después del párrafo "Cuando el usuario pida crear un mensaje/noticia, **SIEMPRE** sigue este flujo paso a paso..." y antes de `### Paso 1`:

```markdown
### Paso 0: ¿Lleva audio?

Usa el tool `question` para preguntar:

> **"¿Este mensaje lleva audio de texto a voz?"**

- **Sí** → activa el modo audio: además de los campos básicos, generarás el texto TTS (ver "Mensajes con audio") antes de pedir la URL del audio.
- **No** → flujo sin audio (pasos 1-6 tal como están).

En modo audio, el flujo completo es:
1. Preguntar campos básicos (Paso 1).
2. Preguntar el contenido (Paso 2).
3. Generar el **texto TTS** con etiquetas según el texto (bloque de código).
4. Pedir al usuario: genera el audio en fish.audio, súbelo a `data/audio/` con nombre `YYYY-MM-DD-<slug>.mp3` y pasa la URL raw.
5. Verificar la URL raw (ver "Verificación de la URL del audio").
6. Generar el HTML con el reproductor debajo del título (ver "HTML del reproductor").
7. Validar (Paso 4), previsualizar y confirmar (Paso 5), insertar (Paso 6).
```

- [ ] **Step 2: Adaptar el Paso 2 (contenido)**

En modo audio, tras generar el HTML normal del texto, añadir el bloque del reproductor con la URL verificada del paso 5. El orden en `content`: título (`<h3>`) → caja del reproductor → texto del mensaje.

Añadir este bloque de ejemplo al final del Paso 2 actual:

```markdown
En modo audio, el `content` final lleva la estructura: título → caja del reproductor → texto (ver plantilla en "HTML del reproductor").
```

- [ ] **Step 3: Verificar**

Run: `grep -n "Paso 0" .opencode/skills/mongo-mensajes/SKILL.md`
Expected: `Paso 0: ¿Lleva audio?` presente antes del `### Paso 1`.

Nota: no commitear.

---

### Task 5: Ejemplo completo y notas

**Files:**
- Modify: `.opencode/skills/mongo-mensajes/SKILL.md` (sección "Ejemplo completo" y "Notas importantes")

**Interfaces:**
- Consumes: Tasks 3 y 4.
- Produces: documentación de referencia final.

- [ ] **Step 1: Añadir un ejemplo completo de mensaje con audio**

Insertar al final de la sección "Ejemplo completo (datos en bruto → HTML)" (tras la línea 181):

````markdown
### Ejemplo completo: mensaje con audio

Usuario dice: "Quiero un mensaje con audio que anuncie el inicio de la fase de liga. El texto: 'La fase de liga empieza el 8 de septiembre. Son 144 partidos. ¡Prepara tus pronósticos!'"

**Texto TTS entregado al usuario:**

**Texto para Fish Audio (cópialo y pégalo en fish.audio):**
```text
[excited] ¡La fase de liga empieza el 8 de septiembre!
[emphasis] Son 144 partidos.
[soft] Prepara tus pronósticos.
```

**HTML generado (tras recibir la URL raw):**
```html
<div style="line-height:1.6;">
  <h3 style="margin:0 0 12px;color:#1a56db;">🏆 ¡La fase de liga está aquí!</h3>

  <div style="margin-bottom:16px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;background:#fafafa;">
    <p style="margin:0 0 4px;font-size:0.8em;color:#555;">▶ Escuchar el mensaje</p>
    <audio controls preload="metadata" style="width:100%;height:32px;">
      <source src="https://raw.githubusercontent.com/USUARIO/api-porra/BRANCH/data/audio/2026-09-08-fase-liga.mp3" type="audio/mpeg">
      Tu navegador no soporta audio.
    </audio>
  </div>

  <p>La fase de liga empieza el <strong>8 de septiembre</strong>.</p>
  <p><strong>144 partidos</strong> te esperan.</p>
  <p style="margin-top:12px;color:#555;font-size:0.95em;">¡Prepara tus pronósticos!</p>
</div>
```
````

- [ ] **Step 2: Ampliar las "Notas importantes"**

Añadir al final de la lista (tras la línea 189):

```markdown
- En mensajes con audio, el reproductor va **debajo del título y encima del texto**, compacto (`<audio controls>`), nunca autoplay (bloqueado por los navegadores).
- La skill **solo prepara el texto TTS** (bloque de código); el usuario genera el mp3 en fish.audio y lo sube a `data/audio/`.
- La URL del audio debe ser raw de GitHub y de extensión de audio; verificar con `fetch` (status 200 + Content-Type de audio) antes de insertar.
```

- [ ] **Step 3: Verificar el documento completo**

Run:
```bash
grep -c "audio" .opencode/skills/mongo-mensajes/SKILL.md
grep -n "### Ejemplo completo: mensaje con audio" .opencode/skills/mongo-mensajes/SKILL.md
grep -n "La skill \*\*solo prepara el texto TTS\*\*" .opencode/skills/mongo-mensajes/SKILL.md
```
Expected: las tres comprobaciones devuelven resultados no vacíos. El documento debe leerse de principio a fin sin secciones truncadas.

Nota: no commitear (`.opencode/` en `.gitignore`).

---

## Self-Review

**Cobertura del spec:**
- Sección 1 (bifurcación) → Task 4 ✓
- Sección 2 (etiquetas + reglas según texto) → Task 3 ✓
- Sección 3 (entrega texto TTS) → Task 3 ✓
- Sección 4 (HTML reproductor aprobado en pantalla) → Task 3 ✓
- Sección 5 (verificación URL) → Task 3 ✓
- Sección 6 (estructura skill) → Tasks 2, 3, 4, 5 ✓
- Sección 7 (carpeta data/audio) → Task 1 ✓
- Sección 8 (flujo consolidado) → Task 4 ✓

**Placeholders:** ninguno; todos los bloques de código tienen contenido real.

**Consistencia de tipos/names:** los nombres de carpetas (`data/audio/`), etiquetas Fish Audio, clases de estilos inline y estructura HTML coinciden entre Tasks 3, 4 y 5.