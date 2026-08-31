# Diseño: Separación de entornos DB `test` vs `prod` (Opción A - URI suffix)

**Fecha:** 2026-08-31
**Estado:** Aprobado
**Repo afectado:** `api-porra` (porra-spa sin cambios)
**Decisión:** Opción A - suffix en `MONGODB_URI`, Vercel=prod, local intercambiable

---

## 1. Contexto y problema

Actualmente `api-porra` conecta sin DB explícita:

```js
// api-porra/db/connection.js:9
await mongoose.connect(process.env.MONGODB_URI);
```

Con `MONGODB_URI="mongodb+srv://...@porra.ojhmbig.mongodb.net"` (sin path, `api-porra/.env:5`) Mongo/Mongoose usa por defecto la DB `test`. Todo (dev, pruebas manuales y producción en Vercel) comparte la misma DB implícita. Se necesita:
- Dejar `test` para pruebas/desarrollo
- Crear `prod` para producción
- Poder cambiar local entre `test`/`prod` editando `.env` manualmente
- Migración inicial `test → prod` vía scripts existentes

`porra-spa` es SPA estática (`js/main.js:9` `API_BASE` = `localhost:3000` o `https://api-porra.vercel.app`) sin acceso directo a Mongo → 0 cambios.

---

## 2. Objetivos

1. Vercel producción siempre contra `prod`.
2. Local por defecto `test`, intercambiable a `prod` manualmente.
3. `prod` arranca como copia de `test` (usuarios, invitaciones, `gameconfigs`, etc.).
4. Cambio mínimo, sin tocar lógica de conexión ni `porra-spa`.
5. Documentar convención en `AGENTS.md` y `.env.example`.

## 3. No objetivos

- Variable separada `MONGODB_DB` o refactor de `connection.js`.
- Script `npm run use:prod` / helpers.
- Automatizar switch local.
- Cambios en `porra-spa`, `vercel.json` de api-porra, o modelos.

---

## 4. Diseño

### 4.1 Estrategia de DB (URI suffix)

- `mongodb+srv://...@porra.ojhmbig.mongodb.net/test` → DB `test`
- `mongodb+srv://...@porra.ojhmbig.mongodb.net/prod` → DB `prod`
- Sin suffix → `test` (default Mongo, comportamiento legacy). Se desaconseja; siempre explicitar suffix.
- Atlas crea `prod` automáticamente al primer write, no requiere UI.

### 4.2 Cambios concretos

| Fichero | Cambio |
|---|---|
| `api-porra/.env` (gitignored, `api-porra/.gitignore:9`) | `MONGODB_URI="...net/test"` explícito. Comentario `# cambiar a /prod para probar prod en local` |
| Vercel Env Var `MONGODB_URI` | `...net/prod` |
| `api-porra/.env.example` (nuevo) | Plantilla con `MONGODB_URI=.../test`, `JWT_SECRET`, `FRONTEND_URL` |
| `api-porra/AGENTS.md` | Tabla `MONGODB_URI` (`AGENTS.md:441`) añadir nota: `...net/test` (dev) vs `...net/prod` (Vercel). Sección `MongoDB` documentar entornos |
| `api-porra/db/connection.js:9` | **Sin tocar** (`mongoose.connect(process.env.MONGODB_URI)`) |

`scripts/*.js` (`backupDB.js:7`, `restoreDB.js:22`, `scrape*.js:20`) heredan URI sin cambios.

### 4.3 Flujo de migración `test → prod`

1. **Backup test:** con `.env=/test` → `node scripts/backupDB.js` → `data/backups/<timestamp>/*.json` (`api-porra/scripts/backupDB.js:19-30`).
2. **Restore a prod:** `node scripts/restoreDB.js data/backups/<ts> prod` → `api-porra/scripts/restoreDB.js:26` usa `mongoose.connect(uri, {dbName})` y reconvierte `ObjectId` (`restoreIds()`).
3. **Verificación:** conectar a `prod` y validar `users`, `invitations`, `gameconfigs`, `matchstats`, `messages`.

Rollback: `prod` es nueva, re-restaurar o borrar en Atlas no afecta `test`.

### 4.4 Verificación y testing

- `npm start` con `/test` → `curl http://localhost:3000/api/config` responde desde test
- Cambiar a `/prod` → mismo endpoint responde desde prod (datos clonados, `faseJuego` idéntica)
- `node --test tests/*.test.js` → siguen pasando (no tocan BD)
- Edge: URI sin suffix cae en `test` silencioso → mitigado con `.env.example` + doc

### 4.5 Fuera de alcance / riesgos

| Riesgo | Mitigación |
|---|---|
| Olvidar suffix en Vercel queda en `test` | Doc + `.env.example`, verificar tras deploy con `GET /api/config` |
| Preview deployments comparten `prod` | Deseado per requisito "prod siempre prod" |
| Escribir accidentalmente en prod desde local | Aceptado; usuario edita manual conscientemente |

---

## 5. Criterios de éxito

1. Vercel `MONGODB_URI` termina en `/prod`.
2. Local `.env` termina en `/test` y al cambiar a `/prod` lee/escribe en prod.
3. `prod` contiene copia de `test` post-migración.
4. `AGENTS.md` y `.env.example` documentan entornos.
5. Ningún test roto, `porra-spa` sin cambios.

---

## 6. Plan de implementación (resumen para writing-plans)

1. Crear `.env.example`
2. Actualizar `AGENTS.md` (tabla env + sección MongoDB)
3. Actualizar `.env` local a `/test` (opcional, manual)
4. Migrar datos `test → prod` (manual, con scripts existentes)
5. Actualizar Vercel env var a `/prod` (manual)
6. Verificar endpoints
