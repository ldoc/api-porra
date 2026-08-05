#!/bin/bash
# Scrape all matches from api-porra (guarda directamente en MongoDB)

# Get all match IDs from calendar
IDS=$(cat /home/ldoc/Proyectos/porra-spa/data/calendar.json | python3 -c "
import sys,json
data = json.load(sys.stdin)
for m in data:
    print(m['id'])
")

TOTAL=$(echo "$IDS" | wc -l)
COUNT=0
ERRORS=0

for id in $IDS; do
    COUNT=$((COUNT + 1))
    echo -ne "\r[$COUNT/$TOTAL] Scraping match $id..."

    RESPONSE=$(curl -s --max-time 30 "http://localhost:3000/api/match-stats/$id" 2>/dev/null)

    if ! echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
        echo "ERROR: $id"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "Done! Scraped: $((COUNT - ERRORS)), Errors: $ERRORS"
