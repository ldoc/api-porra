# Live scrapeo

Scrapeo manual de partidos en directo (Sofascore → colección `livematchs`).

```bash
node scripts/liveScrape.js <eventId...> [--interval 120]
```

- Hace upsert cada `--interval` segundos (defecto 120, mínimo 15).
- Borra cada doc 30 min tras `finishedAt` y termina solo cuando no quedan ids.
> Nota v1: el estado scrapeado es siempre `live` (minuto 0); el borrado automático aún no se dispara solo. Limpieza manual: Ctrl+C + `DELETE /api/live-matches/:eventId` (admin).
- Requiere `MONGODB_URI` en `.env` (usa la DB de desarrollo `/test`; nunca apuntes a `/prod`).

```bash
# Ejemplo (un partido, intervalo por defecto):
MONGODB_URI="mongodb+srv://.../test" node scripts/liveScrape.js 14566909 --interval 120
# Verificar:
curl -s http://localhost:3000/api/live-matches/updated
```

# Android (Termux)

```bash
pkg install nodejs git
MONGODB_URI="mongodb+srv://.../test" node scripts/liveScrape.js <ids>
```
