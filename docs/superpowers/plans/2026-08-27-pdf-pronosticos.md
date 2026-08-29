# Plan de Implementación: PDF de Pronósticos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar un PDF oficial con los pronósticos de todos los jugadores antes de la fase de liguillas.

**Architecture:** Script standalone que conecta a MongoDB, carga datos estáticos (calendar, teams, jugadores) y genera un PDF con PDFKit. Una portada + una página por jugador con pronósticos de liga, bracket de eliminatorias y plantilla ideal.

**Tech Stack:** Node.js (ES Modules), PDFKit, MongoDB Atlas (Mongoose)

## Global Constraints

- ES Modules (`import/export`), no CommonJS
- Naming en español para funciones y variables
- Datos estáticos en `data/sofascore/` (JSON + imágenes WebP)
- MongoDB Atlas via `db/connection.js` y `db/index.js`
- Imágenes WebP soportadas por PDFKit nativamente
- Una página por jugador, layout comprimido (fuentes 6-8pt)
- A4 portrait (595 × 842pt), márgenes 40pt

---

### Task 1: Instalar dependencia PDFKit

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar pdfkit**

```bash
npm install pdfkit
```

- [ ] **Step 2: Verificar instalación**

```bash
node -e "import('pdfkit').then(m => console.log('PDFKit version:', m.default ? 'OK' : 'FAIL'))"
```

Expected: `PDFKit version: OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add pdfkit for PDF generation"
```

---

### Task 2: Crear utils.js — Helpers comunes

**Files:**
- Create: `api/pdf/utils.js`

**Interfaces:**
- Produces:
  - `abreviarNombre(name)` → string (max 14 chars)
  - `loadImageSafe(path, size)` → {buffer, width, height} | null
  - `drawPlaceholder(doc, x, y, size, text)` → void

- [ ] **Step 1: Crear api/pdf/utils.js**

```javascript
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const BASE_DIR = process.cwd();

const ABREVIATURAS = {
  'Royale Union Saint-Gilloise': 'R. Union SG',
  'Internazionale': 'Inter',
  'Eintracht Frankfurt': 'E. Frankfurt',
  'Olympique Marseille': 'O. Marseille',
  'PSV Eindhoven': 'PSV',
  'Borussia Dortmund': 'B. Dortmund',
  'Bayer Leverkusen': 'B. Leverkusen',
  'Sporting CP': 'Sporting CP',
};

export function abreviarNombre(name) {
  if (!name) return '---';
  if (ABREVIATURAS[name]) return ABREVIATURAS[name];
  if (name.length <= 14) return name;
  const words = name.split(' ');
  if (words.length === 1) return name.substring(0, 12) + '.';
  return words.map((w, i) => i === words.length - 1 ? w : w[0] + '.').join(' ');
}

export function loadImageSafe(relativePath) {
  const fullPath = join(BASE_DIR, relativePath);
  if (!existsSync(fullPath)) return null;
  try {
    return readFileSync(fullPath);
  } catch {
    return null;
  }
}

export function drawPlaceholder(doc, x, y, size, text) {
  doc.save();
  doc.rect(x, y, size, size).fill('#e0e0e0');
  doc.fontSize(6).fillColor('#666');
  const initials = text ? text.substring(0, 3).toUpperCase() : '?';
  doc.text(initials, x, y + size / 2 - 4, { width: size, align: 'center' });
  doc.restore();
}

export function drawTeamCrest(doc, teamId, x, y, size = 14) {
  const buffer = loadImageSafe(`data/sofascore/imgEquipos/${teamId}.webp`);
  if (buffer) {
    try {
      doc.image(buffer, x, y, { width: size, height: size });
    } catch {
      drawPlaceholder(doc, x, y, size, String(teamId));
    }
  } else {
    drawPlaceholder(doc, x, y, size, String(teamId));
  }
}

export function drawPlayerPhoto(doc, playerId, x, y, size = 12) {
  const buffer = loadImageSafe(`data/sofascore/imgJugadores/${playerId}.webp`);
  if (buffer) {
    try {
      doc.image(buffer, x, y, { width: size, height: size });
    } catch {
      drawPlaceholder(doc, x, y, size, String(playerId));
    }
  } else {
    drawPlaceholder(doc, x, y, size, String(playerId));
  }
}
```

