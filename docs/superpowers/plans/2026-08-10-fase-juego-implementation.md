# Sistema de Fases del Juego - Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el sistema de fechas por un sistema de fases explícitas controlado por un administrador, moviendo toda la configuración a MongoDB.

**Architecture:** Sistema centralizado en MongoDB con un documento `gameConfig` que almacena la fase actual y la configuración del torneo. Backend expone endpoints de admin para cambiar la fase. Frontend muestra panel de admin con modal de confirmación.

**Tech Stack:** Node.js, MongoDB (Mongoose), Vanilla JavaScript (frontend)

## Global Constraints

- Commits y pushes a GitHub los realizará el usuario manualmente después de completar la implementación
- Seguir convenciones existentes del proyecto (ES Modules, naming en español)
- No eliminar `config.json` hasta que la migración esté verificada
- FASE_PRE16 tiene comportamiento temporal idéntico a FASE_LIGA
- El campo `isAdmin` por defecto es `false`

---

## Estructura de Archivos

### Archivos a Crear (Backend)
- `db/models/GameConfig.js` - Modelo Mongoose para configuración del juego
- `scripts/migrateConfig.js` - Script de migración de config.json a MongoDB

### Archivos a Modificar (Backend)
- `db/models/User.js` - Añadir campo `isAdmin`
- `server.js` - Eliminar lógica de fechas, añadir lógica de fases y endpoints admin
- `config.json` - Eliminar después de migración verificada

### Archivos a Modificar (Frontend)
- `js/main.js` - Reemplazar funciones de fecha por funciones de fase, añadir panel admin
- `index.html` - Añadir modal de confirmación y panel admin

---

### Task 1: Crear Modelo GameConfig en MongoDB

**Files:**
- Create: `db/models/GameConfig.js`

**Interfaces:**
- Produces: Modelo `GameConfig` con métodos `findById()`, `create()`, `updateOne()`

- [ ] **Step 1: Crear el esquema de Mongoose**

```javascript
import mongoose from 'mongoose';

const gameConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'gameConfig' },
  faseJuego: {
    type: String,
    enum: ['FASE_PRETEMPORADA', 'FASE_LIGA', 'FASE_PRE16'],
    default: 'FASE_PRETEMPORADA'
  },
  tournament: {
    totalMatches: { type: Number, default: 144 },
    squadSize: { type: Number, default: 25 },
    squadFormation: {
      G: { type: Number, default: 3 },
      D: { type: Number, default: 8 },
      M: { type: Number, default: 8 },
      F: { type: Number, default: 6 }
    }
  },
  updatedBy: { type: String },
  updatedAt: { type: Date }
}, { 
  collection: 'gameconfigs',
  timestamps: false 
});

const GameConfig = mongoose.model('GameConfig', gameConfigSchema);

export default GameConfig;
```

- [ ] **Step 2: Verificar que el modelo se puede importar**

Crear un script de prueba temporal o verificar en consola de Node:
```bash
node -e "import('./db/models/GameConfig.js').then(m => console.log('Modelo cargado:', Object.keys(m.default.schema.paths)))"
```

Expected: Debe mostrar las paths del schema sin errores

---

### Task 2: Añadir Campo isAdmin al Modelo User

**Files:**
- Modify: `db/models/User.js`

**Interfaces:**
- Produces: Campo `isAdmin: Boolean` en el modelo User

- [ ] **Step 1: Localizar el esquema de User**

Buscar el Schema definition en `db/models/User.js` y añadir el campo `isAdmin`.

- [ ] **Step 2: Añadir campo isAdmin al esquema**

Dentro del schema de User, añadir:
```javascript
isAdmin: { type: Boolean, default: false }
```

- [ ] **Step 3: Verificar que el modelo compila**

```bash
node -e "import('./db/models/User.js').then(m => console.log('User schema paths:', Object.keys(m.default.schema.paths)))"
```

