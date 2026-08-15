/**
 * Validación y normalización de las fechas de inicio/fin de las fases.
 * Valores permitidos: ISO date string, "" o null (→ null = fecha desconocida).
 */

export function validateFasesFechas(fasesFechas, fasesValidas) {
  if (!fasesFechas || typeof fasesFechas !== 'object' || Array.isArray(fasesFechas)) {
    return { ok: false, error: 'fasesFechas debe ser un objeto' };
  }
  const validas = new Set(fasesValidas);
  const result = {};
  for (const [nombre, rango] of Object.entries(fasesFechas)) {
    if (!validas.has(nombre)) {
      return { ok: false, error: `Fase inválida: ${nombre}` };
    }
    if (!rango || typeof rango !== 'object' || Array.isArray(rango)) {
      return { ok: false, error: `Rango inválido para ${nombre}` };
    }
    const inicioRaw = rango.inicio;
    const finRaw = rango.fin;
    if (inicioRaw != null && inicioRaw !== '' && typeof inicioRaw !== 'string') {
      return { ok: false, error: `Fecha de inicio inválida en ${nombre}` };
    }
    if (finRaw != null && finRaw !== '' && typeof finRaw !== 'string') {
      return { ok: false, error: `Fecha de fin inválida en ${nombre}` };
    }
    const inicio = inicioRaw == null || inicioRaw === '' ? null : new Date(inicioRaw);
    const fin = finRaw == null || finRaw === '' ? null : new Date(finRaw);
    if (inicio && isNaN(inicio.getTime())) {
      return { ok: false, error: `Fecha de inicio inválida en ${nombre}` };
    }
    if (fin && isNaN(fin.getTime())) {
      return { ok: false, error: `Fecha de fin inválida en ${nombre}` };
    }
    if (inicio && fin && inicio.getTime() >= fin.getTime()) {
      return { ok: false, error: `La fecha de inicio debe ser anterior al fin en ${nombre}` };
    }
    result[nombre] = { inicio, fin };
  }
  return { ok: true, fasesFechas: result };
}
