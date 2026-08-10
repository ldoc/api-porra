# Diseño: Sistema de Fases del Juego

**Fecha:** 2026-08-10  
**Estado:** Aprobado por usuario  
**Proyectos:** api-porra, porra-spa

---

## Resumen

Reemplazar el sistema actual basado en fechas (`championsStartRoundsDate`, `finalsFreezeDate`) por un sistema de fases explícitas que un administrador puede cambiar manualmente. La configuración del torneo se moverá completamente a MongoDB.

---

## Decisiones de Diseño

| Decisión | Elección | Razón |
|----------|----------|-------|
| Rol admin | Campo `isAdmin` en usuario | Simple, sin nuevo modelo |
| Almacenamiento fase | MongoDB | Estado dinámico, sin redeploy |
| Config.json | Eliminar, mover a MongoDB | Centralizar, evitar GitHub |
| Confirmación admin | Modal con advertencia | UX clara, paso peligroso |
| FASE_PRE16 | Comportamiento = FASE_LIGA | Pendiente implementación |
| Estructura MongoDB | Documento combinado | Un solo punto de lectura |

---

## Fases del Juego

| Fase | Valor | Descripción |
|------|-------|-------------|
| Pretemporada | `FASE_PRETEMPORADA` | Antes de la competición. Usuarios editan predicciones y plantilla |
| Liga | `FASE_LIGA` | Rondas en curso. Predicciones bloqueadas, datos públicos |
| Pre-16avos | `FASE_PRE16` | Entre rondas y eliminatorias. Comportamiento temporal = FASE_LIGA |

---

## Modelo de Datos

### 1. Campo `isAdmin` en Usuario

```javascript
// Modelo User existente - añadir campo
{
  clave: String,
  username: String,
  passwordHash: String,
  avatar: String,
  isAdmin: { type: Boolean, default: false },  // NUEVO
  createdAt: Date
}
```

**Migración:** Todos los usuarios existentes tendrán `isAdmin: false`. Se designará un admin inicial mediante script o variable de entorno.

### 2. Documento de Configuración en MongoDB

```javascript
// Colección: gameconfigs
// Documento único con _id: "gameConfig"
{
  _id: "gameConfig",
  faseJuego: {
    type: String,
    enum: ["FASE_PRETEMPORADA", "FASE_LIGA", "FASE_PRE16"],
    default: "FASE_PRETEMPORADA"
  },
  tournament: {
    totalMatches: Number,
    squadSize: Number,
    squadFormation: {
      G: Number,
      D: Number,
      M: Number,
      F: Number
    }
  },
  updatedBy: String,  // username del admin que hizo el cambio
  updatedAt: Date
}
```

---

## Cambios en Backend (api-porra)

### Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `db/models/GameConfig.js` | NUEVO - Modelo MongoDB para configuración |
| `db/models/User.js` | Añadir campo `isAdmin` |
| `server.js` | Eliminar `esFrozen()`/`esFinalsFrozen()`, añadir `getFaseJuego()`, modificar endpoints |
| `config.json` | ELIMINAR |
| `github.js` | Eliminar función `getConfig()` (opcional, puede mantenerse para otros archivos) |
| `scripts/migrateConfig.js` | NUEVO - Script de migración |

### Nuevos Endpoints

#### `PUT /api/admin/fase-juego`

