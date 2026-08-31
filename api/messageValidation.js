/**
 * Validación del gestor de mensajes.
 * Fechas: null o string 'YYYY-MM-DD' (fecha de calendario válida).
 * Si ambas presentes, inicio <= fin (comparación lexicográfica de YYYY-MM-DD).
 */

const TIPOS_VALIDOS = ['noticia', 'aviso', 'felicitacion', 'resumen', 'mantenimiento'];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function esFechaValida(s) {
  if (typeof s !== 'string' || !RE_FECHA.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

export function validateMessage({ title, content, type, fechaInicio, fechaFin }) {
  if (typeof title !== 'string' || title.trim() === '') {
    return { ok: false, error: 'El título es obligatorio' };
  }
  if (title.trim().length > 200) {
    return { ok: false, error: 'El título no puede superar 200 caracteres' };
  }
  if (typeof content !== 'string' || content.trim() === '') {
    return { ok: false, error: 'El contenido es obligatorio' };
  }
  if (!TIPOS_VALIDOS.includes(type)) {
    return { ok: false, error: `Tipo de mensaje inválido: ${type}` };
  }
  if (fechaInicio != null && fechaInicio !== '' && !esFechaValida(fechaInicio)) {
    return { ok: false, error: 'Fecha de inicio inválida' };
  }
  if (fechaFin != null && fechaFin !== '' && !esFechaValida(fechaFin)) {
    return { ok: false, error: 'Fecha de fin inválida' };
  }
  const inicio = fechaInicio == null || fechaInicio === '' ? null : fechaInicio;
  const fin = fechaFin == null || fechaFin === '' ? null : fechaFin;
  if (inicio && fin && inicio > fin) {
    return { ok: false, error: 'La fecha de inicio debe ser anterior o igual al fin' };
  }
  return {
    ok: true,
    message: { title: title.trim(), content: content.trim(), type, fechaInicio: inicio, fechaFin: fin }
  };
}