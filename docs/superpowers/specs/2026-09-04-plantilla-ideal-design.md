# Diseño: Plantilla Ideal 2026/27

Fecha: 2026-09-04
Estado: aprobado por usuario, pendiente de ejecución

## 1. Contexto

- Repo `api-porra`: API Node + Mongo. Ficheros solo-lectura: `data/sofascore/jugadores.json` (854 jugadores), `data/sofascore/teams.json` (36 equipos), `data/sofascore/calendar.json` (144 partidos fase liga, 8 por equipo: 4 local + 4 visitante).
- Normas (AGENTS.md): formación 3G-8D-8M-6F = 25 jugadores, máximo 1 por club (25 clubs de 36, 11 descartes). Puntúa TODA la Champions, no solo liga.
- Puntuación: rating Sofascore (6 = 0, +1/0.3 por encima, negativo por debajo con umbral 5.7 = -1); gol +1 más bonus demarcación (F +1, M +2, D +3, G +4; de penalti sin bonus); portero -1/gol recibido, +3/penalti parado; portería a cero +5 GK / +2 D si >70'.

## 2. Requisitos acordados

1. Sin pronósticos previos: el análisis incluye estimación de fuerza de equipos.
2. Fuentes: todo combinado (datos locales + ratings Sofascore 24/25 dirigidos + análisis favoritos/prensa 26/27 por web).
3. Perfil: mixta (base segura de titulares + 4-5 apuestas con techo).
4. Entregable: fichero MD (NO JSON directo, NO `PUT /api/squad`), lista cerrada 25 + 2-3 alternativas solo donde más duda.
5. Restricción crítica: 1 por club. Cada elección debe maximizar y justificar el bloqueo intra-club (elegir bien para no bloquear a otro mejor del mismo equipo).
6. Originales intocables: no modificar `jugadores.json`, `teams.json`, `calendar.json`. Stats nuevas en `data/sofascore/analisis-plantilla-2026-27.json` (fichero nuevo de trabajo).

## 3. Enfoques considerados

- A. Cuantitativo puro (scrapear 854): objetivo pero caro, sobreajusta 24/25, ignora fichajes/lesiones y sorteo 27-ago-2026. Descartado.
- B. Híbrido por tiers + validación dirigida (ELEGIDO): tiers de equipos + reglas por rol + validación Sofascore solo a ~60-80 candidatos.
- C. Solo upside goleador: techo alto pero volátil, flojo en rating/clean-sheet. Descartado.

## 4. Diseño de ejecución

### 4.1 Análisis de equipos
- Extraer de `calendar.json` los 8 rivales de cada club y dificultad de calendario.
- Cruce con favoritos 26/27 (web) + coeficiente UEFA → 3 tiers (top/medio/flojo), estimación top-8 y propuesta de 11 clubs descartados.

### 4.2 Decisión 1-por-club
- Para cada club candidato, comparativa intra-club de sus 2-3 mejores opciones.
- Criterio: puntos esperados = minutos probables x nº partidos esperados (lejos en Champions pesa) + encaje en hueco de formación.
- Reglas por rol: G titular top clean-sheet; D 90' + clean-sheet (2-3 con gol, bonus +3); M goleadores/penaltis (bonus +2, punto dulce); F pichichis de tier-top.
- Documentar por qué el elegido y no el otro, y dónde se cubre el perfil descartado con otro club.

### 4.3 Entrega MD
- Fichero `docs/superpowers/specs/2026-09-04-plantilla-ideal.md`: lista 3-8-8-6 con club, rol, justificación según normas y riesgo; alternativas (2-3) solo en dudas con trade-off.
- Sin escritura en API ni en originales.

### 4.4 Fichero de stats separado
- Solo lectura de originales. Stats intermedias en fichero nuevo de trabajo. Verificable por diff (originales sin cambios).

## 5. Alcance / no-objetivos
- No se ejecutan `PUT /api/squad` ni cambios de código.
- No se scrapean los 854 jugadores completos, solo candidatos.
- Siguiente paso tras aprobar spec: plan de implementación (writing-plans).