Expected: Debe mostrar `isAdmin` entre las paths del schema

---

### Task 3: Script de Migración de Configuración

**Files:**
- Create: `scripts/migrateConfig.js`

**Interfaces:**
- Consumes: `leerFichero` de `github.js`, modelo `GameConfig`, modelo `User`
- Produces: Documento en MongoDB colección `gameconfigs`

- [ ] **Step 1: Crear script de migración**

```javascript
import { leerFichero } from '../github.js';
import GameConfig from '../db/models/GameConfig.js';
import User from '../db/models/User.js';
import connectDB from '../db/connection.js';

async function migrate() {
  await connectDB();
  
  // 1. Leer config.json de GitHub
  console.log('Leyendo config.json de GitHub...');
  const configData = await leerFichero('data/config.json');
  
  if (!configData) {
    console.error('No se pudo leer config.json');
    process.exit(1);
  }
  console.log('Config.json leído:', configData);
  
  // 2. Verificar si ya existe configuración en MongoDB
  const existingConfig = await GameConfig.findById('gameConfig');
  
  if (existingConfig) {
    console.log('Ya existe configuración en MongoDB, saltando migración de config');
    console.log('Configuración actual:', existingConfig);
  } else {
    // 3. Crear documento de configuración en MongoDB
    const newConfig = await GameConfig.create({
      _id: 'gameConfig',
      faseJuego: 'FASE_PRETEMPORADA',
      tournament: {
        totalMatches: configData.totalMatches || 144,
        squadSize: configData.squadSize || 25,
        squadFormation: configData.squadFormation || { G: 3, D: 8, M: 8, F: 6 }
      },
      updatedBy: 'system',
      updatedAt: new Date()
    });
    console.log('Configuración migrada a MongoDB:', newConfig);
  }
  
  // 4. Designar admin (opcional, solo si se proporciona ADMIN_USERNAME)
  const adminUsername = process.env.ADMIN_USERNAME;
  if (adminUsername) {
    const result = await User.updateOne(
      { username: adminUsername },
      { $set: { isAdmin: true } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Usuario ${adminUsername} marcado como admin`);
    } else {
      console.log(`Usuario ${adminUsername} no encontrado en la base de datos`);
    }
  } else {
    console.log('No se proporcionó ADMIN_USERNAME, saltando designación de admin');
  }
  
  console.log('Migración completada exitosamente');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Error en migración:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Ejecutar migración (sin admin)**

```bash
node scripts/migrateConfig.js
```

Expected: "Configuración migrada a MongoDB" o "Ya existe configuración en MongoDB"

- [ ] **Step 3: Ejecutar migración con admin**

```bash
ADMIN_USERNAME=tu_usuario_real node scripts/migrateConfig.js
```

Expected: "Usuario tu_usuario_real marcado como admin"

---

### Task 4: Modificar Endpoint GET /api/config

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: Modelo `GameConfig`
- Produces: Respuesta JSON con `faseJuego` y configuración del torneo

- [ ] **Step 1: Importar modelo GameConfig en server.js**

Añadir al inicio de `server.js`:
```javascript
import GameConfig from './db/models/GameConfig.js';
```

- [ ] **Step 2: Crear función getFaseJuego()**

Añadir función en `server.js`:
```javascript
async function getFaseJuego() {
  try {
    const config = await GameConfig.findById('gameConfig');
    return config?.faseJuego || 'FASE_PRETEMPORADA';
  } catch (error) {
    console.error('Error obteniendo fase del juego:', error);
    return 'FASE_PRETEMPORADA';
  }
}
```

- [ ] **Step 3: Modificar endpoint GET /api/config**