- [ ] **Step 2: Verificar que el módulo se importa correctamente**

```bash
node -e "import('./api/pdf/utils.js').then(m => { console.log('abreviarNombre:', m.abreviarNombre('Royale Union Saint-Gilloise')); console.log('abreviarNombre:', m.abreviarNombre('Arsenal')); })"
```

Expected:
```
abreviarNombre: R. Union SG
abreviarNombre: Arsenal
```

- [ ] **Step 3: Commit**

```bash
git add api/pdf/utils.js
git commit -m "feat: add PDF utils (abbreviate names, load images, placeholders)"
```

---

### Task 3: Crear layout.js — Constantes y cálculos de layout

**Files:**
- Create: `api/pdf/layout.js`

**Interfaces:**
- Produces:
  - `PAGE_WIDTH`, `PAGE_HEIGHT`, `MARGIN`, `CONTENT_WIDTH`, `CONTENT_HEIGHT` (constants)
  - `drawSectionTitle(doc, title, y)` → newY
  - `drawPlayerHeader(doc, user, y)` → newY

- [ ] **Step 1: Crear api/pdf/layout.js**

```javascript
export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
export const CONTENT_HEIGHT = PAGE_HEIGHT - 2 * MARGIN;

export const COLORS = {
  title: '#1a1a2e',
  subtitle: '#16213e',
  text: '#333333',
  lightText: '#666666',
  accent: '#0f3460',
  separator: '#cccccc',
  placeholder: '#e0e0e0',
};

export function drawSectionTitle(doc, title, y) {
  doc.save();
  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.accent);
  doc.text(title, MARGIN, y, { width: CONTENT_WIDTH });
  doc.restore();
  doc.moveTo(MARGIN, y + 12).lineTo(MARGIN + CONTENT_WIDTH, y + 12).strokeColor(COLORS.separator).lineWidth(0.5).stroke();
  return y + 18;
}

export function drawPlayerHeader(doc, user, y) {
  doc.save();
  if (user.avatar) {
    doc.fontSize(14).text(user.avatar, MARGIN, y);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.title);
    doc.text(user.username, MARGIN + 22, y + 2);
  } else {
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.title);
    doc.text(user.username, MARGIN, y);
  }
  doc.restore();
  doc.moveTo(MARGIN, y + 16).lineTo(MARGIN + CONTENT_WIDTH, y + 16).strokeColor(COLORS.separator).lineWidth(0.5).stroke();
  return y + 22;
}
```

- [ ] **Step 2: Verificar importación**

```bash
node -e "import('./api/pdf/layout.js').then(m => console.log('Layout constants:', m.PAGE_WIDTH, m.PAGE_HEIGHT, m.MARGIN))"
```

Expected: `Layout constants: 595 842 40`

- [ ] **Step 3: Commit**

```bash
git add api/pdf/layout.js
git commit -m "feat: add PDF layout constants and section helpers"
```

---

### Task 4: Crear cover.js — Página de portada

**Files:**
- Create: `api/pdf/cover.js`

**Interfaces:**
- Consumes: `PAGE_WIDTH`, `PAGE_HEIGHT`, `MARGIN`, `COLORS` from layout.js
- Produces: `generateCover(doc, totalPlayers)` → void

- [ ] **Step 1: Crear api/pdf/cover.js**

