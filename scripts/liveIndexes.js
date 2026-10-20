export function duplicateIndexAbortMessage(groups, sampleLimit = 10) {
  const dupes = Array.isArray(groups) ? groups.filter(g => g && g.count > 1) : [];
  if (!dupes.length) return null;
  const limit = Number.isInteger(sampleLimit) && sampleLimit > 0 ? sampleLimit : 10;
  const lines = dupes.slice(0, limit).map(g =>
    `  eventId=${g._id?.eventId} sourceId=${g._id?.sourceId} documentos=${g.count}`
  );
  const remaining = dupes.length - limit;
  if (remaining > 0) lines.push(`  ... y ${remaining} grupos más`);
  return [
    'ABORTADO: existen documentos duplicados por {eventId, sourceId} en liveevents.',
    ...lines,
    'Elimina los duplicados y vuelve a ejecutar este script. No se han tocado los índices.'
  ].join('\n');
}
