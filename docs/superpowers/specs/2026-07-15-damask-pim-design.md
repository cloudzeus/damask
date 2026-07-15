# DAMASK PIM — Design Spec

**Ημερομηνία:** 2026-07-15
**Κατάσταση:** Εγκεκριμένο σχέδιο (v2, μετά από brainstorming)

## 1. Σκοπός

Εσωτερικό σύστημα PIM (Product Information Management) + B2B portal για την Damask, με πλήρη αμφίδρομη διασύνδεση με το SoftOne ERP (oncloud). Διαχειρίζεται προϊόντα σε 2 γλώσσες (EL/EN), πελάτες, επαφές, παραγγελίες με ροή εγκρίσεων, συνεργαζόμενους αρχιτέκτονες με προμήθειες, και δυναμική τιμολόγηση βάσει πληρότητας container εισαγωγής.

## 2. Stack & Deployment

- **Next.js 16.2+** (App Router) — server components για όλα τα data fetching
- **Tailwind CSS 4.1** + **shadcn/ui** + **GSAP** (animations)
- **Prisma ORM → PostgreSQL** (ρητή επιλογή χρήστη — παρακάμπτει τον global κανόνα MySQL)
- **Auth.js v5** — credentials login, database sessions
- **pg-boss** — ουρές jobs πάνω στην Postgres, μέσα στο Next.js process (ενεργοποίηση στο `instrumentation.ts`). Cron, retries με exponential backoff, rate limiting. Όχι Redis, όχι ξεχωριστός worker (επιλογή: Μονόλιθος).
- **Deployment:** ένα Docker container + PostgreSQL σε δικό μας server (Coolify/VPS)
- Μεταφράσεις: **DeepSeek API** (OpenAI-compatible chat)
- Media: **BunnyCDN** (Storage Zone + Optimizer για εικόνες/3D, Bunny Stream για videos)

Διαθέσιμα: SoftOne oncloud credentials, DeepSeek API key, BunnyCDN λογαριασμός, PostgreSQL server.

## 3. Κλίμακα

5.000–50.000 είδη MTRL. Incremental sync με φίλτρο UPDDATE, batched μεταφράσεις, προσεκτικό indexing.

## 4. RBAC — permission-based

Πίνακας `Permission` (π.χ. `product.edit`, `product.publish`, `translation.approve`, `order.approve`, `order.autoapprove`, `container.manage`, `commission.view`, `commission.manage`, `customer.edit`, `unit.manage`, `sync.run`, `settings.manage`…). Οι ρόλοι είναι σύνολα permissions, επεξεργάσιμα από UI (ADMIN).

| Ρόλος | Περιγραφή |
|---|---|
| `ADMIN` | Όλα τα permissions + χρήστες + ρυθμίσεις sync |
| `PURCHASING` | Containers, προμηθευτές, κόστη μεταφοράς, μονάδες μέτρησης, override τιμών |
| `PRODUCT_MANAGER` | Προϊόντα, μεταφράσεις, media, κατηγορίες |
| `SALES` | Πελάτες, επαφές, παραγγελίες, εγκρίσεις παραγγελιών |
| `ARCHITECT` | Παραγγέλνει για λογαριασμό των πελατών του, βλέπει προμήθειές του |
| `CUSTOMER` | B2B portal: κατάλογος, δικές του τιμές, δικές του παραγγελίες |

Κάθε `CUSTOMER` user συνδέεται με έναν TRDR του SoftOne. Κάθε `ARCHITECT` συνδέεται με Ν πελάτες.

## 5. Μοντέλο δεδομένων (κύριες οντότητες)