```javascript
import { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, COLORS } from './layout.js';

export function generateCover(doc, totalPlayers) {
  const centerX = PAGE_WIDTH / 2;
  const now = new Date();
  const fechaStr = now.toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  doc.fontSize(28).font('Helvetica-Bold').fillColor(COLORS.title);
  doc.text('PRONÓSTICOS DE LA PORRA', MARGIN, 200, { width: PAGE_WIDTH - 2 * MARGIN, align: 'center' });

  doc.fontSize(18).font('Helvetica').fillColor(COLORS.subtitle);
  doc.text('Champions League 2025-26', MARGIN, 240, { width: PAGE_WIDTH - 2 * MARGIN, align: 'center' });

  doc.fontSize(11).fillColor(COLORS.lightText);
  doc.text(`Generado: ${fechaStr}`, MARGIN, 300, { width: PAGE_WIDTH - 2 * MARGIN, align: 'center' });
  doc.text(`Total jugadores: ${totalPlayers}`, MARGIN, 318, { width: PAGE_WIDTH - 2 * MARGIN, align: 'center' });

  const disclaimerY = 380;
  const disclaimerWidth = 400;
  const disclaimerX = (PAGE_WIDTH - disclaimerWidth) / 2;

  doc.save();
  doc.rect(disclaimerX - 10, disclaimerY - 10, disclaimerWidth + 20, 120).fill('#fff3cd');
  doc.restore();

  doc.save();
  doc.rect(disclaimerX - 10, disclaimerY - 10, disclaimerWidth + 20, 120).lineWidth(1).strokeColor('#ffc107').stroke();
  doc.restore();

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#856404');
  doc.text('AVISO IMPORTANTE', disclaimerX, disclaimerY, { width: disclaimerWidth, align: 'center' });

  doc.fontSize(9).font('Helvetica').fillColor('#856404');
  doc.text(
    'Revisa tus pronósticos en este PDF. Los datos introducidos deberían coincidir en la web y en el PDF, pero cualquier reclamación se resolverá a partir de este documento (esto es lo que realmente vale).',
    disclaimerX, disclaimerY + 18,
    { width: disclaimerWidth, align: 'justify' }
  );
}
```

- [ ] **Step 2: Verificar que la función existe**

```bash
node -e "import('./api/pdf/cover.js').then(m => console.log('generateCover:', typeof m.generateCover))"
```

Expected: `generateCover: function`

- [ ] **Step 3: Commit**

```bash
git add api/pdf/cover.js
git commit -m "feat: add PDF cover page generator"
```

---

### Task 5: Crear predictions.js — Grid de pronósticos de liga

**Files:**
- Create: `api/pdf/predictions.js`

**Interfaces:**
- Consumes: `MARGIN`, `CONTENT_WIDTH`, `COLORS`, `drawSectionTitle` from layout.js; `abreviarNombre` from utils.js
- Produces: `drawPredictions(doc, matchesByRound, predictions, teamsMap, y)` → newY

- [ ] **Step 1: Crear api/pdf/predictions.js**