Reemplazar la lógica actual del endpoint para leer de MongoDB:
```javascript
// GET /api/config
if (method === 'GET' && pathname === '/api/config') {
  try {
    const config = await GameConfig.findById('gameConfig');
    
    if (!config) {
      // Fallback si no existe en MongoDB
      return res.end(JSON.stringify({
        ok: true,
        config: {
          faseJuego: 'FASE_PRETEMPORADA',
          totalMatches: 144,
          squadSize: 25,
          squadFormation: { G: 3, D: 8, M: 8, F: 6 }
        }
      }));
    }
    
    return res.end(JSON.stringify({
      ok: true,
      config: {
        faseJuego: config.faseJuego,
        totalMatches: config.tournament.totalMatches,
        squadSize: config.tournament.squadSize,
        squadFormation: config.tournament.squadFormation
      }
    }));
  } catch (error) {
    console.error('Error obteniendo config:', error);
    return res.end(JSON.stringify({ ok: false, error: 'Error interno' }));
  }
}
```

- [ ] **Step 4: Verificar endpoint**

```bash
curl http://localhost:3000/api/config
```

Expected: JSON con `faseJuego: "FASE_PRETEMPORADA"` y configuración del torneo

---

### Task 5: Eliminar Lógica de Fechas y Funciones esFrozen/esFinalsFrozen

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: Función `getFaseJuego()`
- Produces: Endpoints usando fase en lugar de fechas

- [ ] **Step 1: Eliminar funciones esFrozen() y esFinalsFrozen()**

Buscar y eliminar estas funciones de `server.js`:
```javascript
// ELIMINAR:
function esFrozen() { ... }
function esFinalsFrozen() { ... }
```

- [ ] **Step 2: Eliminar variables de caché de config (si existen)**

Eliminar variables como `configCache`, `configCacheTime`, y la función `getConfig()` si solo se usaba para config.json.

- [ ] **Step 3: Modificar endpoint PUT /predictions**

Reemplazar `esFrozen()` por `getFaseJuego()`:
```javascript
// PUT /predictions
if (method === 'PUT' && pathname === '/api/predictions') {
  const fase = await getFaseJuego();
  if (fase !== 'FASE_PRETEMPORADA') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Los pronosticos estan bloqueados' }));
  }
  // ... resto de la lógica
}
```

- [ ] **Step 4: Modificar endpoint GET /predictions**

Reemplazar lógica de visibilidad:
```javascript
// GET /predictions
const fase = await getFaseJuego();
const isPublic = fase !== 'FASE_PRETEMPORADA';

if (!isPublic && requestedUsername !== authenticatedUsername) {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ok: false, error: 'Solo puedes ver tus propios pronosticos' }));
}
```

- [ ] **Step 5: Modificar endpoint PUT /squad**

```javascript
// PUT /squad
const fase = await getFaseJuego();
if (fase !== 'FASE_PRETEMPORADA') {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ok: false, error: 'La plantilla esta bloqueada' }));
}
```

- [ ] **Step 6: Modificar endpoint GET /squad**

```javascript
// GET /squad
const fase = await getFaseJuego();
const isPublic = fase !== 'FASE_PRETEMPORADA';

if (!isPublic && requestedUsername !== authenticatedUsername) {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ok: false, error: 'Solo puedes ver tu propia plantilla' }));
}
```

- [ ] **Step 7: Modificar endpoint PUT /final-predictions**

```javascript
// PUT /final-predictions
const fase = await getFaseJuego();
if (fase !== 'FASE_PRETEMPORADA') {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ok: false, error: 'Los pronosticos finales estan bloqueados' }));
}
```

- [ ] **Step 8: Modificar endpoint GET /final-predictions**

```javascript
// GET /final-predictions
const fase = await getFaseJuego();
const isPublic = fase !== 'FASE_PRETEMPORADA';

if (!isPublic && requestedUsername !== authenticatedUsername) {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ok: false, error: 'Solo puedes ver tus propios pronosticos finales' }));
}
```

- [ ] **Step 9: Modificar endpoint GET /players**

