# Separación DB test vs prod (Opción A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar entornos MongoDB para que Vercel use `prod` y local use `test` intercambiable, via suffix en `MONGODB_URI`, con `prod` clonada desde `test` y documentación actualizada.

**Architecture:** Sin tocar código de conexión (`db/connection.js:9` sigue `mongoose.connect(process.env.MONGODB_URI)`). El DB name lo determina el path de la URI (`.../test` vs `.../prod`). Atlas crea `prod` al primer write. Migración via scripts existentes `backupDB.js`/`restoreDB.js:26` (`{dbName}`) con precaución máxima sobre datos delicados actuales de `test` (hoy es la DB de producción).

**Tech Stack:** Node.js (ES Modules), Mongoose 9.x, MongoDB Atlas, Vercel Env Vars, dotenv

## Global Constraints

- ES Modules (`import/export`), no CommonJS
- No modificar `api-porra/db/connection.js` ni `porra-spa` (0 cambios en SPA, `js/main.js:9` intacto)
- `api-porra/.env` es gitignored (`api-porra/.gitignore:9`) - nunca commitear secretos
- Suffix explícito siempre: `.../test` y `.../prod`, nunca URI sin path (default silencioso a `test`)
- Datos de `test` son delicados (es la prod actual) - nunca borrar/sobrescribir `test`, backup obligatorio antes de cualquier write en `prod`
- `porra-spa` consume `https://api-porra.vercel.app` - sin cambios

---

### Task 1: Crear `.env.example` con convención test/prod

**Files:**
- Create: `api-porra/.env.example`
- Test: `api-porra/.env.example` existe y contiene suffix explícito

**Interfaces:**
- Consumes: `api-porra/.env:5` como referencia (URI actual sin suffix)
- Produces: Plantilla documentada para que devs sepan cambiar `/test` ↔ `/prod`

- [ ] **Step 1: Crear `api-porra/.env.example`**

```ini
# Entornos MongoDB - CAMBIAR SUFFIX SEGÚN ENTORNO
# Local/desarrollo (por defecto):
MONGODB_URI="mongodb+srv://usuario:password@porra.ojhmbig.mongodb.net/test"
# Para probar contra producción en local, cambiar a:
# MONGODB_URI="mongodb+srv://usuario:password@porra.ojhmbig.mongodb.net/prod"

JWT_SECRET=porra-ucl-champions-2026-secret-key-change-in-production
FRONTEND_URL=https://porra-spa.vercel.app
PORT=3000
```

- [ ] **Step 2: Verificar que no se ignora `.env.example` y que `.env` sigue ignorado**

```bash
grep -q "^\.env$" api-porra/.gitignore && echo "OK .env ignorado"
grep -q "^\.env\.example" api-porra/.gitignore && echo "FAIL .env.example no debe estar ignorado" || echo "OK .env.example trackeable"
ls -la api-porra/.env.example
cat api-porra/.env.example
```

Expected: `OK .env ignorado`, `OK .env.example trackeable`, archivo existe con 3 vars y comentarios `/test`/`/prod`.

- [ ] **Step 3: Commit**

```bash
git add api-porra/.env.example
git commit -m "docs: add .env.example with test/prod URI convention"
```

---

### Task 2: Documentar entornos en `AGENTS.md` (prod vs test)

**Files:**
- Modify: `api-porra/AGENTS.md:436-443` (tabla Variables de Entorno y sección MongoDB)
- Test: `grep` verifica doc menciona `/test` y `/prod`

**Interfaces:**
- Consumes: Plantilla de Task 1 para coherencia de ejemplos
- Produces: Doc canónica que explica separación entornos para futuros devs

- [ ] **Step 1: Editar `api-porra/AGENTS.md` - ampliar tabla `MONGODB_URI` y sección MongoDB**

Reemplazar bloque actual `AGENTS.md:436-443`:

```markdown
| Variable         | Descripción                                    | Ejemplo                          |
|------------------|------------------------------------------------|----------------------------------|
| `JWT_SECRET`     | Secreto para firmar tokens JWT                 | `mi-secreto-seguro`             |
| `FRONTEND_URL`   | URL del frontend para CORS                     | `https://porra-spa.vercel.app`  |
| `PORT`           | Puerto del servidor (default: 3000)            | `3000`                          |
| `MONGODB_URI`    | URI de conexión a MongoDB Atlas (suffix define DB) | `mongodb+srv://...@porra.ojhmbig.mongodb.net/test` (dev) / `.../prod` (Vercel prod) |
| `MONGODB_URI` (local prod) | Para probar prod en local cambiar suffix a `/prod` | `mongodb+srv://...@porra.ojhmbig.mongodb.net/prod` |

> **Entornos DB:** `test` = desarrollo/pruebas (local por defecto, `api-porra/.env.example`). `prod` = producción (Vercel env var `MONGODB_URI` termina en `/prod`). El suffix de la URI es la DB (`/test`→`test`, `/prod`→`prod`). Sin suffix Mongo usa `test` por defecto - **siempre explicitar**. Migración inicial `test→prod` via `node scripts/backupDB.js` + `node scripts/restoreDB.js data/backups/<ts> prod` (ver `scripts/restoreDB.js:8,26`). **Precaución:** `test` contiene datos delicados de producción actual - nunca borrar/sobrescribir `test`.