```javascript
import { MARGIN, CONTENT_WIDTH, COLORS, drawSectionTitle } from './layout.js';
import { abreviarNombre } from './utils.js';

const COLS = 4;
const ROWS = 2;
const COL_WIDTH = Math.floor((CONTENT_WIDTH - (COLS - 1) * 5) / COLS);
const LINE_HEIGHT = 7;
const MATCHES_PER_ROUND = 18;
const ROUND_HEADER_HEIGHT = 10;
const ROUND_HEIGHT = ROUND_HEADER_HEIGHT + MATCHES_PER_ROUND * LINE_HEIGHT;

export function drawPredictions(doc, matchesByRound, predictions, teamsMap, y) {
  y = drawSectionTitle(doc, 'PRONÓSTICOS DE LIGA', y);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const roundIndex = row * COLS + col;
      if (roundIndex >= 8) break;

      const roundMatches = matchesByRound[roundIndex + 1];
      if (!roundMatches) continue;

      const x = MARGIN + col * (COL_WIDTH + 5);
      const roundY = y + row * (ROUND_HEIGHT + 10);

      doc.save();
      doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.accent);
      doc.text(`Jornada ${roundIndex + 1}`, x, roundY, { width: COL_WIDTH });
      doc.restore();

      for (let i = 0; i < roundMatches.length; i++) {
        const match = roundMatches[i];
        const matchY = roundY + ROUND_HEADER_HEIGHT + i * LINE_HEIGHT;

        const homeName = abreviarNombre(teamsMap[match.equipoLocal.id] || match.equipoLocal.name);
        const awayName = abreviarNombre(teamsMap[match.equipoVisitante.id] || match.equipoVisitante.name);

        const pred = predictions?.[match.id];
        const homeScore = pred ? String(pred.home) : '-';
        const awayScore = pred ? String(pred.away) : '-';

        doc.save();
        doc.fontSize(6).fillColor(COLORS.text);

        const scoreStr = `${homeScore}-${awayScore}`;
        const scoreWidth = 20;
        const nameWidth = Math.floor((COL_WIDTH - scoreWidth) / 2);

        doc.text(homeName, x, matchY, { width: nameWidth, align: 'right' });
        doc.text(scoreStr, x + nameWidth, matchY, { width: scoreWidth, align: 'center' });
        doc.text(awayName, x + nameWidth + scoreWidth, matchY, { width: nameWidth, align: 'left' });

        doc.restore();
      }
    }
  }

  return y + ROWS * (ROUND_HEIGHT + 10) + 5;
}
```

- [ ] **Step 2: Verificar importación**

```bash
node -e "import('./api/pdf/predictions.js').then(m => console.log('drawPredictions:', typeof m.drawPredictions))"
```

Expected: `drawPredictions: function`

- [ ] **Step 3: Commit**

```bash
git add api/pdf/predictions.js
git commit -m "feat: add PDF predictions grid (4x2 matchday layout)"
```

---

### Task 6: Crear bracket.js — Bracket visual de eliminatorias

**Files:**
- Create: `api/pdf/bracket.js`

**Interfaces:**
- Consumes: `MARGIN`, `CONTENT_WIDTH`, `COLORS`, `drawSectionTitle` from layout.js; `drawTeamCrest`, `abreviarNombre` from utils.js
- Produces: `drawBracket(doc, finalPredictions, teamsMap, y)` → newY

- [ ] **Step 1: Crear api/pdf/bracket.js**