- **`User`** — Auth.js, ρόλος, σύνδεση με `Customer` (για CUSTOMER) ή `ArchitectProfile` (για ARCHITECT)
- **`Role`**, **`Permission`**, **`RolePermission`** — RBAC
- **`Product`** — καθρέφτης MTRL: `mtrl` (S1 id), `code`, βασικά πεδία, τιμές (χονδρική/λιανική), απόθεμα, **CBM/τεμάχιο**, **βάρος/τεμάχιο**, PIM status (`DRAFT / COMPLETE / PUBLISHED`)
- **`ProductTranslation`** — `(productId, locale)` → name, shortDescription, description, SEO title/description. EL από S1· EN από DeepSeek ή χειροκίνητα· flags `machineTranslated`, `reviewStatus` (`NEEDS_REVIEW / APPROVED`)
- **`Category` / `Group` / `Subgroup`** (+ translations) — καθρέφτες MTRCATEGORY / MTRGROUP / CCCSUBGROUP2
- **`Unit`** — καθρέφτης S1 MTRUNIT. Ανά προϊόν: ΜΜ αγοράς, ΜΜ πώλησης, συντελεστές μετατροπής. Επεξεργάσιμα στο PIM, αμφίδρομο sync.
- **`MediaAsset`** — `(productId, type: IMAGE|VIDEO|MODEL_3D, cdnUrl, sortOrder, meta)`. Απεριόριστα ανά προϊόν.
- **`Customer`** — καθρέφτης TRDR + **`CustomerUser`** (B2B logins) + **`Contact`** (πολλές επαφές ανά πελάτη, sync με επαφές TRDR όπου γίνεται)
- **`ArchitectProfile`** — σύνδεση με User, default ποσοστό προμήθειας, **`ArchitectCustomer`** (1→Ν πελάτες)
- **`Order` / `OrderLine`** — τοπική παραγγελία, `s1Findoc` μετά το push. Το `OrderLine` κρατά **snapshot τιμής** (κλειδωμένη τη στιγμή της παραγγελίας), δεσμευμένο όγκο CBM, σύνδεση με `Container`.
- **`Container`** — προμηθευτής, χωρητικότητα CBM, συνολικό κόστος μεταφοράς, status `OPEN → CLOSED → ORDERED → SHIPPED → RECEIVED`, overrides τιμών (ανά container ή ανά είδος)
- **`CommissionEntry`** — ledger προμηθειών αρχιτεκτόνων ανά παραγγελία
- **`PriceCache`** — τιμές ανά πελάτη από S1, TTL ~1 ώρα
- **`SyncLog`**, **`S1Outbox`**, **`S1Session`** — υποδομή sync
- **`ImportMapping`** — αποθηκευμένα mapping templates ανά οντότητα (entity, name, columnMap Json)
- **`DocumentTemplate`** — templates εγγράφων προσφορών/αναφορών (type, name, config Json)
- **`Job`-σχετικά** — τα διαχειρίζεται το pg-boss (δικό του schema)

## 6. SoftOne διασύνδεση

Client κατά το πρότυπο του global CLAUDE.md:

- Μόνο επίσημα S1 services (softone.gr/ws), two-step auth (`login` → `authenticate`)
- Session clientID cached **ημερησίως σε πίνακα DB** (`S1Session`) αντί για αρχείο· re-auth σε errorcode -100/-101
- Όλα τα responses **win1253** → iconv-lite + `arrayBuffer()`

**Pull (cron κάθε 15′ + κουμπί «Sync τώρα» ανά οντότητα ή συνολικά):**
incremental μέσω `SqlData` / `getBrowserInfo`+`getBrowserData` με φίλτρο UPDDATE — είδη, κατηγορίες/ομάδες/υποομάδες, μονάδες μέτρησης, πελάτες, επαφές, αποθέματα, τιμές.

**Push (outbox pattern):** κάθε αλλαγή στο PIM που αφορά το S1 γράφεται τοπικά + δημιουργεί εγγραφή `S1Outbox` → pg-boss job → `setData` → **verify-after-write** (getData read-back και σύγκριση — το `success:true` του S1 δεν εγγυάται persist) → `DONE / FAILED`. Στόχοι: ITEM (είδη, νέα είδη, ΜΜ, CBM), CUSTOMER (πελάτες), επαφές, SALDOC (παραγγελίες), βοηθητικά objects (ITECATEGORY, $cccSubgroup2 με read-before-write ολόκληρης γραμμής, κ.λπ.).

**Γνωστοί περιορισμοί:** το MTRGROUP NAME δεν είναι εγγράψιμο μέσω WS (multi-company rows) — το UI μπλοκάρει το rename με σαφές μήνυμα. Τα `$`-prefixed EditList objects κάνουν full-row overwrite — πάντα read-before-write.

**Τιμές B2B:** ανά πελάτη μέσω `calculate` / τιμοκαταλόγων S1, cached στην `PriceCache`, fallback στη χονδρική αν αποτύχει η κλήση.

