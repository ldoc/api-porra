# Token anti-captcha de Sofascore — Design

**Fecha**: 2026-11-24
**Estado**: aprobado

## Problema

Sofascore ha añadido una puerta anti-bot con Cloudflare Turnstile delante de
`www.sofascore.com`. Sin un JWT emitido tras resolver el captcha, el edge
responde `403 {"error":{"code":403,"reason":"challenge"}}` a todas las
peticiones (API incluida). El navegador lo supera porque resuelve Turnstile,
hace `POST /api/v1/token/captcha` con `{response, provider:'turnstile'}` y
guarda el JWT devuelto como cookie `sofa_captcha` (localStorage
`sofa.captcha.token`). El scraper live y el resto de scripts que usan
`fetchSofascore` no pueden ejecutar JS, por lo que todo el scraping está
parado.

La propia página del captcha indica que las llamadas API pueden llevar el JWT
en cabecera `X-Captcha` (la cookie es para navegaciones HTML, "which cannot
carry X-Captcha").

## Objetivo

Automatizar la obtención y renovación del JWT de forma que el scraping local
(scrapeo live periódico, calendario, matchStats, etc.) vuelva a funcionar sin
intervención humana.

## Alcance

- **Solo scraper local**: el token no se comparte con el despliegue de Vercel
  (`GET /api/match-stats/:eventId` en producción seguirá sin token; fuera de
  alcance por decisión del usuario).
- Cubre a todos los consumidores locales de `fetchSofascore`, porque la
  solución vive en la capa HTTP compartida.

## Arquitectura

### 1. `scripts/sofascoreToken.js` (nuevo módulo)

Una sola responsabilidad: entregar un JWT válido.

- `getSofascoreToken()`: lee la cache `data/.sofascore-token.json`
  (`{ token, exp }`, `exp` en ms decodificado del JWT). Devuelve el token si
  existe y no expira en los próximos 10 min (`REFRESH_MARGIN_MS`); en caso
  contrario lanza un refresco y persiste el resultado. El fichero entra en
  `.gitignore` (contiene un secreto).
- Refresco con Playwright (Chromium):
  1. Abre `https://www.sofascore.com/captcha.html?redirectUrl=<same-origin
     URL-encoded>` (la página de captcha exige el parámetro `redirectUrl`;
     sin él muestra "Access denied" y no renderiza el widget).
  2. Espera a que Turnstile resuelva (modo managed: normalmente pasivo) e
     intercepta la respuesta del `POST /api/v1/token/captcha` para capturar
     el JWT.
  3. Cierra el navegador, escribe `{ token, exp }` en la cache y devuelve.
- **Mutex**: las llamadas concurrentes (el scraper live lanza ~3 endpoints ×
  7 partidos en paralelo) comparten una única promesa de refresco en vuelo;
  nunca se abre más de un navegador a la vez.
- **Fallbacks en cascada**:
  1. Headless (intento principal).
  2. Headed (`headless: false`; con Xvfb si no hay display).
  3. Error `CAPTCHA_FAILED` con instrucciones para pegar a mano el token del
     navegador (localStorage `sofa.captcha.token` o cookie `sofa_captcha`)
     en `data/.sofascore-token.json` o en la var de entorno.
- **Override manual**: variable de entorno `SOFASCORE_CAPTCHA_TOKEN` (se
  documenta en `.env.example`); si está definida tiene preferencia sobre la
  cache de fichero y no se refresca automáticamente.
- Timeout del intento de solución: 60 s, con un reintento por modo antes de
  pasar al siguiente fallback.

### 2. `scripts/sofascoreHttp.js` (modificación mínima)

- Añade a cada petición la cabecera `x-captcha: <JWT>` y la cookie
  `sofa_captcha=<JWT>` (se envían ambas; cuál valida el edge se confirmará
  en la sonda de factibilidad).
- Si una respuesta es `403` con body `"reason":"challenge"`: borra la cache
  del token, fuerza un refresco y reintenta la petición **una sola vez**.
- El resto de reintentos (429/5xx con backoff) y validaciones (URL
  permitida, timeout) quedan intactos.
- **Import lazy** del módulo de token (`await import()` con try/catch):
  `server.js` (Vercel) llega a `sofascoreHttp.js` vía
  `scripts/matchStats.js`; allí no habrá Playwright instalado y el import
  debe fallar de forma silenciosa (se scrapea sin token, como hoy).
- `playwright` se añade a `devDependencies` (solo se usa en local).

## Flujo de datos

```
fetchSofascore(url)
  → getSofascoreToken()          # cache fichero → refresco on-demand (mutex)
  → petición con X-Captcha + cookie
  → 403 challenge? → invalidar token → refresco → retry único
```

## Manejo de errores

- Refresco fallido (Turnstile no resuelve en ningún modo) → error
  `CAPTCHA_FAILED` con instrucciones manuales. El tick del scraper live lo
  loguea y reintenta en el ciclo siguiente (comportamiento conservado:
  `lastScrapeOk:false`, no avanza hashes ni snapshots).
- Caducadura a mitad de jornada → detectada por el margen de 10 min y, si se
  escapa, por el retry ante `403 challenge`.
- La vida útil real del JWT se logueará al obtener el primero (desconocida a
  día de hoy).

## Testing

- Tests unitarios de la lógica pura de `sofascoreToken.js` (decodificación
  de `exp`, decisión de refresco, override por env, persistencia de cache)
  con mocks de fs; siguiendo el patrón de `tests/`.
- Sonda de factibilidad como primer paso de implementación: comprobar si
  Turnstile resuelve en headless (condiciona el detalle del fallback
  headed).
- Verificación final: `node --env-file=.env scripts/scrapeLiveMatches.js
  --once` con partidos en ventana (o un eventId terminado para la sonda) y
  observación de que se obtiene/renueva el token.

## Riesgos

- Turnstile puede exigir interacción en algunos casos; el headed de respaldo
  lo cubre en local.
- El JWT podría caducar en horas; el refresco on-demand lo hace transparente.
- Sofascore puede endurecer más el anti-bot en el futuro; el error
  `CAPTCHA_FAILED` lo dejará visible en los logs.

## Enmienda (2026-11-25): renovación manual, sin Playwright

La sonda de factibilidad Playwright FALLÓ: Turnstile rechaza navegadores
automatizados en todos los modos (headless, headed bajo Xvfb y headed en
display real con click humano válido → "no era válido"). En paralelo se
validó con petición real que el token manual SÍ funciona con el fingerprint
firefox-117 del scraper (200 con cabecera `X-Captcha`; el token es ligado a
la IP, TTL ~12 h).

Cambio de diseño aprobado por el usuario:

- Se elimina el refresco Playwright (código y devDependency).
- `getSofascoreToken`: env `SOFASCORE_CAPTCHA_TOKEN` → cache de fichero
  (releída en cada llamada → renovación en caliente sin reiniciar) → error
  `CAPTCHA_FAILED` con la URL de renovación e instrucciones.
- Renovación manual semiautomática: abrir la URL del captcha en el
  navegador de confianza (resuelve solo), copiar localStorage
  `sofa.captcha.token` y ejecutar
  `node scripts/sofascoreToken.js --set <jwt>`.
- `sofascoreHttp.js` queda igual salvo que ante `403 challenge` solo
  invalida la cache y reintenta una vez (sin refrescar forzado).

## Enmienda 2 (2026-11-25): renovación automática desatendida con camoufox

Sondas de factibilidad (2026-11-25, todas reales contra Sofascore):

- Playwright (Chromium): rechazado en headless, headed-Xvfb y headed en
  display real incluso con click humano válido.
- patchright + Chrome real del sistema: rechazado.
- **camoufox (Firefox endurecido, motor Gecko): ACEPTADO.** Modo
  `headless: 'virtual'` (display virtual propio) + pantalla
  `1920x1080x24` (`CAMOUFOX_VIRTUAL_DISPLAY_SIZE`): Turnstile resuelve
  pasivamente, sin interacción ni ventana visible. Sin el tamaño de pantalla
  explícito el display virtual por defecto NO pasa. El headless normal de
  camoufox tampoco pasa. El headed en display real del usuario también pasa.
- TTL del JWT emitido: **~60 min** (igual que el obtenido desde el
  navegador).

Cambio de diseño aprobado por el usuario:

- `getSofascoreToken` recupera la orquestación con refresco automático y
  mutex (patrón de la Task 1 original): env override → cache válida →
  refresco con camoufox → persistencia en cache → token.
- **Requisito explícito del usuario: la vía manual se CONSERVA como
  fallback** — si camoufox falla (Sofascore endurece contra él, binario
  ausente, sin Xvfb...), el error `CAPTCHA_FAILED` mantiene las
  instrucciones manuales (URL del captcha + `--set <jwt>` + env
  `SOFASCORE_CAPTCHA_TOKEN`), y el CLI `--set` sigue existiendo.
- Requisitos locales documentados (Ubuntu 20.04, glibc 2.31): devDeps
  `camoufox` + `playwright-core@1.62`; binario del navegador en
  `data/camoufox/` (gitignored, ~4 GB, descarga manual desde los releases
  de daijro/camoufox); stub de `impit` (dependencia de camoufox que exige
  glibc ≥ 2.33) persistido en `vendor/impit-stub/` vía `overrides` —
  nunca se invoca sin proxy.
- Vercel sigue intacta: imports lazy try/catch ya existentes; el refresco
  solo corre en local.
- `sofascoreHttp.js` NO cambia: su `cargarTokenPorDefecto` ya llama a
  `getSofascoreToken`, que ahora se autorepara; y ante `403 challenge`
  invalida y reintenta (el reintento ya recoge el token recién refrescado).