```javascript
// GET /players
const fase = await getFaseJuego();
const showPoints = fase !== 'FASE_PRETEMPORADA';

// En la respuesta, solo incluir puntos si showPoints es true
const playerData = {
  name: player.username,
  avatar: player.avatar,
  ...(showPoints && { points: player.points, hits: player.hits })
};
```

- [ ] **Step 10: Modificar endpoint GET /predictions/all**

```javascript
// GET /predictions/all
const fase = await getFaseJuego();
const isPublic = fase !== 'FASE_PRETEMPORADA';

if (!isPublic && !authenticatedUsername) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ok: false, error: 'No autorizado' }));
}

if (!isPublic) {
  // Solo retornar predicciones del usuario autenticado
  const userPredictions = await getPredictionsForUser(authenticatedUsername);
  return res.end(JSON.stringify({ ok: true, predictions: { [authenticatedUsername]: userPredictions } }));
}
```

- [ ] **Step 11: Modificar endpoint GET /squad/all**

```javascript
// GET /squad/all
const fase = await getFaseJuego();
const isPublic = fase !== 'FASE_PRETEMPORADA';

if (!isPublic && !authenticatedUsername) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ok: false, error: 'No autorizado' }));
}

if (!isPublic) {
  // Solo retornar plantilla del usuario autenticado
  const userSquad = await getSquadForUser(authenticatedUsername);
  return res.end(JSON.stringify({ ok: true, squads: { [authenticatedUsername]: userSquad } }));
}
```

- [ ] **Step 12: Verificar todos los endpoints**

Probar cada endpoint manualmente para verificar que la lógica de fases funciona correctamente.

---

### Task 6: Crear Endpoints de Admin

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: Modelo `GameConfig`, modelo `User`, función `getFaseJuego()`
- Produces: Endpoints PUT /api/admin/fase-juego y PUT /api/admin/config

- [ ] **Step 1: Crear función de verificación de admin**

```javascript
async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ username: decoded.username });
    
    if (!user || !user.isAdmin) {
      return null;
    }
    
    return user;
  } catch (error) {
    return null;
  }
}
```

- [ ] **Step 2: Crear endpoint PUT /api/admin/fase-juego**

```javascript
// PUT /api/admin/fase-juego
if (method === 'PUT' && pathname === '/api/admin/fase-juego') {
  const admin = await verifyAdmin(req);
  
  if (!admin) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' }));
  }
  
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { faseJuego } = JSON.parse(body);
      
      const fasesValidas = ['FASE_PRETEMPORADA', 'FASE_LIGA', 'FASE_PRE16'];
      if (!fasesValidas.includes(faseJuego)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          ok: false, 
          error: `Fase inválida. Valores permitidos: ${fasesValidas.join(', ')}` 
        }));
      }
      
      const config = await GameConfig.findByIdAndUpdate(
        'gameConfig',
        {
          $set: {
            faseJuego: faseJuego,
            updatedBy: admin.username,
            updatedAt: new Date()
          }
        },
        { new: true, upsert: true }
      );
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        faseJuego: config.faseJuego,
        updatedBy: config.updatedBy,
        updatedAt: config.updatedAt
      }));
    } catch (error) {
      console.error('Error cambiando fase:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Error interno del servidor' }));
    }
  });
  return;
}
```

- [ ] **Step 3: Crear endpoint PUT /api/admin/config**