## 7. Containers & δυναμική τιμολόγηση

- Κάθε γραμμή B2B/architect παραγγελίας δεσμεύει όγκο (τεμάχια × CBM/τεμάχιο) στο ανοιχτό container του προμηθευτή.
- **Τιμή γραμμής τη στιγμή της παραγγελίας** = τιμή πελάτη (από S1) + μερίδιο μεταφορικών:
  `freightShare = συνολικό κόστος μεταφοράς × (CBM γραμμής / max(δεσμευμένο CBM, ελάχιστη βάση))` — η ακριβής φόρμουλα και η «ελάχιστη βάση» (ώστε οι πρώτες παραγγελίες να μην χρεώνονται όλο το container) οριστικοποιούνται στο spec της Φάσης 7.
- **Override** από PURCHASING/ADMIN: ανά container ή ανά είδος (σταθερή επιβάρυνση ή ποσοστό).
- Η τιμή **κλειδώνει στο snapshot** του OrderLine — καμία αναδρομική αλλαγή.
- Το portal δείχνει ζωντανή πληρότητα container και τρέχουσα τιμή («όσο γεμίζει, πέφτει»).

## 8. Αρχιτέκτονες & προμήθειες

- Ο ARCHITECT βλέπει μόνο τους δικούς του πελάτες, παραγγέλνει για λογαριασμό τους στις τιμές του εκάστοτε πελάτη.
- Προμήθεια = ποσοστό (default ανά αρχιτέκτονα, override ανά παραγγελία) επί της αξίας παραγγελίας· υπολογίζεται κατά την **έγκριση**.
- `CommissionEntry` ledger + οθόνη αναφορών. Εκκαθάριση/απόδοση στο S1: οριστικοποιείται στο spec της Φάσης 8.

## 9. Ροή παραγγελιών

`DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → (push SALDOC) → SYNCED_TO_S1`, με `REJECTED` + σχόλια. Εσωτερικοί χρήστες με `order.autoapprove` παρακάμπτουν την έγκριση. Η προμήθεια αρχιτέκτονα και η δέσμευση container οριστικοποιούνται στο APPROVED.

## 10. Μεταφράσεις — DeepSeek

- `lib/translate.ts` — DeepSeek chat API
- pg-boss jobs: μετάφραση EL→EN ανά προϊόν (batch, rate-limited), παραγωγή περιγραφών από χαρακτηριστικά
- Review flow: τίποτα δεν δημοσιεύεται χωρίς ανθρώπινη έγκριση (`NEEDS_REVIEW → APPROVED`)
- Glossary όρων Damask για συνέπεια

## 11. Media — BunnyCDN

- Upload από UI → API route → Bunny Storage Zone (εικόνες, GLB/GLTF) / Bunny Stream (videos) → CDN URL στη `MediaAsset`
- Εικόνες: on-the-fly resize με Bunny Optimizer query params
- 3D: `<model-viewer>` για GLB (orbit/AR)
- Drag & drop reordering, απεριόριστα αρχεία

## 11α. Οριζόντια απαίτηση: Excel import / Excel & Word export — ΠΑΝΤΟΥ

Ισχύει για **κάθε οντότητα** του συστήματος (προϊόντα, μεταφράσεις, πελάτες, επαφές, παραγγελίες, μονάδες μέτρησης, containers, προμήθειες):

**Import (Excel upload με mappings):**
- Κοινός **Import Engine** (SheetJS/ExcelJS) + οδηγός 3 βημάτων: *Upload → Mapping → Preview & Επιβεβαίωση*
- Στο βήμα Mapping ο χρήστης αντιστοιχίζει στήλες του Excel σε πεδία του μοντέλου μας με dropdowns· αυτόματη πρόταση αντιστοίχισης από τα headers
- **Αποθηκευμένα mapping templates** ανά οντότητα (`ImportMapping` πίνακας) — ο χρήστης ξαναχρησιμοποιεί το mapping με ένα κλικ
- Preview με validation (τι θα δημιουργηθεί/ενημερωθεί/απορριφθεί και γιατί) **πριν** την οριστική εγγραφή· μεγάλα αρχεία εκτελούνται ως pg-boss job με progress bar
- Αναφορά αποτελεσμάτων: πόσα OK, πόσα σφάλματα, κατεβάσιμο Excel σφαλμάτων