```javascript
import { MARGIN, CONTENT_WIDTH, COLORS, drawSectionTitle } from './layout.js';
import { drawTeamCrest, abreviarNombre } from './utils.js';

const ROUNDS = [
  { key: 'roundOf32', label: '16avos', max: 8 },
  { key: 'roundOf16', label: 'Octavos', max: 8 },
  { key: 'quarterFinalists', label: 'Cuartos', max: 4 },
  { key: 'semiFinalists', label: 'Semis', max: 2 },
  { key: 'runnerUp', label: 'Final', max: 1 },
  { key: 'champion', label: 'Campeón', max: 1 },
];

const CREST_SIZE = 14;
const LINE_HEIGHT = 16;
const COL_GAP = 10;

export function drawBracket(doc, finalPredictions, teamsMap, y) {
  y = drawSectionTitle(doc, 'ELIMINATORIAS', y);

  const colWidth = Math.floor((CONTENT_WIDTH - (ROUNDS.length - 1) * COL_GAP) / ROUNDS.length);

  const roundHeights = ROUNDS.map(r => r.max * LINE_HEIGHT);
  const maxRoundHeight = Math.max(...roundHeights);

  for (let r = 0; r < ROUNDS.length; r++) {
    const round = ROUNDS[r];
    const x = MARGIN + r * (colWidth + COL_GAP);

    doc.save();
    doc.fontSize(6).font('Helvetica-Bold').fillColor(COLORS.accent);
    doc.text(round.label, x, y, { width: colWidth, align: 'center' });
    doc.restore();

    let teams;
    if (round.key === 'champion' || round.key === 'runnerUp') {
      teams = finalPredictions?.[round.key] ? [finalPredictions[round.key]] : [];
    } else {
      teams = finalPredictions?.[round.key] || [];
    }

    const roundHeight = teams.length * LINE_HEIGHT;
    const offsetY = (maxRoundHeight - roundHeight) / 2;

    for (let t = 0; t < round.max; t++) {
      const teamY = y + 10 + offsetY + t * LINE_HEIGHT;
      const teamId = teams[t];

      if (teamId) {
        drawTeamCrest(doc, teamId, x + 2, teamY, CREST_SIZE);
        const teamName = abreviarNombre(teamsMap[teamId] || String(teamId));
        doc.save();
        doc.fontSize(6).fillColor(COLORS.text);
        doc.text(teamName, x + CREST_SIZE + 4, teamY + 3, { width: colWidth - CREST_SIZE - 6 });
        doc.restore();
      } else {
        doc.save();
        doc.fontSize(6).fillColor(COLORS.lightText);
        doc.text('---', x + 2, teamY + 3, { width: colWidth - 4, align: 'center' });
        doc.restore();
      }
    }

    if (r < ROUNDS.length - 1) {
      const nextRound = ROUNDS[r + 1];
      const nextX = MARGIN + (r + 1) * (colWidth + COL_GAP);
      const nextTeams = nextRound.key === 'champion' || nextRound.key === 'runnerUp'
        ? (finalPredictions?.[nextRound.key] ? [finalPredictions[nextRound.key]] : [])
        : (finalPredictions?.[nextRound.key] || []);
      const nextRoundHeight = nextTeams.length * LINE_HEIGHT;
      const nextOffsetY = (maxRoundHeight - nextRoundHeight) / 2;

      for (let t = 0; t < teams.length; t++) {
        const fromY = y + 10 + offsetY + t * LINE_HEIGHT + CREST_SIZE / 2;
        const toIndex = Math.floor(t / (teams.length / Math.max(nextTeams.length, 1)));
        const toY = y + 10 + nextOffsetY + Math.min(toIndex, nextTeams.length - 1) * LINE_HEIGHT + CREST_SIZE / 2;

        doc.save();
        doc.moveTo(x + colWidth, fromY).lineTo(nextX, toY).strokeColor(COLORS.separator).lineWidth(0.3).stroke();
        doc.restore();
      }
    }
  }

  return y + 10 + maxRoundHeight + 5;
}
```

- [ ] **Step 2: Verificar importación**

```bash
node -e "import('./api/pdf/bracket.js').then(m => console.log('drawBracket:', typeof m.drawBracket))"
```

Expected: `drawBracket: function`

- [ ] **Step 3: Commit**

```bash
git add api/pdf/bracket.js
git commit -m "feat: add PDF eliminatorias bracket (progression pyramid)"
```

---

### Task 7: Crear plantilla.js — Sección de plantilla ideal

**Files:**
- Create: `api/pdf/plantilla.js`

**Interfaces:**
- Consumes: `MARGIN`, `CONTENT_WIDTH`, `COLORS`, `drawSectionTitle` from layout.js; `drawPlayerPhoto`, `abreviarNombre` from utils.js
- Produces: `drawPlantilla(doc, squad, y)` → newY

- [ ] **Step 1: Crear api/pdf/plantilla.js**

