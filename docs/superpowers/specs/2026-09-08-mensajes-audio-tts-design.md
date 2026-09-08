# Diseño: Mensajes con audio TTS (mongo-mensajes skill)

**Fecha:** 2026-09-08
**Estado:** Aprobado
**Skill afectada:** `.opencode/skills/mongo-mensajes/SKILL.md`

## Objetivo

Ampliar la skill `mongo-mensajes` para soportar mensajes que incluyan un reproductor de audio (`<audio controls>`) con texto leído por voz. El audio se genera externamente con **Fish Audio** (texto a voz) a partir de un texto con etiquetas de entonación que la skill prepara, y se aloja en **GitHub** en la carpeta `data/audio/` del repo api-porra.

La skill solo prepara el **texto TTS** (bloque de código) para que el usuario lo pegue en fish.audio. No llama a la API de Fish Audio. No genera el archivo de audio.

## Contexto

- El campo `content` de `Message` es HTML que se renderiza tal cual en el frontend → incrustar `<audio>` no requiere cambios en backend/frontend.
- Los navegadores **bloquean el autoplay** con sonido sin interacción previa del usuario → el audio se reproduce con **botón manual** (controles nativos de `<audio>`).
- Fish Audio modelo S2 usa sintaxis de etiquetas en **corchetes** `[etiqueta]` colocadas justo antes de la palabra/frase que afectan.
- `.gitignore` actualmente ignora `data/*` excepto `fases.json` y `data/sofascore/` → hay que añadir una excepción para `data/audio/`.

## Enfoque elegido

**Enfoque A: Integrar el audio dentro del flujo existente de la skill.**
Se añade una bifurcación al inicio del flujo interactivo ("¿Este mensaje lleva audio de texto a voz?") y una sección nueva "Mensajes con audio" en la skill. Reutiliza toda la estructura actual (validación, preview, inserción).

## Etiquetas de entonación Fish Audio

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

### Reglas de colocación

- La etiqueta va **justo antes** de la palabra/frase que afecta.
- Pueden ir al inicio, medio o final de frase.
- Se pueden combinar: `[whispering] [sad] ...`
- `[emphasis]` solo afecta a la palabra siguiente.
- No abusar: 1-2 etiquetas por frase como máximo; evitar emociones contradictorias en el mismo tramo.

### Criterio de aplicación

**Se decide según el contenido del texto, no por el tipo de mensaje.** La skill lee el texto y aplica etiquetas donde el sentido lo pida:

- **Énfasis** (`[emphasis]`) → fechas, cifras, resultados, nombres propios clave, palabras importantes
- **Entusiasmo** (`[excited]`) → logros, enhorabuenas, buenas noticias, anuncios destacados
- **Seriedad/tristeza** (`[sad]`) → despedidas, noticias malas, cambios
- **Suavidad** (`[soft]`, `[whispering]`, `[breathy]`) → notas finales, disculpas, mensajes personales
- **Frustración** (`[angry]`) → advertencias fuertes, quejas (raro en este contexto)
- **Vergüenza** (`[embarrased]`) → disculpas o aclaraciones

## Entrega del texto TTS

La skill entrega el texto TTS en un **bloque de código** listo para copiar y pegar en fish.audio:

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

Tras entregarlo, la skill dice: *"Genera el audio en fish.audio, súbelo a GitHub y pásame la URL raw."*

## Carpeta de audios en el repo

- Carpeta: **`data/audio/`** del repo api-porra.
- `.gitignore`: añadir excepción para que se suba a GitHub. Patrón a revisar al implementar (el `data/*` actual bloquea todo; la excepción debe re-incluir `data/audio/` y su contenido).
- Convención de nombres: `YYYY-MM-DD-<slug>.mp3` (ej. `2026-09-08-fase-liga.mp3`). Minúsculas, guiones, sin espacios ni acentos.
- URL raw resultante:
  ```
  https://raw.githubusercontent.com/<user>/api-porra/<branch>/data/audio/2026-09-08-fase-liga.mp3
  ```

## HTML del reproductor (aprobado en pantalla)

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

  <p>¡Gran noticia! La fase de liga empieza el <strong>8 de septiembre</strong>.</p>
  ...
</div>
```

Reglas:
- `<audio controls>` con `height:32px` (compacto), sin JavaScript.
- Caja con borde `#ddd`, radio `8px`, fondo `#fafafa`, padding reducido (`8px 12px`).
- Etiqueta pequeña "▶ Escuchar el mensaje" (`font-size:0.8em`).
- El reproductor va **debajo del título y encima del texto**.
- URL raw de GitHub en el `src`, `type="audio/mpeg"` (u otro según extensión del archivo: `.wav`, `.ogg`, `.m4a`).

## Verificación de la URL del audio

Antes de insertar, la skill verifica la URL:
- Debe ser de `raw.githubusercontent.com` (o dominio de archivo directo).
- La extensión debe ser de audio (`.mp3`, `.wav`, `.ogg`, `.m4a`).
- Comprobación HTTP: fetch con status 200 y `Content-Type` de audio.

Errores:
- URL que no responde o no es de audio → aviso y se pide otra URL (no insertar).
- Usuario que aún no ha subido el audio → pedir que lo haga antes de continuar.

## Flujo completo en modo audio

1. Preguntar campos básicos (título, tipo, fechas, creador).
2. Preguntar el contenido del mensaje.
3. Generar el **texto TTS** con etiquetas según el texto (bloque de código para fish.audio).
4. Decir al usuario: genera el audio, súbelo a `data/audio/` (nombre `YYYY-MM-DD-<slug>.mp3`), pásame la URL raw.
5. Verificar la URL raw (responde 200 y `Content-Type` de audio).
6. Generar HTML: título → reproductor compacto → texto.
7. Validar con `validateMessage`, previsualizar y confirmar.
8. Insertar en MongoDB.

**Modo sin audio:** flujo actual sin cambios.

## Estructura de la skill modificada

1. **Frontmatter/description** — añadir keywords: `audio`, `tts`, `text to speech`, `texto a voz`, `fish audio`, `entonacion`, `reproductor`.
2. **Nueva sección "Mensajes con audio"** tras "Tipos disponibles":
   - Cuándo usar audio
   - Etiquetas Fish Audio y reglas de colocación
   - Criterio de aplicación según el texto
   - Formato de salida TTS (bloque de código)
   - HTML del reproductor (plantilla aprobada)
   - Verificación de URL raw
   - Carpeta `data/audio/` y convención de nombres
3. **Flujo interactivo actualizado** — bifurcación "¿Lleva audio?" al inicio; Pasos 2 y 3 adaptados al modo audio.
4. **Ejemplo completo** — nuevo ejemplo de mensaje con audio (flujo TTS → reproductor).
5. **Notas importantes** — añadir notas sobre autoplay bloqueado, URL raw, y que el TTS solo genera texto (no audio).

## No incluido (fuera de alcance)

- Llamada a la API de Fish Audio para generar el mp3 (el usuario lo hace manualmente).
- Cambios en backend (`server.js`, modelos, validación) — no son necesarios.
- Cambios en el frontend — no son necesarios.