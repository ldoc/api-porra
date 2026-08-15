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
    const r = rango || {};
    const inicio = r.inicio == null || r.inicio === '' ? null : new Date(r.inicio);
    const fin = r.fin == null || r.fin === '' ? null : new Date(r.fin);
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