```javascript
// PUT /api/admin/config
if (method === 'PUT' && pathname === '/api/admin/config') {
  const admin = await verifyAdmin(req);
  
  if (!admin) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Acceso denegado. Se requieren permisos de administrador.' }));
  }
  
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { faseJuego, tournament } = JSON.parse(body);
      
      const updateData = { updatedBy: admin.username, updatedAt: new Date() };
      
      if (faseJuego) {
        const fasesValidas = ['FASE_PRETEMPORADA', 'FASE_LIGA', 'FASE_PRE16'];
        if (!fasesValidas.includes(faseJuego)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ 
            ok: false, 
            error: `Fase inválida. Valores permitidos: ${fasesValidas.join(', ')}` 
          }));
        }
        updateData.faseJuego = faseJuego;
      }
      
      if (tournament) {
        updateData.tournament = tournament;
      }
      
      const config = await GameConfig.findByIdAndUpdate(
        'gameConfig',
        { $set: updateData },
        { new: true, upsert: true }
      );
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        config: {
          faseJuego: config.faseJuego,
          totalMatches: config.tournament.totalMatches,
          squadSize: config.tournament.squadSize,
          squadFormation: config.tournament.squadFormation
        },
        updatedBy: config.updatedBy,
        updatedAt: config.updatedAt
      }));
    } catch (error) {
      console.error('Error actualizando config:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Error interno del servidor' }));
    }
  });
  return;
}
```

- [ ] **Step 4: Verificar endpoints de admin**

```bash
# Cambiar fase (requiere token de admin)
curl -X PUT http://localhost:3000/api/admin/fase-juego \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"faseJuego": "FASE_LIGA"}'

# Verificar que usuario no-admin no puede acceder
curl -X PUT http://localhost:3000/api/admin/fase-juego \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{"faseJuego": "FASE_LIGA"}'
```

Expected: 200 para admin, 403 para usuario normal

---

### Task 7: Modificar Funciones del Frontend

**Files:**
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `AppState.appConfig.faseJuego`
- Produces: Funciones `getFaseJuego()`, `isFasePretemporada()`, `isFaseLiga()`, `isFasePre16()`

- [ ] **Step 1: Eliminar funciones isFrozen() e isFinalsFrozen()**

Buscar y eliminar de `js/main.js`:
```javascript
// ELIMINAR:
function isFrozen() { ... }
function isFinalsFrozen() { ... }
```

- [ ] **Step 2: Crear nuevas funciones de fase**

Añadir al inicio de `js/main.js` (después de AppState):
```javascript
function getFaseJuego() {
  return AppState.appConfig?.faseJuego || 'FASE_PRETEMPORADA';
}

function isFasePretemporada() {
  return getFaseJuego() === 'FASE_PRETEMPORADA';
}

function isFaseLiga() {
  const fase = getFaseJuego();
  return fase === 'FASE_LIGA' || fase === 'FASE_PRE16';
}

function isFasePre16() {
  return getFaseJuego() === 'FASE_PRE16';
}
```

- [ ] **Step 3: Reemplazar todas las llamadas a isFrozen()**

Buscar y reemplazar TODAS las ocurrencias:
- `isFrozen()` → `isFaseLiga()`
- `!isFrozen()` → `isFasePretemporada()`

Líneas aproximadas: 189, 460, 722-742, 822-828, 1209-1211, 2479-2485, 2605-2607, 2710, 2730-2733, 2832-2834, 2867-2869, 2940-2951, 3032-3034

- [ ] **Step 4: Reemplazar todas las llamadas a isFinalsFrozen()**

Buscar y reemplazar TODAS las ocurrencias:
- `isFinalsFrozen()` → `isFaseLiga()`

Líneas aproximadas: 4000+

- [ ] **Step 5: Verificar que no quedan referencias a las funciones eliminadas**

```bash
grep -n "isFrozen\|isFinalsFrozen" js/main.js
```

Expected: Sin resultados (todas reemplazadas)

---

### Task 8: Modificar Tab Inicio

**Files:**
- Modify: `js/main.js`

**Interfaces:**
- Consumes: Función `getFaseJuego()`
- Produces: UI mostrando fase actual en lugar de countdown

- [ ] **Step 1: Localizar función renderInicioTab()**

Buscar la función `renderInicioTab()` en `js/main.js`.

- [ ] **Step 2: Eliminar lógica de countdown**

Eliminar el código que calcula tiempo restante hasta `championsStartRoundsDate`.

- [ ] **Step 3: Implementar nueva lógica de fase**

