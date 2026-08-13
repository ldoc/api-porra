# Pantallas - Usuarios - Fases

> Definición de qué se ve en cada pantalla según la fase de la porra y el estado del usuario.

## Índice de pantallas

1. [Auth (Login / Registro / Avatar)](#1-auth-login--registro--avatar)
2. [Inicio](#2-inicio)
3. [Clasificación](#3-clasificación)
4. [Resultados](#4-resultados)
   - 4.1 Subtab: Jornadas
   - 4.2 Subtab: Clasificación real
5. [Pronósticos](#5-pronósticos)
   - 5.1 Subpantalla: Clasificación pronosticada
   - 5.2 Subpantalla: Eliminatorias
6. [Plantilla Ideal](#6-plantilla-ideal)
7. [Perfil de usuario (modal)](#7-perfil-de-usuario-modal)
   - 7.1 Submodal: Desglose de jugador
8. [Admin (modal, solo admin)](#8-admin-modal-solo-admin)
9. [Cambio de fase (modal global)](#9-cambio-de-fase-modal-global)

---

## 1. Auth (Login / Registro / Avatar)

**Acceso:** Overlay inicial si no hay sesión válida.

| Fase | Login | Registro | Avatar |
|---|---|---|---|
| FASE_PRETEMPORADA | ✅ Permitido | ✅ Permitido | ✅ Selección / edición |
| FASE_LIGA | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_PRE16 | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_16 | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_PRE8 | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_8 | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_PRE4 | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_4 | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_PRESEMIS | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_SEMIS | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_PREFINAL | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_FINAL | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |
| FASE_POSTFINAL | ✅ Permitido | ❌ Bloqueado | 🔒 Solo lectura |

**Contenido visible:**
- Formulario login: usuario + contraseña
- Formulario registro: usuario + contraseña + código de invitación (solo visible en modo registro)
- Selección de avatar: cuadrícula de avatares disponibles (solo paso 2 de registro)

---

## 2. Inicio

**Acceso:** Tab principal por defecto.

| Fase | Mensaje (instrucciones de fases.json) | Pendientes que muestra | Enlaces rápidos |
|---|---|---|---|
| FASE_PRETEMPORADA | *(instrucciones de fases.json)* | Pronósticos pendientes + Plantilla incompleta | → Pronósticos, → Plantilla |
| FASE_LIGA | *(instrucciones de fases.json)* | Solo lectura, sin pendientes | — |
| FASE_PRE16 | *(instrucciones de fases.json)* | Pronósticos de 16avos pendientes | → Pronósticos |
| FASE_16 | *(instrucciones de fases.json)* | Solo lectura, sin pendientes | — |
| FASE_PRE8 | *(instrucciones de fases.json)* | Pronósticos de octavos pendientes | → Pronósticos |
| FASE_8 | *(instrucciones de fases.json)* | Solo lectura, sin pendientes | — |
| FASE_PRE4 | *(instrucciones de fases.json)* | Pronósticos de cuartos pendientes | → Pronósticos |
| FASE_4 | *(instrucciones de fases.json)* | Solo lectura, sin pendientes | — |
| FASE_PRESEMIS | *(instrucciones de fases.json)* | Pronósticos de semis pendientes | → Pronósticos |
| FASE_SEMIS | *(instrucciones de fases.json)* | Solo lectura, sin pendientes | — |
| FASE_PREFINAL | *(instrucciones de fases.json)* | Pronóstico de final pendiente | → Pronósticos |
| FASE_FINAL | *(instrucciones de fases.json)* | Solo lectura, sin pendientes | — |
| FASE_POSTFINAL | *(instrucciones de fases.json)* | Solo lectura | — |

**Contenido visible:**
- Avatar y nombre del usuario
- Tarjeta de fase actual con icono, nombre e instrucciones
- Tarjetas de pendientes (solo en fases `PRE*`)
- Countdown o banner si aplica

---

## 3. Clasificación

**Acceso:** Tab inferior.

| Fase | Lista de usuarios | Puntos visibles | Click en usuario |
|---|---|---|---|
| FASE_PRETEMPORADA | ✅ Todos los usuarios | ❌ Sin puntos | Solo propio → abre modal perfil |
| FASE_LIGA | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_PRE16 | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_16 | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_PRE8 | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_8 | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_PRE4 | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_4 | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_PRESEMIS | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_SEMIS | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_PREFINAL | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_FINAL | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |
| FASE_POSTFINAL | ✅ Todos | ✅ Puntos reales | Abre modal perfil con 3 tabs |

**Contenido visible:**
- Tabla clasificatoria: posición, avatar, nombre, puntos
- En pretemporada solo se ve el usuario propio como clickeable
- El resto de usuarios muestran toast informativo en pretemporada

### 3.1 Tabs del perfil de usuario (al pulsar en una fila)

Al pulsar sobre un usuario se abre un modal con 3 tabs: **Pronósticos**, **Plantilla** y **Clasificación**.

#### Visibilidad por fase

| Fase | Tab: Pronósticos | Tab: Plantilla | Tab: Clasificación |
|---|---|---|---|
| FASE_PRETEMPORADA | 🔒 Solo propio | 🔒 Solo propio | 🔒 Solo propio |
| FASE_LIGA | ✅ Pronósticos de liga de todos | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_PRE16 | ✅ Liga de todos / 🔒 16avos solo propio | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_16 | ✅ Liga + 16avos de todos | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_PRE8 | ✅ Liga + 16avos de todos / 🔒 Octavos solo propio | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_8 | ✅ Liga + 16avos + Octavos de todos | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_PRE4 | ✅ Liga + 16 + 8 de todos / 🔒 Cuartos solo propio | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_4 | ✅ Liga + 16 + 8 + Cuartos de todos | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_PRESEMIS | ✅ Liga + 16 + 8 + 4 de todos / 🔒 Semis solo propio | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_SEMIS | ✅ Liga + 16 + 8 + 4 + Semis de todos | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_PREFINAL | ✅ Todas menos final de todos / 🔒 Final solo propio | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_FINAL | ✅ Todas las fases de todos | ✅ Todos los usuarios | ✅ Todos los usuarios |
| FASE_POSTFINAL | ✅ Todas las fases de todos | ✅ Todos los usuarios | ✅ Todos los usuarios |

> **Regla de pronósticos:** En FASE_PRETEMPORADA cada usuario solo ve sus propios datos. A partir de FASE_LIGA se ven los pronósticos de todos los usuarios, **excepto** en las fases `PRE*` donde la fase que se está editando actualmente NO es visible (para no revelar qué están pronosticando otros usuarios en esa fase). Las fases anteriores (ya bloqueadas/finalizadas) SÍ son visibles.
>
> **Regla de plantilla y clasificación:** Desde FASE_LIGA en adelante, siempre visibles para todos los usuarios sin restricción de fase.

#### Contenido de cada tab

**Tab Pronósticos:**
- Predicciones del usuario vs resultados reales (si hay matchStats)
- Puntos obtenidos por partido y desglose
- Partidos sin resultado: marcados como "Pendiente"

**Tab Plantilla:**
- 25 jugadores agrupados por posición (Porteros, Defensas, Centrocampistas, Delanteros)
- Puntos acumulados de cada jugador
- Al pulsar en un jugador: desglose de puntos por partido

**Tab Clasificación:**
- Puntos de clasificación por posición de equipos pronosticados
- Tabla con posición pronosticada vs real y puntos obtenidos

---

## 4. Resultados

**Acceso:** Tab inferior.

### 4.1 Subtab: Jornadas

| Fase | Visible | Partidos mostrados | Resultados |
|---|---|---|---|
| FASE_PRETEMPORADA | ❌ No disponible | — | — |
| FASE_LIGA | ✅ | Jornadas de liga con resultado | ✅ Resultados + puntos usuario |
| FASE_PRE16 | ✅ | Liga + 16avos (si hay resultado) | ✅ |
| FASE_16 | ✅ | Liga + 16avos | ✅ |
| FASE_PRE8 | ✅ | Liga + 16avos + octavos | ✅ |
| FASE_8 | ✅ | Liga + 16avos + octavos | ✅ |
| FASE_PRE4 | ✅ | Todas hasta cuartos | ✅ |
| FASE_4 | ✅ | Todas hasta cuartos | ✅ |
| FASE_PRESEMIS | ✅ | Todas hasta semis | ✅ |
| FASE_SEMIS | ✅ | Todas hasta semis | ✅ |
| FASE_PREFINAL | ✅ | Todas hasta final | ✅ |
| FASE_FINAL | ✅ | Todas | ✅ |
| FASE_POSTFINAL | ✅ | Todas (finales) | ✅ |

### 4.2 Subtab: Clasificación real

| Fase | Visible | Contenido |
|---|---|---|
| FASE_PRETEMPORADA | ❌ No disponible | — |
| FASE_LIGA → FASE_POSTFINAL | ✅ | Tabla de equipos con Pts, DG, GF, GC, PJ (calculada desde matchStats) |

---

## 5. Pronósticos

**Acceso:** Tab inferior.

### 5.0 Flujo general por fase

| Fase | Fase editable | Fases en solo lectura | Botón Guardar | Botón Validar | Botón Eliminatorias |
|---|---|---|---|---|---|
| FASE_PRETEMPORADA | Liga (144 partidos) | — | ✅ | 🔒 (al completar 144) | 🔒 (tras validar) |
| FASE_LIGA | — (bloqueada) | Liga | ❌ | ❌ | ✅ (si validó en pre) |
| FASE_PRE16 | 16avos | Liga | ✅ | 🔒 (al completar 16avos) | ✅ (si validó en pre) |
| FASE_16 | — (bloqueada) | Liga + 16avos | ❌ | ❌ | ✅ |
| FASE_PRE8 | Octavos | Liga + 16avos | ✅ | 🔒 (al completar octavos) | ✅ |
| FASE_8 | — (bloqueada) | Liga + 16 + octavos | ❌ | ❌ | ✅ |
| FASE_PRE4 | Cuartos | Liga + 16 + octavos | ✅ | 🔒 (al completar cuartos) | ✅ |
| FASE_4 | — (bloqueada) | Liga + 16 + 8 + cuartos | ❌ | ❌ | ✅ |
| FASE_PRESEMIS | Semis | Liga + 16 + 8 + cuartos | ✅ | 🔒 (al completar semis) | ✅ |
| FASE_SEMIS | — (bloqueada) | Liga + 16 + 8 + 4 + semis | ❌ | ❌ | ✅ |
| FASE_PREFINAL | Final | Todas menos final | ✅ | 🔒 (al completar final) | ✅ |
| FASE_FINAL | — (bloqueada) | Todas | ❌ | ❌ | ✅ |
| FASE_POSTFINAL | — (bloqueada) | Todas | ❌ | ❌ | ✅ |

### 5.1 FASE_PRETEMPORADA — Detalle

**Objetivo:** Pronosticar los 144 partidos de la fase de liga.

**Acciones del usuario:**
1. Navega por las 8 jornadas de liga usando las flechas ← →
2. Introduce marcadores (goles local / visitante) en cada partido
3. Puede guardar cuando quiera con el botón 💾 Guardar
4. Barra de progreso muestra cuántos partidos lleva pronosticados de 144

**Botones:**
| Botón | Estado | Condición |
|---|---|---|
| 💾 Guardar | ✅ Habilitado | Siempre (mientras haya cambios) |
| ✅ Confirmar | 🔒 Deshabilitado | Se habilita solo cuando los 144 partidos están pronosticados. Una vez pulsado, desaparece de pantalla |
| 📊 Clasificación | ✅ Habilitado | Siempre |
| 🏆 Eliminatorias | 🔒 No visible | Se muestra tras confirmar los pronósticos de liga |

**Flujo de confirmación:**
1. Usuario rellena los 144 partidos
2. Se habilita el botón "Confirmar"
3. Usuario pulsa "Confirmar" → se envía POST `/api/predictions/confirm`
4. Los pronósticos de liga quedan bloqueados permanentemente
5. El botón "Confirmar" desaparece de pantalla
6. Se muestra el botón "🏆 Eliminatorias" que navega a la pantalla 5.2

### 5.2 FASE_LIGA — Detalle

**Estado:** Los pronósticos de liga están bloqueados. El usuario solo puede:
- Ver sus pronósticos en solo lectura
- Acceder a Eliminatorias (si confirmó en pretemporada)

### 5.3 FASE_PRE* (PRE16, PRE8, PRE4, PRESEMIS, PREFINAL) — Detalle

**Objetivo:** Pronosticar los partidos de la fase knockout correspondiente.

**Acciones del usuario:**
1. Navega por las jornadas de la fase actual (ej: 16avos)
2. Introduce marcadores solo en partidos de esa fase
3. Las fases anteriores se muestran en solo lectura (no editables)
4. Puede guardar cuando quiera con el botón 💾 Guardar
5. Barra de progreso muestra progreso de la fase actual

**Botones:**
| Botón | Estado | Condición |
|---|---|---|
| 💾 Guardar | ✅ Habilitado | Siempre (mientras haya cambios en la fase actual) |
| ✅ Confirmar | 🔒 Deshabilitado | Se habilita al completar todos los partidos de la fase actual |
| 📊 Clasificación | ✅ Habilitado | Siempre |
| 🏆 Eliminatorias | ✅ Visible | Solo si confirmó los pronósticos de liga en FASE_PRETEMPORADA |

**Restricción:** Una vez se entra en una fase `PRE*`, NO se pueden modificar pronósticos de fases anteriores (ya bloqueadas).

### 5.4 FASE_* (FASE_LIGA, FASE_16, FASE_8, FASE_4, FASE_SEMIS, FASE_FINAL) — Detalle

**Estado:** Los pronósticos de la fase están bloqueados. El usuario solo puede:
- Ver sus pronósticos en solo lectura
- Acceder a Eliminatorias (si confirmó liga)

### 5.5 FASE_POSTFINAL — Detalle

**Estado:** La porra ha terminado. Solo lectura en todas las pantallas.

### 5.6 Clasificación pronosticada

| Fase | Accesible | Contenido |
|---|---|---|
| FASE_PRETEMPORADA | ✅ Desde botón en Pronósticos | Tabla calculada desde predicciones del usuario |
| FASE_LIGA → FASE_POSTFINAL | ✅ | Tabla calculada (misma funcionalidad) |

### 5.7 Eliminatorias

| Fase | Accesible | Edición |
|---|---|---|
| FASE_PRETEMPORADA | ✅ Solo si `predictionsConfirmed=true` | ✅ Editable |
| FASE_LIGA → FASE_POSTFINAL | ✅ Solo lectura | ❌ Bloqueado |

> **Nota:** El acceso a Eliminatorias requiere haber confirmado previamente los 144 pronósticos de liga en FASE_PRETEMPORADA. Sin confirmación, no se muestra el botón.

---

## 6. Plantilla Ideal

**Acceso:** Tab inferior.

| Fase | Edición | Guardar | Contenido |
|---|---|---|---|
| FASE_PRETEMPORADA | ✅ Editable | ✅ Permitido | 25 casillas (3G, 8D, 8M, 6F), búsqueda de jugadores |
| FASE_LIGA → FASE_POSTFINAL | ❌ Bloqueado | ❌ Bloqueado | Solo lectura de la plantilla guardada |

---

## 7. Perfil de usuario (modal)

**Acceso:** Click en header (pill de usuario) o desde Clasificación.

| Fase | Tabs visibles | Datos mostrados |
|---|---|---|
| FASE_PRETEMPORADA | Pronósticos, Plantilla, Clasificación | Solo datos propios |
| FASE_LIGA → FASE_POSTFINAL | Pronósticos, Plantilla, Clasificación | Propios + otros usuarios |

**Contenido por tab:**
- **Pronósticos:** predicciones vs resultados reales, puntos por jornada
- **Plantilla:** 25 jugadores agrupados por posición, puntos acumulados
- **Clasificación:** puntos de clasificación por posición de equipos

### 7.1 Desglose de jugador (submodal)

| Fase | Accesible |
|---|---|
| FASE_PRETEMPORADA | ✅ Solo jugador propio (sin puntos aún) |
| FASE_LIGA → FASE_POSTFINAL | ✅ Cualquier jugador con datos |

---

## 8. Admin (modal, solo admin)

**Acceso:** Panel de administración visible solo para usuarios con `isAdmin=true` en el perfil.

| Fase | Funcionalidades disponibles |
|---|---|
| Todas | Cambiar fase del juego, gestionar códigos de invitación |

---

## 9. Cambio de fase (modal global)

**Acceso:** Se muestra automáticamente cuando el backend devuelve error 409 PHASE_CHANGED.

| Evento | Acción |
|---|---|
| Fase cambiada por admin | Modal informativo + recarga automática en 3 segundos |

---

## Fases del juego (referencia)

| # | Fase | Descripción |
|---|---|---|
| 1 | FASE_PRETEMPORADA | Pretemporada: edición de pronósticos y plantilla |
| 2 | FASE_LIGA | Liga: partidos de liga en curso |
| 3 | FASE_PRE16 | Pre-dieciseisavos: edición de pronósticos de 16avos |
| 4 | FASE_16 | Dieciseisavos: partidos de 16avos en curso |
| 5 | FASE_PRE8 | Pre-octavos: edición de pronósticos de octavos |
| 6 | FASE_8 | Octavos: partidos de octavos en curso |
| 7 | FASE_PRE4 | Pre-cuartos: edición de pronósticos de cuartos |
| 8 | FASE_4 | Cuartos: partidos de cuartos en curso |
| 9 | FASE_PRESEMIS | Pre-semifinales: edición de pronósticos de semis |
| 10 | FASE_SEMIS | Semifinales: partidos de semis en curso |
| 11 | FASE_PREFINAL | Pre-final: edición de pronóstico de final |
| 12 | FASE_FINAL | Final: partido de la final en curso |
| 13 | FASE_POSTFINAL | Post-final: porra terminada, solo lectura |
