# Αναφορά Email (Mailgun Analytics) — Design

**Ημερομηνία:** 2026-07-25 · **Κατάσταση:** Εγκεκριμένο

## Στόχος

Νέα σελίδα `/mail-report` με πλήρη εικόνα της email δραστηριότητας: Mailgun
domain-wide στατιστικά με γραφήματα + τοπικό funnel newsletters ανά πρόγραμμα.

## Αποφάσεις (από συζήτηση)

- Τοποθέτηση: **νέα σελίδα** «Αναφορά Email», ομάδα «Διαχείριση» στο sidebar.
- Πηγές: **Mailgun API + τοπικά δεδομένα** (ProgramLead, ApiUsage).
- Περιεχόμενο: KPI κάρτες + timeseries, funnel ανά πρόγραμμα, αποτυχίες με
  λόγους, ενεργοποίηση open/click tracking στο `sendMail`.
- Γραφήματα: **recharts** (standard των shadcn charts) — νέο dependency.

## Αρχιτεκτονική

### 1. `src/lib/mailgun-stats.ts` (νέο)

Config από `getIntegration('mailgun')` (ίδιο pattern με `mailer.ts`),
region-aware base URL, `AbortSignal.timeout`, Basic auth `api:{key}`.

- `fetchMailgunStats(days)` → `GET /v3/{domain}/stats/total` με
  `event=accepted,delivered,failed,opened,clicked,complained,unsubscribed`,
  `resolution=day`, `duration={days}d`. Επιστρέφει ημερήσια σειρά +
  aggregates.
- `fetchRecentFailures(limit)` → `GET /v3/{domain}/events` με
  `event=failed OR rejected OR complained`, ταξινομημένα desc. Επιστρέφει
  παραλήπτη, event, λόγο (`reason`/`delivery-status.message`), severity,
  timestamp.
- Typed αποτελέσματα `{ ok: true, ... } | { ok: false, error }` +
  `configured: boolean` — καμία εξαίρεση δεν φτάνει στη σελίδα· κάθε ενότητα
  έχει δικό της empty/error state.
- Καθαροί mappers (χωρίς I/O) exported για tests: συμπλήρωση κενών ημερών,
  υπολογισμός ποσοστών (delivery/open/click/fail rate), normalization events.

### 2. Registry & permission

- `objects.ts`: item `mail-report` στην ομάδα «Διαχείριση», href
  `/mail-report`, icon `MailCheck` (lucide), `menuPermission: 'mail.report'`,
  permission `mail.report` «Προβολή αναφοράς email (Mailgun analytics)».
- `npm run db:sync-permissions` μετά την προσθήκη.

### 3. Σελίδα `src/app/(app)/mail-report/page.tsx`

Server component (pattern σελίδας `/costs`):
- `requirePermission('mail.report')`
- searchParam `range` (7/30/90 ημέρες, default 30)
- `Promise.all`: Mailgun stats, πρόσφατες αποτυχίες, `ProgramLead` groupBy
  (programId, status) + τίτλοι προγραμμάτων, μηνιαία sends από `ApiUsage`
  (service=mailgun).

### 4. View `mail-report-view.tsx` (client)

- 6 KPI κάρτες: Απεσταλμένα (accepted), Παραδόθηκαν (+delivery rate),
  Άνοιξαν (+open rate), Κλικ (+CTR), Αποτυχίες (+fail rate),
  Παράπονα/Διαγραφές.
- Γράφημα ημερήσιας εξέλιξης (recharts AreaChart/LineChart):
  delivered/opened/clicked/failed.
- Πίνακας funnel ανά πρόγραμμα: υποψήφιοι → εστάλησαν → κλικ + ποσοστά.
- Πίνακας πρόσφατων αποτυχιών: ώρα, παραλήπτης, τύπος, λόγος.
- Range picker 7/30/90 μέσω URL (όπως costs).
- Compact 14px, sans-serif, συνεπές με το υπόλοιπο dashboard.

### 5. Tracking στο `sendMail`

Νέο optional πεδίο `tracking?: boolean` (default `true`) στο `SendMailInput`:
προσθέτει `o:tracking=yes`, `o:tracking-opens=yes`, `o:tracking-clicks=htmlonly`.
Τα opens/clicks του Mailgun γεμίζουν μόνο για emails μετά την αλλαγή.

## Error handling

- Mailgun μη ρυθμισμένο → banner «Το Mailgun δεν έχει ρυθμιστεί» + link στο
  /settings, τα τοπικά δεδομένα (funnel) εμφανίζονται κανονικά.
- HTTP σφάλμα Mailgun → per-section μήνυμα σφάλματος, όχι crash σελίδας.

## Testing

Vitest σε καθαρούς mappers: συμπλήρωση κενών ημερών σειράς, ποσοστά με
μηδενικούς παρονομαστές, normalization failure events (fallback πεδίων λόγου).