```javascript
function renderInicioTab() {
  const tab = document.getElementById('tab-inicio');
  const fase = getFaseJuego();
  
  const faseInfo = {
    'FASE_PRETEMPORADA': {
      titulo: 'Pretemporada',
      descripcion: 'Estamos en pretemporada. Puedes hacer tus predicciones y plantilla.',
      icono: '📝',
      color: '#4CAF50'
    },
    'FASE_LIGA': {
      titulo: 'Fase de Liga',
      descripcion: 'La competición ha comenzado. Predicciones y plantilla bloqueadas.',
      icono: '⚽',
      color: '#FF9800'
    },
    'FASE_PRE16': {
      titulo: 'Fase de Dieciseisavos',
      descripcion: 'Fase de dieciseisavos. Predicciones bloqueadas.',
      icono: '🏆',
      color: '#F44336'
    }
  };
  
  const info = faseInfo[fase] || faseInfo['FASE_PRETEMPORADA'];
  
  tab.innerHTML = `
    <div class="inicio-card" style="border-left: 4px solid ${info.color}">
      <div class="inicio-icon">${info.icono}</div>
      <div class="inicio-content">
        <h2>${info.titulo}</h2>
        <p>${info.descripcion}</p>
        <span class="fase-badge" style="background: ${info.color}">${fase}</span>
      </div>
    </div>
  `;
}
```

- [ ] **Step 4: Verificar visualización**

Recargar la aplicación y verificar que el tab "Inicio" muestra la fase actual correctamente.

---

### Task 9: Añadir Panel de Admin en Frontend

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: Función `checkAdminStatus()`, endpoint `GET /api/auth/profile`
- Produces: Panel de admin visible solo para admins

- [ ] **Step 1: Añadir HTML del panel de admin en index.html**