> **Nota**: `GITHUB_TOKEN` ya no es necesaria. La persistencia GitHub se eliminó tras la migración a MongoDB (los ficheros `data/users/*.json` fueron borrados del repo). `github.js` y `scripts/migrateToMongo.js` fueron eliminados.
```

- [ ] **Step 2: Verificar doc**

```bash
grep -n "MONGODB_URI" api-porra/AGENTS.md
grep -n "/prod" api-porra/AGENTS.md
grep -n "/test" api-porra/AGENTS.md
grep -n "Entornos DB" api-porra/AGENTS.md
```

Expected: Múltiples hits con `/test`, `/prod`, y bloque `Entornos DB`.

- [ ] **Step 3: Verificar que tests siguen pasando (sin regresión)**

```bash
node --test tests/*.test.js 2>&1 | tail -20
```

Expected: Todos PASS (8+ suites).

- [ ] **Step 4: Commit**

```bash
git add api-porra/AGENTS.md
git commit -m "docs: document test/prod DB environments in AGENTS.md"
```

---

### Task 3: Runbook operativo y verificación (manual, con máxima precaución datos delicados)

**Files:**
- Modify: `api-porra/.env` local (manual, no commitear) - solo documentado aquí
- Test: Verificación de conectividad y conteos sin pérdida de `test`

**Interfaces:**
- Consumes: Scripts `scripts/backupDB.js:19`, `scripts/restoreDB.js:26`, Task 1/2 doc
- Produces: `prod` clonada, verificada, y Vercel apuntando a `prod`

> **ADVERTENCIA DATOS DELICADOS:** `test` es hoy la prod real. Este task es 100% manual y con backup obligatorio. Nunca ejecutar `deleteMany` contra `test`.

- [ ] **Step 1: Backup obligatorio de `test` (antes de tocar `prod`)**

```bash
# Con .env apuntando a /test
cat api-porra/.env | grep MONGODB_URI
node scripts/backupDB.js
ls -lh data/backups/$(ls -t data/backups | head -1)/
cat data/backups/$(ls -t data/backups | head -1)/users.json | head -20
```

Expected: `MONGODB_URI` termina en `/test`, backup dir creado con `users.json`, `invitations.json`, `gameconfigs.json`, `matchstats.json`, `messages.json`, totalDocs >0.

- [ ] **Step 2: Verificar `prod` vacía antes de restore (no pisar datos residuales sin saber)**

```bash
# Cambiar .env temporal a /prod y contar
MONGODB_URI="mongodb+srv://...@porra.ojhmbig.mongodb.net/prod" node -e "
import mongoose from 'mongoose';
import 'dotenv/config';
const uri=process.env.MONGODB_URI.replace('/test','/prod');
await mongoose.connect(uri);
const cols=await mongoose.connection.db.listCollections().toArray();
console.log('Colecciones en prod:', cols.map(c=>c.name));
for(const {name} of cols){ const n=await mongoose.connection.db.collection(name).countDocuments(); console.log(name, n); }
await mongoose.disconnect();
"
```

Expected: 0 colecciones o conteos 0. Si hay datos, abortar y preguntar.

- [ ] **Step 3: Restore `test → prod` (clon)**

```bash
BACKUP_DIR=data/backups/$(ls -t data/backups | head -1)
node scripts/restoreDB.js $BACKUP_DIR prod
```

Expected: Log `Restaurando backup desde ... Base de datos destino: prod` + `X documentos restaurados` por colección. Script usa `restoreIds()` y `insertMany` solo en `prod`.

- [ ] **Step 4: Verificar conteos `prod` == `test`**

```bash
node -e "
import mongoose from 'mongoose';
import 'dotenv/config';
async function count(uri){ await mongoose.connect(uri); const db=mongoose.connection.db; const cols=await db.listCollections().toArray(); const out={}; for(const {name} of cols) out[name]=await db.collection(name).countDocuments(); await mongoose.disconnect(); return out; }
const base=process.env.MONGODB_URI.replace(/\/[^\/]*$/,'');
const test=await count(base+'/test');
const prod=await count(base+'/prod');
console.log('test:', test);
console.log('prod:', prod);
console.log('Match:', JSON.stringify(test)===JSON.stringify(prod) ? 'OK' : 'DIFF - revisar');
"
```

Expected: `test:` y `prod:` con mismos conteos, `Match: OK`.

- [ ] **Step 5: Verificar conectividad app contra ambas DBs**

```bash
# Con /test
MONGODB_URI=".../test" npm start & sleep 2; curl -s http://localhost:3000/api/config | head -c 200; kill %1
# Con /prod
MONGODB_URI=".../prod" npm start & sleep 2; curl -s http://localhost:3000/api/config | head -c 200; kill %1
```

Expected: Ambos responden `ok:true` con misma `faseJuego`.

- [ ] **Step 6: Actualizar Vercel env var y redeploy (manual en dashboard)**

```
Vercel Dashboard → api-porra → Settings → Environment Variables → MONGODB_URI = .../prod → Save → Redeploy
```

Verificar post-deploy:

```bash
curl -s https://api-porra.vercel.app/api/config | grep faseJuego
curl -s https://api-porra.vercel.app/api/players | head -c 200
```

Expected: Responden desde `prod`.

- [ ] **Step 7: Restaurar local a `/test` y commit final si hubo ajustes**

```bash
grep MONGODB_URI api-porra/.env
# debe terminar en /test
git status
```

Expected: Working tree clean (`.env` ignorado, solo docs trackeados). Si todo OK, no hay commit adicional.

```

