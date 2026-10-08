#!/bin/sh
# Εκκίνηση container: 1) εφαρμογή εκκρεμών migrations 2) server.
# Αν οι migrations αποτύχουν, ο server ξεκινά κανονικά (να μη μείνει η εφαρμογή κάτω) και
# το σφάλμα φαίνεται στα logs. SKIP_MIGRATIONS=1 για παράκαμψη.
export PRISMA_HIDE_UPDATE_MESSAGE=1
if [ "${SKIP_MIGRATIONS}" != "1" ]; then
  echo "[start] prisma migrate deploy…"
  if /opt/migrate/node_modules/.bin/prisma migrate deploy --config /opt/migrate/prisma.config.mjs; then
    echo "[start] migrations OK"
  else
    echo "[start] ⚠ οι migrations απέτυχαν — ο server ξεκινά· έλεγξε τα παραπάνω logs"
  fi
fi
exec node server.js