**Export:**
- Κάθε λίστα/αναφορά έχει κουμπί **«Λήψη Excel»** (με τα τρέχοντα φίλτρα) — κοινό export util
- **Word (docx) & Excel έγγραφα** για **προσφορές** (από παραγγελία/καλάθι: λογότυπο Damask, στοιχεία πελάτη, γραμμές με εικόνες προϊόντων, τιμές, σύνολα) και **αναφορές** (πωλήσεις, προμήθειες αρχιτεκτόνων, πληρότητα containers) — βιβλιοθήκη `docx` + ExcelJS, templates με branding
- Πίνακας `DocumentTemplate` για μελλοντική παραμετροποίηση κειμένων προσφοράς

Ο Import/Export Engine χτίζεται **μία φορά** (Φάση 2, με πρώτο καταναλωτή τα προϊόντα) και κάθε επόμενη οθόνη τον επαναχρησιμοποιεί δηλωτικά (ορισμός πεδίων/validators ανά οντότητα).

**Πρότυπο DataTable (οριζόντιο):** κάθε λίστα δεδομένων χρησιμοποιεί κοινό `<DataTable>` (TanStack Table v8 + shadcn) με: sorting από τα labels των στηλών, column resize, επιλογή εμφανιζόμενων στηλών, page size selector + σελιδοποίηση, expand row με detail panel, dropdown menu ενεργειών (⋮) σε κάθε γραμμή (φιλτραρισμένο με permissions), inline edit με validation, row selection για μαζικές ενέργειες, και αποθήκευση προτιμήσεων πίνακα ανά χρήστη (πίνακας `TableView`). Χτίζεται στη Φάση 2 μαζί με τη λίστα προϊόντων. Πλήρης προδιαγραφή: `design-system/damask-pim/MASTER.md` §4α.

## 11β. Οριζόντια απαίτηση: UX για μη εξοικειωμένους χρήστες

Το σύστημα θα χρησιμοποιείται από ανθρώπους **χωρίς μεγάλη εξοικείωση με υπολογιστές** — κάθε οθόνη σχεδιάζεται με αυτό ως πρώτο κριτήριο:

- **Απλότητα πρώτα:** μία κύρια ενέργεια ανά οθόνη, μεγάλα κουμπιά με σαφείς ελληνικές ετικέτες (όχι jargon, όχι εικονίδια χωρίς κείμενο)
- **Οδηγοί (wizards) αντί για σύνθετες φόρμες** σε κάθε πολύβημη διαδικασία (import, νέα παραγγελία, νέο προϊόν)
- **Καθοδήγηση:** empty states που εξηγούν «τι κάνω εδώ και ποιο είναι το επόμενο βήμα», inline βοήθεια/tooltips, παραδείγματα μέσα στα πεδία
- **Συγχωρητικότητα:** επιβεβαίωση πριν από κάθε καταστροφική ενέργεια, undo όπου γίνεται, autosave σε drafts, καθαρά μηνύματα σφάλματος στα ελληνικά με οδηγία διόρθωσης (ποτέ raw error)
- **Κατάσταση πάντα ορατή:** τι συγχρονίστηκε/εκκρεμεί, progress bars σε κάθε background εργασία, ειδοποιήσεις επιτυχίας
- **Προσβασιμότητα:** μεγάλες περιοχές κλικ, υψηλή αντίθεση, πλήρης λειτουργία με πληκτρολόγιο, responsive έως tablet
- Τα GSAP animations υπηρετούν την κατανόηση (ομαλές μεταβάσεις, προσανατολισμός) — όχι εντυπωσιασμό

## 12. UI

