import crypto from 'crypto';

/**
 * Calcula un ETag débil (W/"sha1") a partir del string JSON ya serializado.
 * Se calcula sobre el JSON SIN comprimir para ser independiente del transporte.
 */
export function computeWeakEtag(jsonString) {
  const hash = crypto.createHash('sha1').update(jsonString, 'utf8').digest('hex');
  return `W/"${hash}"`;
}

/**
 * Compara la cabecera If-None-Match con el ETag del recurso (comparación débil).
 * Acepta listas separadas por comas, valores con/sin prefijo W/ y '*'.
 */
export function etagMatches(ifNoneMatchHeader, etag) {
  if (!ifNoneMatchHeader) return false;
  const normalizedEtag = etag.replace(/^W\//, '');
  return ifNoneMatchHeader
    .split(',')
    .map(candidate => candidate.trim().replace(/^W\//, ''))
    .some(candidate => candidate === '*' || candidate === normalizedEtag);
}
