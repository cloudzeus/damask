#!/usr/bin/env bash
# Εγκατάσταση/ρύθμιση PgBouncer δίπλα στον κοινό Postgres (θύρα 6432). Δεν αγγίζει το Postgres (καμία επανεκκίνηση).
# Ασφαλές να ξανατρέξει: κρατά αντίγραφο της παλιάς ρύθμισης και, αν το νέο δεν ξεκινήσει, επαναφέρει αυτόματα.
# Χρήση (στον server, ως root):  sudo bash pgbouncer-setup.sh
set -euo pipefail

INI=/etc/pgbouncer/pgbouncer.ini
USERLIST=/etc/pgbouncer/userlist.txt
STAMP=$(date +%Y%m%d-%H%M%S)

[ "$(id -u)" -eq 0 ] || { echo "Τρέξτε το με sudo."; exit 1; }

# 1. Εγκατάσταση (αν λείπει)
if ! command -v pgbouncer >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq pgbouncer
fi

# 2. Διεύθυνση Tailscale (για τις εφαρμογές από άλλα μηχανήματα) + localhost
TS_IP=$(tailscale ip -4 2>/dev/null | head -1 || true)
LISTEN="127.0.0.1${TS_IP:+,$TS_IP}"
echo "Ακρόαση σε: $LISTEN:6432"

# 3. Λίστα χρηστών από τα SCRAM hashes του Postgres (όχι κωδικοί σε απλό κείμενο)
[ -f "$USERLIST" ] && cp -a "$USERLIST" "$USERLIST.bak-$STAMP"
sudo -u postgres psql -Atc "SELECT '\"' || rolname || '\" \"' || rolpassword || '\"' FROM pg_authid WHERE rolcanlogin AND rolpassword IS NOT NULL" > "$USERLIST.new"
[ -s "$USERLIST.new" ] || { echo "Κενή λίστα χρηστών — σταματώ."; rm -f "$USERLIST.new"; exit 1; }
mv "$USERLIST.new" "$USERLIST"
chown postgres:postgres "$USERLIST"; chmod 640 "$USERLIST"
echo "Χρήστες: $(wc -l < "$USERLIST")"

# 4. Ρύθμιση (με αντίγραφο της προηγούμενης)
[ -f "$INI" ] && cp -a "$INI" "$INI.bak-$STAMP"
cat > "$INI" <<EOF
[databases]
* = host=127.0.0.1 port=5432

[pgbouncer]
listen_addr = $LISTEN
listen_port = 6432
unix_socket_dir = /var/run/postgresql
auth_type = scram-sha-256
auth_file = $USERLIST
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 15
max_db_connections = 25
reserve_pool_size = 5
reserve_pool_timeout = 3
max_prepared_statements = 200
ignore_startup_parameters = extra_float_digits,options
server_idle_timeout = 60
logfile = /var/log/postgresql/pgbouncer.log
pidfile = /var/run/postgresql/pgbouncer.pid
admin_users = postgres
EOF
chown postgres:postgres "$INI"; chmod 640 "$INI"

# 5. Να ξεκινά ΜΕΤΑ το Tailscale (αλλιώς δεν βρίσκει τη διεύθυνση στην εκκίνηση του server)
if [ -n "$TS_IP" ]; then
  mkdir -p /etc/systemd/system/pgbouncer.service.d
  printf '[Unit]\nAfter=tailscaled.service network-online.target\nWants=network-online.target\n' > /etc/systemd/system/pgbouncer.service.d/after-tailscale.conf
  systemctl daemon-reload
fi

# 6. Εκκίνηση — αν αποτύχει, επαναφορά της παλιάς ρύθμισης
systemctl enable pgbouncer >/dev/null 2>&1 || true
if ! systemctl restart pgbouncer || ! sleep 2 || ! systemctl is-active --quiet pgbouncer; then
  echo "Το PgBouncer δεν ξεκίνησε — επαναφορά."
  journalctl -u pgbouncer -n 20 --no-pager || true
  [ -f "$INI.bak-$STAMP" ] && cp -a "$INI.bak-$STAMP" "$INI" && systemctl restart pgbouncer || true
  exit 1
fi

echo "OK — το PgBouncer τρέχει στη θύρα 6432. Το Postgres (5432) δεν άλλαξε."
ss -ltnp | grep 6432 || true