Dentro del contenedor de tabs, añadir:
```html
<!-- Admin Panel (hidden by default) -->
<div id="admin-panel" class="admin-panel" style="display: none;">
  <div class="admin-header">
    <h3>Panel de Administración</h3>
    <span class="admin-badge">ADMIN</span>
  </div>
  
  <div class="admin-content">
    <div class="admin-section">
      <label for="phase-select">Fase Actual:</label>
      <div class="phase-controls">
        <select id="phase-select" class="phase-select">
          <option value="FASE_PRETEMPORADA">FASE_PRETEMPORADA</option>
          <option value="FASE_LIGA">FASE_LIGA</option>
          <option value="FASE_PRE16">FASE_PRE16</option>
        </select>
        <button id="btn-change-phase" class="btn-primary" onclick="openPhaseChangeModal()">
          Cambiar Fase
        </button>
      </div>
    </div>
    
    <div id="current-phase-info" class="phase-info">
      <p>Fase actual: <strong id="current-phase-display">-</strong></p>
      <p>Último cambio: <span id="last-update-info">-</span></p>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Añadir estilos CSS para el panel de admin**

En `css/styles.css`, añadir:
```css
.admin-panel {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  color: white;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.admin-header h3 {
  margin: 0;
  font-size: 1.2em;
}

.admin-badge {
  background: rgba(255,255,255,0.2);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.8em;
  font-weight: bold;
}

.admin-content {
  background: rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 15px;
}

.admin-section {
  margin-bottom: 15px;
}

.admin-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.phase-controls {
  display: flex;
  gap: 10px;
}

.phase-select {
  flex: 1;
  padding: 10px;
  border-radius: 6px;
  border: none;
  font-size: 1em;
}

.btn-primary {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.3s;
}

.btn-primary:hover {
  background: #45a049;
}

.phase-info {
  background: rgba(255,255,255,0.1);
  padding: 10px;
  border-radius: 6px;
  font-size: 0.9em;
}

.phase-info p {
  margin: 5px 0;
}
```

- [ ] **Step 3: Crear función checkAdminStatus() en js/main.js**

```javascript
async function checkAdminStatus() {
  const token = localStorage.getItem('token');
  if (!token || !AppState.currentUser) return false;
  
  try {
    const response = await fetch(`${API_BASE}/api/auth/profile?username=${AppState.currentUser}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    return data.isAdmin === true;
  } catch (error) {
    console.error('Error verificando admin:', error);
    return false;
  }
}
```

- [ ] **Step 4: Crear función para mostrar/ocultar panel admin**

```javascript
async function updateAdminPanel() {
  const isAdmin = await checkAdminStatus();
  const adminPanel = document.getElementById('admin-panel');
  
  if (adminPanel) {
    adminPanel.style.display = isAdmin ? 'block' : 'none';
    
    if (isAdmin) {
      // Actualizar fase actual en el panel
      const fase = getFaseJuego();
      document.getElementById('current-phase-display').textContent = fase;
      document.getElementById('phase-select').value = fase;
    }
  }
}
```

- [ ] **Step 5: Llamar updateAdminPanel() después de login**

En la función que maneja el login exitoso, añadir:
```javascript
await updateAdminPanel();
```

- [ ] **Step 6: Verificar panel de admin**

Login como admin y verificar que el panel es visible. Login como usuario normal y verificar que no es visible.

---

### Task 10: Añadir Modal de Confirmación

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: Endpoint `PUT /api/admin/fase-juego`
- Produces: Modal de confirmación para cambio de fase

- [ ] **Step 1: Añadir HTML del modal en index.html**

Al final del body:
```html
<!-- Modal de confirmación para cambio de fase -->
<div id="phase-change-modal" class="modal" style="display: none;">
  <div class="modal-overlay" onclick="closePhaseChangeModal()"></div>
  <div class="modal-content">
    <div class="modal-header">
      <h3>Cambiar Fase del Juego</h3>
      <button class="modal-close" onclick="closePhaseChangeModal()">&times;</button>
    </div>
    
    <div class="modal-body">
      <p>¿Estás seguro de cambiar a <strong id="target-phase-name">FASE_LIGA</strong>?</p>
      
      <div class="warning-box">
        <p><strong>Advertencia:</strong></p>
        <ul>
          <li>Esto afectará a <strong>todos</strong> los usuarios</li>
          <li>Las predicciones pueden bloquearse/desbloquearse</li>
          <li>La visibilidad de datos cambiará inmediatamente</li>
        </ul>
      </div>
    </div>
    
    <div class="modal-footer">
      <button onclick="closePhaseChangeModal()" class="btn-secondary">Cancelar</button>
      <button onclick="confirmPhaseChange()" class="btn-danger">Confirmar Cambio</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Añadir estilos CSS para el modal**

En `css/styles.css`:
```css
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
}

.modal-content {
  position: relative;
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  color: #333;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  color: #666;
}

.modal-body {
  padding: 20px;
}

.modal-body p {
  margin: 0 0 15px 0;
  font-size: 1.1em;
}

.warning-box {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 15px;
  margin-top: 15px;
}

.warning-box p {
  margin: 0 0 10px 0;
  color: #856404;
}

.warning-box ul {
  margin: 0;
  padding-left: 20px;
  color: #856404;
}

.warning-box li {
  margin-bottom: 5px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 1px solid #eee;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
}

.btn-danger {
  background: #dc3545;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}

.btn-danger:hover {
  background: #c82333;
}
```

- [ ] **Step 3: Crear funciones del modal en js/main.js**

```javascript
function openPhaseChangeModal() {
  const select = document.getElementById('phase-select');
  const targetPhase = select.value;
  const currentPhase = getFaseJuego();
  
  if (targetPhase === currentPhase) {
    showToast('Ya estás en esta fase');
    return;
  }
  
  document.getElementById('target-phase-name').textContent = targetPhase;
  document.getElementById('phase-change-modal').style.display = 'flex';
}

function closePhaseChangeModal() {
  document.getElementById('phase-change-modal').style.display = 'none';
}

async function confirmPhaseChange() {
  const select = document.getElementById('phase-select');
  const targetPhase = select.value;
  const token = localStorage.getItem('token');
  
  if (!token) {
    showToast('No estás autenticado');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/admin/fase-juego`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ faseJuego: targetPhase })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showToast(`Fase cambiada a ${targetPhase}`);
      closePhaseChangeModal();
      
      // Recargar configuración
      await loadConfig();
      
      // Actualizar UI
      updateAdminPanel();
      renderCurrentTab();
    } else {
      showToast(`Error: ${data.error}`);
    }
  } catch (error) {
    console.error('Error cambiando fase:', error);
    showToast('Error al cambiar fase');
  }
}
```

- [ ] **Step 4: Verificar modal**

1. Login como admin
2. Seleccionar una fase diferente
3. Click en "Cambiar Fase"
4. Verificar que aparece el modal con la advertencia
5. Click en "Confirmar Cambio"
6. Verificar que la fase cambia y se actualiza la UI

---

### Task 11: Eliminar config.json y Verificar

**Files:**
- Delete: `config.json`

**Interfaces:**
- Consumes: N/A (ya no se usa)
- Produces: N/A

- [ ] **Step 1: Verificar que config.json ya no se usa**

```bash
grep -r "config.json" server.js
grep -r "leerFichero.*config" server.js
```

Expected: Sin resultados (ya no se lee de GitHub)

- [ ] **Step 2: Hacer backup de config.json**

```bash
cp config.json config.json.backup
```

- [ ] **Step 3: Eliminar config.json**

```bash
rm config.json
```

- [ ] **Step 4: Verificar que la aplicación funciona**

1. Reiniciar el servidor
2. Probar GET /api/config
3. Verificar que retorna la configuración de MongoDB
4. Probar todos los endpoints modificados

---

## Resumen de Cambios

### Backend (api-porra)
- **Crear:** `db/models/GameConfig.js`
- **Crear:** `scripts/migrateConfig.js`
- **Modificar:** `db/models/User.js` (añadir `isAdmin`)
- **Modificar:** `server.js` (eliminar fechas, añadir fases, endpoints admin)
- **Eliminar:** `config.json`

### Frontend (porra-spa)
- **Modificar:** `js/main.js` (reemplazar funciones de fecha, añadir panel admin)
- **Modificar:** `index.html` (añadir modal y panel admin)
- **Modificar:** `css/styles.css` (estilos para panel y modal)

### Orden de Ejecución Recomendado
1. Tasks 1-3 (Backend: modelos y migración)
2. Tasks 4-6 (Backend: endpoints)
3. Tasks 7-8 (Frontend: funciones y tab inicio)
4. Tasks 9-10 (Frontend: panel admin y modal)
5. Task 11 (Limpieza final)

---

## Checklist de Verificación

- [ ] Modelo GameConfig creado y funcional
- [ ] Campo isAdmin añadido a User
- [ ] Script de migración ejecutado exitosamente
- [ ] GET /api/config retorna configuración de MongoDB
- [ ] PUT /api/admin/fase-juego funciona para admins
- [ ] PUT /api/admin/fase-juego rechaza no-admins
- [ ] Predicciones bloqueadas en FASE_LIGA
- [ ] Predicciones desbloqueadas en FASE_PRETEMPORADA
- [ ] Datos de otros usuarios visibles en FASE_LIGA
- [ ] Datos de otros usuarios ocultos en FASE_PRETEMPORADA
- [ ] Panel de admin visible solo para admins
- [ ] Modal de confirmación funciona correctamente
- [ ] Tab Inicio muestra fase actual
- [ ] config.json eliminado
- [ ] Aplicación funciona sin errores

---

**NOTA IMPORTANTE:** Los commits y pushes a GitHub los realizará el usuario manualmente después de completar la implementación y verificar que todo funciona correctamente.
