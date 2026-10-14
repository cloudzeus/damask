# PgBouncer — οδηγός μετάβασης για τα projects του κοινού Postgres

Server: `postgres-dbserver` · Postgres **5432** (απευθείας) · PgBouncer **6432** (transaction pooling), στο `127.0.0.1` και στο Tailscale `100.70.50.43`.
Ίδιοι χρήστες/κωδικοί/βάσεις — **αλλάζει μόνο η θύρα**. Rollback = θύρα πίσω στο 5432.

## 1. Ο κανόνας

| Τι | Πού συνδέεται |
|---|---|
| Η εφαρμογή (queries, Prisma Client, ORM) | **6432** (PgBouncer) |
| Migrations (`prisma migrate`, `db push`, drizzle-kit, knex migrate) | **5432** (απευθείας) |
| pg-boss, LISTEN/NOTIFY, advisory locks σε session, `SET` χωρίς `LOCAL`, temp tables, cursors εκτός transaction | **5432** |
| Backups (`pg_dump`/`pg_restore`), psql συντήρηση | **5432** |

## 2. Ανά τύπο project

### A. Prisma 7 (`prisma.config.ts` + `@prisma/adapter-pg`) — όπως το damask
`.env` (production: στις μεταβλητές του Coolify):
```
DATABASE_URL=postgresql://USER:PASS@100.70.50.43:5432/DB      # migrations / pg-boss / backups
PGBOUNCER_PORT=6432                                            # η εφαρμογή μέσω PgBouncer
```
`src/lib/prisma.ts`:
```ts
export function pooledDatabaseUrl(url = process.env.DATABASE_URL, port = process.env.PGBOUNCER_PORT) {
  if (!url || !port || !/^\d+$/.test(port)) return url
  try { const u = new URL(url); u.port = port; return u.toString() } catch { return url }
}
const adapter = new PrismaPg({ connectionString: pooledDatabaseUrl(), max: Number(process.env.DB_POOL_MAX) || 10 })
```
Το `prisma.config.ts` μένει με `env('DATABASE_URL')` (5432) για τα migrations. Κάθε άλλο απευθείας `pg` (pg-boss, scripts) συνεχίζει με το `DATABASE_URL`.

### B. Prisma 5/6 (`datasource` στο `schema.prisma`)
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```
```
DATABASE_URL=postgresql://USER:PASS@100.70.50.43:6432/DB?pgbouncer=true&connection_limit=10
DIRECT_URL=postgresql://USER:PASS@100.70.50.43:5432/DB
```
Το `pgbouncer=true` είναι **υποχρεωτικό** εδώ (ο Prisma 5/6 χρησιμοποιεί named prepared statements). Τα migrations πάνε αυτόματα στο `DIRECT_URL`.

### C. Σκέτο `pg` / Drizzle / Knex / TypeORM
Μόνο η θύρα στο URL της εφαρμογής → `6432`. Migrations με χωριστό URL στο `5432`.
Έλεγξε ότι ο κώδικας δεν κάνει `SET search_path/timezone…` σε επίπεδο σύνδεσης (μετακίνησέ το σε `options` του URL ή σε `SET LOCAL` μέσα σε transaction).

### D. Μένουν απευθείας (5432), χωρίς αλλαγή
- Ό,τι έχει **pg-boss** / workers με LISTEN/NOTIFY.
- **mastra_ai** (μνήμη/vectors, λίγες συνδέσεις — δεν κερδίζει τίποτα).
- Εργαλεία BI/αναφορών με μακριές συνεδρίες (π.χ. dgsmartbi αν κρατά ανοιχτές συνδέσεις με `SET`).

## 3. Βήματα ανά project (ένα τη φορά)
1. Δες τι host έχει σήμερα το `DATABASE_URL`. Αν είναι `100.70.50.43` → κράτα τον, άλλαξε μόνο τη θύρα.
   Αν είναι όνομα container / `172.x` / `localhost` μέσα σε Docker → **σταμάτα**: το PgBouncer δεν ακούει εκεί (χρειάζεται `listen_addr` στο docker bridge).
2. Εφάρμοσε το A, B ή C. Κράτα το απευθείας URL για migrations.
3. Coolify → Environment Variables → αποθήκευση → **Redeploy**.
4. Έλεγχος (από οπουδήποτε με psql στη θύρα 5432):
   ```sql
   select datname, host(client_addr) src, count(*) from pg_stat_activity group by 1,2 order by 1;
   ```
   Οι συνδέσεις του project από `127.0.0.1` = περνούν από PgBouncer.
5. Άνοιξε την εφαρμογή, κάνε αναζήτηση/αποθήκευση. Σε σφάλμα → θύρα πίσω στο 5432 + redeploy.

Προτεινόμενη σειρά (από όσα ανοίγουν τις περισσότερες συνδέσεις): **wooMakis → kolshop → hdcfront → euronics → espa**.

## 4. Συντήρηση
- Νέος χρήστης/αλλαγή κωδικού στο Postgres → ξανατρέξε `sudo bash /tmp/pgbouncer-setup.sh` (ανανεώνει τη λίστα χρηστών· script: `scripts/ops/pgbouncer-setup.sh`).
- Κατάσταση pools: `sudo -u postgres psql -p 6432 -h 127.0.0.1 pgbouncer -c "show pools;"`
- Logs: `/var/log/postgresql/pgbouncer.log` · διακοπή χωρίς επίπτωση σε όσους είναι στο 5432: `sudo systemctl stop pgbouncer`.
- Όρια: έως 1000 συνδέσεις από εφαρμογές, έως 25 πραγματικές ανά βάση προς το Postgres (`max_db_connections`).

## 5. Συχνά σφάλματα
| Μήνυμα | Αιτία → λύση |
|---|---|
| `prepared statement "s0" already exists` | Prisma 5/6 χωρίς `?pgbouncer=true` → πρόσθεσέ το |
| `password authentication failed` στο 6432 | Χρήστης/κωδικός άλλαξε μετά την εγκατάσταση → ξανατρέξε το script |
| Migration κολλάει/αποτυγχάνει | Τρέχει στο 6432 → βάλε `directUrl`/απευθείας URL στο 5432 |
| Εργασίες pg-boss δεν τρέχουν | pg-boss στο 6432 → γύρνα το στο 5432 |
| «Κανένα αποτέλεσμα» μετά από redeploy | Παλιά καρτέλα browser (stale server actions) → Cmd+Shift+R |