Cambia la fase del juego. Solo accesible por admins.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "faseJuego": "FASE_LIGA"
}
```

**Response 200:**
```json
{
  "ok": true,
  "faseJuego": "FASE_LIGA",
  "updatedBy": "adminUser",
  "updatedAt": "2026-08-10T10:00:00Z"
}
```

**Errores:**
- `400`: `faseJuego` inválido
- `401`: Token inválido o ausente
- `403`: Usuario no es admin

#### `PUT /api/admin/config`

Actualiza toda la configuración del torneo. Solo accesible por admins.

**Request Body:**
```json
{
  "faseJuego": "FASE_LIGA",
  "tournament": {
    "totalMatches": 144,
    "squadSize": 25,
    "squadFormation": { "G": 3, "D": 8, "M": 8, "F": 6 }
  }
}
```

**Response:** Igual que `GET /api/config`

### Endpoints Modificados

#### `GET /api/config`

**Antes:** Lee de GitHub (`config.json`) con caché de 60 segundos  
**Después:** Lee de MongoDB (sin caché, o caché corto)

**Response actualizada:**
```json
{
  "ok": true,
  "config": {
    "faseJuego": "FASE_PRETEMPORADA",
    "totalMatches": 144,
    "squadSize": 25,
    "squadFormation": { "G": 3, "D": 8, "M": 8, "F": 6 }
  }
}
```

### Funciones Eliminadas

```javascript
// ELIMINAR de server.js
function esFrozen() { ... }
function esFinalsFrozen() { ... }
```

### Nueva Función

```javascript
// AÑADIR en server.js
async function getFaseJuego() {
  const config = await GameConfig.findById('gameConfig');
  return config?.faseJuego || 'FASE_PRETEMPORADA';
}
```

### Lógica de Endpoints por Fase

| Endpoint | FASE_PRETEMPORADA | FASE_LIGA / FASE_PRE16 |
|----------|-------------------|------------------------|
| `PUT /predictions` | ✅ Permitido | ❌ 403 "Predicciones bloqueadas" |
| `GET /predictions` (otro usuario) | ❌ 403 "Solo propio" | ✅ Público |
| `PUT /squad` | ✅ Permitido | ❌ 403 "Plantilla bloqueada" |
| `GET /squad` (otro usuario) | ❌ 403 "Solo propio" | ✅ Público |
| `PUT /final-predictions` | ✅ Permitido | ❌ 403 "Predicciones finales bloqueadas" |
| `GET /final-predictions` (otro) | ❌ 403 "Solo propio" | ✅ Público |
| `GET /players` | Sin puntos | Con puntos |
| `GET /predictions/all` | Solo propio | Todos |
| `GET /squad/all` | Solo propio | Todos |

---

## Cambios en Frontend (porra-spa)

### Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `js/main.js` | Reemplazar `isFrozen()`/`isFinalsFrozen()`, añadir panel admin |
| `index.html` | Añadir modal de confirmación, panel admin |

### Funciones a Reemplazar

```javascript
// ELIMINAR
function isFrozen() { ... }
function isFinalsFrozen() { ... }

// AÑADIR
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

### Mapeo de Reemplazo

| Llamada Actual | Nueva Llamada | Contexto |
|----------------|---------------|----------|
| `isFrozen()` | `isFaseLiga()` | Bloqueo predicciones/plantilla |
| `!isFrozen()` | `isFasePretemporada()` | Permitir edición |
| `isFinalsFrozen()` | `isFaseLiga()` | Bloqueo predicciones finales (temporal) |

### Referencias en `js/main.js`

| Línea | Contexto | Cambio |
|-------|----------|--------|
| 189 | `savePredictionsToBackend()` | `isFrozen()` → `isFaseLiga()` |
| 460 | `startMatchStatsPolling()` | `!isFrozen()` → `isFaseLiga()` |
| 722-742 | `renderClasificacionTab()` | `isFrozen()` → `isFaseLiga()` |
| 822-828 | `showUserProfileModal()` | `!isFrozen()` → `isFasePretemporada()` |
| 1209-1211 | `renderResultadosTab()` | `!isFrozen()` → `isFaseLiga()` |
| 2479-2485 | `renderPronosticosTab()` | `isFrozen()` → `isFaseLiga()` |
| 2605-2607 | `handleGoalButtonClick()` | `isFrozen()` → `isFaseLiga()` |
| 2710 | `updateSaveButton()` | `isFrozen()` → `isFaseLiga()` |
| 2730-2733 | `openSlotSearch()` | `isFrozen()` → `isFaseLiga()` |
| 2832-2834 | `selectPlayerForSlot()` | `isFrozen()` → `isFaseLiga()` |
| 2867-2869 | `removePlayerFromSquad()` | `isFrozen()` → `isFaseLiga()` |
| 2940-2951 | `renderPlantillaTab()` | `isFrozen()` → `isFaseLiga()` |
| 3032-3034 | `saveSquadToBackend()` | `isFrozen()` → `isFaseLiga()` |
| 4000+ | `renderFinalPredictionsTab()` | `isFinalsFrozen()` → `isFaseLiga()` |

### Tab "Inicio" - Eliminar Countdown

**Antes:** Muestra countdown hasta `championsStartRoundsDate`  
**Después:** Mostrar fase actual y descripción