```javascript
import { MARGIN, CONTENT_WIDTH, COLORS, drawSectionTitle } from './layout.js';
import { drawPlayerPhoto, abreviarNombre } from './utils.js';

const POSITIONS = [
  { key: 'G', label: 'Porteros', max: 3, width: 120 },
  { key: 'D', label: 'Defensas', max: 8, width: 140 },
  { key: 'M', label: 'Medios', max: 8, width: 140 },
  { key: 'F', label: 'Delanteros', max: 6, width: 120 },
];

const PHOTO_SIZE = 12;
const LINE_HEIGHT = 14;
const COL_GAP = 5;

export function drawPlantilla(doc, squad, y) {
  y = drawSectionTitle(doc, 'PLANTILLA IDEAL', y);

  const totalWidth = POSITIONS.reduce((sum, p) => sum + p.width, 0) + (POSITIONS.length - 1) * COL_GAP;
  const startX = MARGIN + (CONTENT_WIDTH - totalWidth) / 2;

  let colX = startX;

  for (const pos of POSITIONS) {
    const players = (squad || []).filter(p => p.posicion === pos.key);

    doc.save();
    doc.fontSize(6).font('Helvetica-Bold').fillColor(COLORS.accent);
    doc.text(pos.label, colX, y, { width: pos.width, align: 'center' });
    doc.restore();

    for (let i = 0; i < pos.max; i++) {
      const playerY = y + 10 + i * LINE_HEIGHT;
      const player = players[i];

      if (player) {
        drawPlayerPhoto(doc, player.id, colX + 2, playerY + 1, PHOTO_SIZE);
        doc.save();
        doc.fontSize(6).fillColor(COLORS.text);
        const name = abreviarNombre(player.nombre);
        doc.text(name, colX + PHOTO_SIZE + 4, playerY + 2, { width: pos.width - PHOTO_SIZE - 6 });
        doc.restore();
      } else {
        doc.save();
        doc.fontSize(6).fillColor(COLORS.lightText);
        doc.text('---', colX + 2, playerY + 2, { width: pos.width - 4, align: 'center' });
        doc.restore();
      }
    }

    colX += pos.width + COL_GAP;
  }

  const maxPlayers = Math.max(...POSITIONS.map(p => p.max));
  return y + 10 + maxPlayers * LINE_HEIGHT + 5;
}
```

- [ ] **Step 2: Verificar importación**

```bash
node -e "import('./api/pdf/plantilla.js').then(m => console.log('drawPlantilla:', typeof m.drawPlantilla))"
```

Expected: `drawPlantilla: function`

- [ ] **Step 3: Commit**

```bash
git add api/pdf/plantilla.js
git commit -m "feat: add PDF plantilla ideal section (4-column position layout)"
```

---

### Task 8: Crear generator.js — Motor principal del PDF

**Files:**
- Create: `api/pdf/generator.js`

**Interfaces:**
- Consumes: `generateCover` from cover.js; `drawPlayerHeader` from layout.js; `drawPredictions` from predictions.js; `drawBracket` from bracket.js; `drawPlantilla` from plantilla.js
- Produces: `generatePDF(users, matchesByRound, teamsMap)` → Buffer (PDF)

- [ ] **Step 1: Crear api/pdf/generator.js**

```javascript
import PDFDocument from 'pdfkit';
import { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, drawPlayerHeader } from './layout.js';
import { generateCover } from './cover.js';
import { drawPredictions } from './predictions.js';
import { drawBracket } from './bracket.js';
import { drawPlantilla } from './plantilla.js';

export function generatePDF(users, matchesByRound, teamsMap) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: false,
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.addPage();
    generateCover(doc, users.length);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`Generando página ${i + 1}/${users.length}: ${user.username}`);

      doc.addPage();
      let y = MARGIN;

      y = drawPlayerHeader(doc, user, y);
      y = drawPredictions(doc, matchesByRound, user.predictions || {}, teamsMap, y);
      y = drawBracket(doc, user.finalPredictions, teamsMap, y);
      y = drawPlantilla(doc, user.squad, y);
    }

    doc.end();
  });
}
```

- [ ] **Step 2: Verificar importación**

```bash
node -e "import('./api/pdf/generator.js').then(m => console.log('generatePDF:', typeof m.generatePDF))"
```

Expected: `generatePDF: function`

- [ ] **Step 3: Commit**

```bash
git add api/pdf/generator.js
git commit -m "feat: add PDF generator (orchestrates all sections)"
```

---

### Task 9: Crear generatePDF.js — Script standalone