- **Dashboard** — κατάσταση sync, πληρότητα ανοιχτών containers, εκκρεμείς μεταφράσεις/εγκρίσεις, πρόσφατες παραγγελίες
- **Προϊόντα** — λίστα με φίλτρα/αναζήτηση· καρτέλα με tabs: Στοιχεία (+ΜΜ, CBM) / Μεταφράσεις (EL|EN δίπλα-δίπλα) / Media / Ιστορικό sync
- **Κατηγορίες/Ομάδες**, **Μονάδες μέτρησης**, **Πελάτες & Επαφές**, **Παραγγελίες & Εγκρίσεις**, **Containers**, **Αρχιτέκτονες & Προμήθειες**, **Χρήστες & Ρόλοι/Permissions**, **Ρυθμίσεις sync**
- **B2B Portal** (ξεχωριστό layout): κατάλογος, καρτέλα προϊόντος (gallery/video/3D), καλάθι με ζωντανή τιμή container, «οι παραγγελίες μου»· ο ARCHITECT επιπλέον: επιλογή πελάτη, «οι προμήθειές μου»
- Δίγλωσσο UI (next-intl, EL default), branding Damask από το λογότυπο, GSAP transitions
- **Οπτική γλώσσα:** design system «Λινό & Μπρούντζος» (`design-system/damask-pim/MASTER.md`) — Inter παντού (όχι serif σε dashboard/ελληνικά — απόφαση χρήστη), συμπαγής κλίμακα (base 14px, table rows 40px), serif μόνο στο λογότυπο

## 13. Error handling & παρατηρησιμότητα

- Κάθε sync/push → `SyncLog` (οντότητα, ενέργεια, S1 request/response, αποτέλεσμα) — ορατό στο admin UI
- pg-boss retries με exponential backoff· οριστικά failures στο dashboard με κουμπί retry
- Τα S1 pushes είναι idempotent όπου γίνεται (KEY-based) και πάντα verify-after-write

## 14. Δοκιμές

- **Vitest** — S1 client (mocked win1253 responses), mappers, price engine containers (πυρήνας — πλήρης κάλυψη), commission υπολογισμοί
- **Playwright** — smoke tests στα κρίσιμα flows (login, καρτέλα προϊόντος, παραγγελία B2B, έγκριση)

## 15. Φάσεις υλοποίησης

Κάθε φάση: δικό της implementation plan, παραδίδεται λειτουργική.

1. **Θεμέλια** — scaffold, Prisma schema (πλήρες, + ImportMapping/DocumentTemplate), Auth.js + permission-based RBAC, S1 client + live δοκιμή, pg-boss, UI shell/branding + UX kit (empty states, confirmations, progress, toasts)
2. **PIM pull** — sync ειδών/κατηγοριών/ΜΜ/αποθεμάτων/τιμών, οθόνες προϊόντων, CBM πεδία, **Import/Export Engine** (πρώτος καταναλωτής: Excel import προϊόντων + Excel export λίστας)
3. **Μεταφράσεις** — DeepSeek pipeline + review UI
4. **Media** — BunnyCDN uploads, gallery, videos, 3D viewer
5. **Push στο S1** — outbox, επεξεργασία ειδών, νέα είδη, ΜΜ, βοηθητικά objects
6. **Πελάτες, επαφές & εσωτερικές παραγγελίες** — TRDR αμφίδρομο, SALDOC push, ροή εγκρίσεων, import/export πελατών-επαφών-παραγγελιών, **προσφορά σε Word/Excel** από παραγγελία
7. **Containers & δυναμική τιμολόγηση** — οντότητα, price engine, οθόνες, portal ένδειξη, αναφορές πληρότητας (Excel)
8. **B2B Portal + Αρχιτέκτονες** — customer/architect login, τιμές πελάτη, καλάθι, προμήθειες + αναφορές προμηθειών (Excel/Word)

## 16. Ανοιχτά θέματα (οριστικοποίηση στα spec φάσεων)

- Ακριβής φόρμουλα επιμερισμού μεταφορικών + ελάχιστη βάση όγκου (Φάση 7)
- Εκκαθάριση/απόδοση προμηθειών αρχιτεκτόνων στο S1 (Φάση 8)
- Ποια βοηθητικά S1 objects ακριβώς χρειάζονται write-back πέρα από τα γνωστά (Φάση 5 — θα χαρτογραφηθούν με getObjects/getTableFields)
- Αν τα CBM/βάρος τηρούνται ήδη σε πεδία του MTRL ή μόνο στο PIM (Φάση 2)
- Ακριβές περιεχόμενο/διάταξη του Word template προσφοράς — θα οριστεί με δείγμα υπάρχουσας προσφοράς Damask (Φάση 6)