```javascript
function renderInicioTab() {
  const fase = getFaseJuego();
  const descripciones = {
    'FASE_PRETEMPORADA': 'Estamos en pretemporada. Puedes hacer tus predicciones y plantilla.',
    'FASE_LIGA': 'La competición ha comenzado. Predicciones y plantilla bloqueadas.',
    'FASE_PRE16': 'Fase de dieciseisavos. Predicciones bloqueadas.'
  };
  // Mostrar tarjeta con fase actual y descripción
}
```

### Panel de Admin

**Ubicación:** Nuevo tab "Admin" visible solo para admins

**Verificación de admin:**
```javascript
async function checkAdminStatus() {
  const token = localStorage.getItem('token');
  if (!token) return false;
  
  const response = await fetch(`${API_BASE}/api/auth/profile?username=${currentUser}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  return data.isAdmin === true;
}
```

**UI del Panel:**
```html
<div id="admin-panel" style="display: none;">
  <h3>Panel de Administración</h3>
  
  <div class="admin-section">
    <label>Fase Actual:</label>
    <select id="phase-select">
      <option value="FASE_PRETEMPORADA">FASE_PRETEMPORADA</option>
      <option value="FASE_LIGA">FASE_LIGA</option>
      <option value="FASE_PRE16">FASE_PRE16</option>
    </select>
    
    <button id="btn-change-phase" onclick="openPhaseChangeModal()">
      Cambiar Fase
    </button>
  </div>
  
  <div id="current-phase-info">
    <p>Fase actual: <strong id="current-phase-display">-</strong></p>
    <p>Último cambio: <span id="last-update-info">-</span></p>
  </div>
</div>
```

### Modal de Confirmación

```html
<div id="phase-change-modal" class="modal" style="display: none;">
  <div class="modal-overlay"></div>
  <div class="modal-content">
    <h3>⚠️ Cambiar Fase del Juego</h3>
    
    <div class="modal-body">
      <p>¿Estás seguro de cambiar a <strong id="target-phase-name">FASE_LIGA</strong>?</p>
      
      <div class="warning-box">
        <p><strong>⚠️ Advertencia:</strong></p>
        <ul>
          <li>Esto afectará a <strong>todos</strong> los usuarios</li>
          <li>Las predicciones pueden bloquearse/desbloquearse</li>
          <li>La visibilidad de datos cambiará inmediatamente</li>
        </ul>
      </div>
    </div>
    
    <div class="modal-buttons">
      <button onclick="closePhaseChangeModal()" class="btn-cancel">Cancelar</button>
      <button onclick="confirmPhaseChange()" class="btn-danger">Confirmar Cambio</button>
    </div>
  </div>
</div>
```

**Lógica del modal:**
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

async function confirmPhaseChange() {
  const select = document.getElementById('phase-select');
  const targetPhase = select.value;
  const token = localStorage.getItem('token');
  
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
      // Recargar configuración y actualizar UI
      await loadConfig();
      updateUIForPhase();
    } else {
      showToast(`Error: ${data.error}`);
    }
  } catch (error) {
    showToast('Error al cambiar fase');
  }
}
```

---

## Migración

### Script de Migración: `scripts/migrateConfig.js`

```javascript
import { leerFichero } from '../github.js';
import GameConfig from '../db/models/GameConfig.js';
import User from '../db/models/User.js';
import connectDB from '../db/connection.js';

async function migrate() {
  await connectDB();
  
  // 1. Leer config.json de GitHub
  const configData = await leerFichero('data/config.json');
  
  if (!configData) {
    console.error('No se pudo leer config.json');
    process.exit(1);
  }
  
  // 2. Crear documento de configuración en MongoDB
  const existingConfig = await GameConfig.findById('gameConfig');
  
  if (existingConfig) {
    console.log('Ya existe configuración en MongoDB, saltando migración');
  } else {
    await GameConfig.create({
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
    console.log('Configuración migrada a MongoDB');
  }
  
  // 3. Designar admin (opcional)
  const adminUsername = process.env.ADMIN_USERNAME;
  if (adminUsername) {
    const result = await User.updateOne(
      { username: adminUsername },
      { $set: { isAdmin: true } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Usuario ${adminUsername} marcado como admin`);
    } else {
      console.log(`Usuario ${adminUsername} no encontrado`);
    }
  }
  
  console.log('Migración completada');
  process.exit(0);
}