**Files:**
- Create: `scripts/generatePDF.js`

**Interfaces:**
- Consumes: `connectDB`, `disconnectDB`, `User` from db/index.js; `generatePDF` from api/pdf/generator.js
- Produces: PDF file at `data/pronosticos_porra.pdf`

- [ ] **Step 1: Crear scripts/generatePDF.js**

```javascript
import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import { connectDB, disconnectDB, User } from '../db/index.js';
import { generatePDF } from '../api/pdf/generator.js';

dotenv.config();

const OUTPUT_PATH = process.env.PDF_OUTPUT_PATH || 'data/pronosticos_porra.pdf';

async function main() {
  console.log('=== Generador de PDF de Pronósticos ===\n');

  await connectDB();

  console.log('Cargando datos estáticos...');
  const calendar = JSON.parse(readFileSync('./data/sofascore/calendar.json', 'utf8'));
  const teamsData = JSON.parse(readFileSync('./data/sofascore/teams.json', 'utf8'));

  const teamsMap = {};
  for (const team of teamsData) {
    teamsMap[team.id] = team.name;
  }

  const matchesByRound = {};
  for (const match of calendar) {
    if (match.fase === 'liga') {
      if (!matchesByRound[match.ronda]) matchesByRound[match.ronda] = [];
      matchesByRound[match.ronda].push(match);
    }
  }

  console.log('Obteniendo jugadores con pronósticos confirmados...');
  const users = await User.find({ predictionsConfirmed: true }).lean();

  if (users.length === 0) {
    console.log('No hay jugadores con pronósticos confirmados.');
    await disconnectDB();
    process.exit(0);
  }

  console.log(`Encontrados ${users.length} jugadores.\n`);

  console.log('Generando PDF...');
  const pdfBuffer = await generatePDF(users, matchesByRound, teamsMap);

  writeFileSync(OUTPUT_PATH, pdfBuffer);
  console.log(`\nPDF guardado en: ${OUTPUT_PATH}`);
  console.log(`Tamaño: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

  await disconnectDB();
  console.log('\n¡Completado!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verificar que el script carga correctamente (sin ejecutar MongoDB)**

```bash
node -e "import('./scripts/generatePDF.js').catch(e => console.log('Import check:', e.message.includes('MONGODB') ? 'OK (needs DB)' : e.message))"
```

Expected: `Import check: OK (needs DB)` o similar (el script fallará sin MongoDB, pero los imports deben funcionar)

- [ ] **Step 3: Commit**

```bash
git add scripts/generatePDF.js
git commit -m "feat: add standalone PDF generation script"
```

---

### Task 10: Ejecutar y verificar el PDF

**Files:**
- Test: `data/pronosticos_porra.pdf` (generated output)

- [ ] **Step 1: Ejecutar el script**

```bash
node scripts/generatePDF.js
```

Expected output:
```
=== Generador de PDF de Pronósticos ===

MongoDB connected
Cargando datos estáticos...
Obteniendo jugadores con pronósticos confirmados...
Encontrados X jugadores.

Generando página 1/X: usuario1
Generando página 2/X: usuario2
...

PDF guardado en: data/pronosticos_porra.pdf
Tamaño: XXX.X KB

¡Completado!
```

- [ ] **Step 2: Verificar que el PDF se generó**

```bash
ls -la data/pronosticos_porra.pdf
```

Expected: archivo existe con tamaño > 0

- [ ] **Step 3: Abrir el PDF y verificar visualmente**

Abrir `data/pronosticos_porra.pdf` con un visor de PDF y comprobar:
- Portada con título, fecha y disclaimer
- Una página por jugador con las 4 secciones
- Escudos y fotos visibles
- Bracket de eliminatorias con pirámide
- Plantilla en 4 columnas por posición

- [ ] **Step 4: Commit final (si hay ajustes)**

Si se hicieron ajustes durante la verificación:
```bash
git add -A
git commit -m "fix: layout adjustments after visual verification"
```