migrate().catch(console.error);
```

### Orden de Ejecución

**IMPORTANTE:** Los commits y pushes a GitHub los realizará el usuario manualmente después de completar la implementación. El plan NO incluye pasos de git commit ni git push.

1. **Backend:**
   ```bash
   # 1. Crear modelo GameConfig
   # 2. Añadir campo isAdmin a User
   # 3. Ejecutar migración
   node scripts/migrateConfig.js
   
   # 4. Designar admin
   ADMIN_USERNAME=tu_usuario node scripts/migrateConfig.js
   
   # 5. Implementar endpoints de admin
   # 6. Modificar GET /api/config
   # 7. Eliminar lógica de fechas
   # 8. Eliminar config.json
   ```

2. **Frontend:**
   ```bash
   # 1. Reemplazar isFrozen/isFinalsFrozen
   # 2. Añadir panel admin
   # 3. Añadir modal confirmación
   # 4. Actualizar tab Inicio
   # 5. Testing
   ```

3. **Después de completar la implementación:**
   - El usuario revisa los cambios
   - El usuario ejecuta `git add`, `git commit` y `git push` manualmente

---

## Testing

### Casos de Prueba

| # | Escenario | Pasos | Resultado Esperado |
|---|-----------|-------|-------------------|
| 1 | Cambio PRETEMPORADA → LIGA | Admin cambia fase | Predicciones bloqueadas, datos públicos |
| 2 | Cambio LIGA → PRETEMPORADA | Admin cambia fase | Predicciones desbloqueadas, datos privados |
| 3 | Cambio a misma fase | Admin selecciona fase actual | Toast informativo, sin cambio |
| 4 | Cambio inválido | Enviar "FASE_INVALIDA" | Error 400 |
| 5 | Usuario no admin | PUT /api/admin/fase-juego | Error 403 |
| 6 | Token inválido | PUT sin token o token expirado | Error 401 |
| 7 | Persistencia | Cambiar fase, reiniciar servidor | Fase persiste |
| 8 | Visibilidad pre-freeze | Usuario normal ve datos otros | Error 403 |
| 9 | Visibilidad post-freeze | Usuario normal ve datos otros | Datos visibles |
| 10 | Edición durante cambio | Admin cambia fase mientras usuario guarda | Backend valida fase al recibir PUT |

### Verificación Manual

```bash
# 1. Verificar que config.json ya no se usa
curl http://localhost:3000/api/config
# Debe retornar configuración de MongoDB

# 2. Verificar cambio de fase (requiere token de admin)
curl -X PUT http://localhost:3000/api/admin/fase-juego \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"faseJuego": "FASE_LIGA"}'

# 3. Verificar que predicciones se bloquean
curl -X PUT http://localhost:3000/api/predictions \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{"predictions": {...}}'
# Debe retornar 403

# 4. Verificar que usuario no-admin no puede cambiar fase
curl -X PUT http://localhost:3000/api/admin/fase-juego \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{"faseJuego": "FASE_PRETEMPORADA"}'
# Debe retornar 403
```

---

## Rollback Plan

Si algo falla:

1. **Restaurar config.json:**
   ```bash
   git checkout HEAD -- config.json
   ```

2. **Revertir cambios en server.js:**
   ```bash
   git revert <commit_hash>
   ```

3. **Deshabilitar endpoints de admin:**
   - Comentar rutas en server.js
   - O retornar 503 "Servicio no disponible"

4. **Fallback de configuración:**
   ```javascript
   // En GET /api/config, intentar MongoDB primero, GitHub después
   async function getConfig() {
     try {
       const config = await GameConfig.findById('gameConfig');
       if (config) return config;
     } catch (error) {
       console.error('Error leyendo MongoDB:', error);
     }
     // Fallback a GitHub
     return await leerFichero('data/config.json');
   }
   ```

---

## Pendiente / Futuras Mejoras

- [ ] Implementar FASE_PRE16 con predicciones de dieciseisavos
- [ ] Historial de cambios de fase (auditoría)
- [ ] Múltiples admins con permisos granulares
- [ ] Notificaciones a usuarios al cambiar fase
- [ ] Programar cambios de fase automáticos (opcional)

---

## Glosario

| Término | Definición |
|---------|-----------|
| FASE_PRETEMPORADA | Fase antes de la competición. Usuarios editan predicciones y plantilla |
| FASE_LIGA | Fase de rondas. Predicciones bloqueadas, datos públicos |
| FASE_PRE16 | Fase entre rondas y dieciseisavos. Comportamiento temporal = FASE_LIGA |
| isAdmin | Campo en modelo User que indica si el usuario es administrador |
| GameConfig | Modelo MongoDB que almacena configuración del torneo y fase actual |
