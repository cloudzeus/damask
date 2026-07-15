# DAMASK PIM — Design System (MASTER)

> **LOGIC:** Όταν χτίζεις συγκεκριμένη σελίδα, έλεγξε πρώτα `design-system/damask-pim/pages/[page].md`.
> Αν υπάρχει, υπερισχύει του Master. Αλλιώς ισχύει αυστηρά το παρακάτω.
>
> Concept: **«Ατελιέ»** — ζεστό, ήρεμο, editorial-luxury περιβάλλον εργασίας (υφάσματα/έπιπλα),
> σχεδιασμένο για χρήστες **χωρίς εξοικείωση** με υπολογιστές: μεγάλα στοιχεία, καθαρή ιεραρχία, μηδενικό jargon.
> (Επιμελημένο χειροκίνητα — αντικαθιστά το αυτόματο draft του generator.)

## 1. Προσωπικότητα

| Άξονας | Επιλογή |
|---|---|
| Αίσθηση | Λινό, μελάνι, μπρούντζος — ζεστή πολυτέλεια, όχι ψυχρό tech |
| Ύφος | Exaggerated-minimal: λίγα, μεγάλα, σίγουρα στοιχεία· γενναιόδωρο κενό |
| Ιεραρχία | ΜΙΑ κύρια ενέργεια ανά οθόνη, πάντα στο ίδιο σημείο (πάνω-δεξιά) |
| Γλώσσα UI | Ελληνικά παντού, ρήματα ενεργείας («Αποθήκευση αλλαγών», όχι «Submit») |

## 2. Χρώματα — «Λινό & Μπρούντζος»

Semantic tokens (shadcn/Tailwind 4 CSS variables). Ποτέ raw hex σε components.

### Light (default)
| Token | Hex | Χρήση |
|---|---|---|
| `--background` | `#FAF7F2` | Φόντο εφαρμογής (ζεστό λινό) |
| `--card` | `#FFFFFF` | Κάρτες/επιφάνειες |
| `--foreground` | `#292524` | Κείμενο (ζεστό κάρβουνο — stone-800) |
| `--muted` | `#F1EDE6` | Δευτερεύουσες επιφάνειες |
| `--muted-foreground` | `#78716C` | Δευτερεύον κείμενο (μόνο ≥14px) |
| `--border` | `#E7E0D8` | Περιγράμματα (ζεστό) |
| `--primary` | `#292524` | Κύρια κουμπιά (μελάνι) — text `#FFFFFF` |
| `--accent` | `#F1EDE6` | Hover/focus επιφάνειες menu items (shadcn semantics — ΟΧΙ brass εδώ) |
| `--brass` | `#A16207` | Μπρούντζος: ενεργή κατάσταση nav, avatar, highlights — σε λευκό 4.6:1 ✓ (dark: `#C89B3C`) |
| `--destructive` | `#B91C1C` | Καταστροφικές ενέργειες — text λευκό |
| `--success` | `#15803D` | Επιτυχία (πάντα με εικονίδιο+κείμενο) |
| `--warning` | `#B45309` | Προειδοποίηση/εκκρεμότητα |
| `--info` | `#0369A1` | Πληροφοριακά (sync σε εξέλιξη κ.λπ.) |
| `--sidebar` | `#F4EFE7` | Sidebar (ελαφρώς βαθύτερο λινό) |
| `--ring` | `#A16207` | Focus ring 2px + offset 2px |

### Dark
Ζεστό σκοτάδι — όχι μπλε-μαύρο: `--background #0C0A09`, `--card #1C1917`, `--foreground #E7E5E4`,
`--border #292524`, `--accent #C89B3C` (μπρούντζος φωτεινότερος για 4.5:1), `--primary #E7E5E4` με text `#1C1917`.
Το dark mode σχεδιάζεται μαζί με το light — έλεγχος αντίθεσης ξεχωριστά.

**Κανόνες:** Το χρώμα ΠΟΤΕ μόνο του δεν μεταφέρει νόημα (πάντα εικονίδιο+λέξη στα status). Red/green ποτέ ως μοναδικό ζεύγος διάκρισης.

## 3. Τυπογραφία (αναθ. — sans παντού, συμπαγής κλίμακα)

> Απόφαση χρήστη 2026-07-15: **όχι serif σε dashboard UI** (τα ελληνικά serif κουράζουν σε πυκνά δεδομένα)
> και **συμπαγή μεγέθη** — εργαλείο δουλειάς, όχι brochure.

| Ρόλος | Font | Λόγος |
|---|---|---|
| Όλα (headings + UI + body) | **Inter** (400/500/600) | Κορυφαία αναγνωσιμότητα ελληνικών σε οθόνη, tabular numerals |
| Wordmark ΜΟΝΟ | Το logo της Damask (SVG στο `public/`) — το serif ζει μόνο στο λογότυπο |

Κλίμακα (συμπαγής): **12** labels-uppercase / **13** table cells & δευτερεύον / **14 base UI** / **16** section titles (600) / **20** page titles (600, tracking -0.01em) / **26** μεγάλα νούμερα stats. Ενδιάμεσα μισά βήματα (11.5/12.5/13.5) επιτρέπονται για nav/captions. Line-height 1.5 body, 1.25 headings.
Υλοποίηση: `html { font-size: 14px }` — όλη η rem κλίμακα του Tailwind γίνεται αναλογικά συμπαγής.

> **Επικυρωμένες αποφάσεις (2026-07-15):** (α) το shadcn `--accent` μένει ουδέτερο για hovers· ο μπρούντζος εφαρμόζεται μέσω `--brass`/`--ring`/`--sidebar-primary`. (β) Τα shadcn components του project είναι **@base-ui/react** (όχι Radix): χρήση `render=` αντί `asChild`, και τα `DropdownMenuLabel` απαιτούν `DropdownMenuGroup` wrapper — δες `src/components/shell/topbar.tsx` ως αναφορά.
Αριθμοί σε πίνακες/τιμές: `font-variant-numeric: tabular-nums`, δεξιά στοίχιση.

Υλοποίηση με `next/font`: `Inter({ subsets: ['latin','greek'] })` — μηδέν FOIT/CLS.

## 4. Χώρος, σχήμα, βάθος (αναθ. — συμπαγής πυκνότητα)

- Spacing: κλίμακα 4px — sections 16/24/32. Συμπαγές αλλά καθαρό: η καθοδήγηση για αρχάριους έρχεται από σαφήνεια/ιεραρχία, όχι από αραίωμα
- Radius: `--radius: 0.5rem` (8px)· pills για badges
- Σκιές: 2 επίπεδα μόνο — `shadow-sm` κάρτες, `shadow-lg` modals. Ζεστές (`rgb(41 37 36 / 8%)`), ποτέ βαριές
- Container: πλήρες πλάτος για data οθόνες (`max-w-none` με padding 20px), `max-w-7xl` μόνο σε forms/dashboards
- Πίνακες: γραμμές ύψους **40px** (compact), ΟΧΙ zebra — διαχωρισμός με ζεστό border, sticky header
- Κουμπιά/inputs: ύψος **36px** (sm) / 40px (default)· hit area κάθε interactive στοιχείου ≥36px, `cursor-pointer`, ορατό focus ring (μπρούντζος)

## 4α. Πρότυπο DataTable (ΔΕΣΜΕΥΤΙΚΟ — σε ΚΑΘΕ λίστα δεδομένων)

Engine: **TanStack Table v8** + shadcn styling. Κοινό component `<DataTable>` που παρέχει δηλωτικά:

| Feature | Συμπεριφορά |
|---|---|
| **Sorting** | Κλικ στο label της στήλης → asc/desc/none με βέλος· multi-sort με Shift |
| **Column resize** | Drag handle στο όριο κάθε header (min-width ανά στήλη) |
| **Επιλογή στηλών** | Κουμπί «Στήλες ▾» → checkbox list εμφάνισης/απόκρυψης |
| **Αριθμός εγγραφών** | Selector «Εγγραφές: 25/50/100» + footer «1–50 από 12.480» με σελιδοποίηση |
| **Expand row** | Chevron στην 1η στήλη → detail panel κάτω από τη γραμμή (προεπισκόπηση/σχετικά στοιχεία) |
| **Row actions** | Κουμπί ⋮ στο τέλος ΚΑΘΕ γραμμής → dropdown (Προβολή, Επεξεργασία, Sync, Διαγραφή…) — τα διαθέσιμα actions φιλτράρονται με permissions |
| **Inline edit** | Διπλό κλικ (ή μολύβι) σε επεξεργάσιμο κελί → input στη θέση του, Enter=αποθήκευση, Esc=άκυρο, validation on blur |
| **Αποθήκευση κατάστασης** | Στήλες/πλάτη/ταξινόμηση/page size αποθηκεύονται ανά χρήστη+πίνακα (DB `TableView`) |
| **Global** | Αναζήτηση, φίλτρα-chips, «Λήψη Excel» (με τρέχοντα φίλτρα), row selection με checkboxes για μαζικές ενέργειες |

Χτίζεται ΜΙΑ φορά (Φάση 2, πρώτος καταναλωτής: Προϊόντα) — κάθε οθόνη μετά δίνει μόνο columns config.

**🔒 Κανονικό οπτικό πρότυπο (εγκεκριμένο από τον χρήστη 2026-07-15):** το DataTable της οθόνης «Προϊόντα» στο [`mockup-v2.html`](mockup-v2.html) (ίδιο με το artifact «DAMASK PIM — Mockup v2»). Ο χρήστης το ενέκρινε ρητά ως «πολύ κοντά σε αυτό που θέλουμε» — κάθε υλοποίηση DataTable αντιγράφει ΑΥΤΟ το layout: toolbar (αναζήτηση αριστερά, φίλτρα-chips, «Στήλες ▾» δεξιά), header row με sort βέλη + resize handles, στήλη expander + checkbox πρώτα, ⋮ actions τελευταία, expanded detail panel σε muted φόντο με grid ετικετών, inline edit με μπρούντζινο περίγραμμα + «Enter ✓ · Esc ✕» hint, footer με «N επιλεγμένα · Μαζικές ενέργειες», «Εγγραφές: 50 ▾», «1–50 από Χ» και αριθμημένο pager. Άνοιξε το αρχείο στον browser πριν χτίσεις οποιοδήποτε table.

## 4β. Aesthetic v2 «Atelier Glass» (εγκρίθηκε κατεύθυνση 2026-07-15 — references χρήστη)

Ο χρήστης έδωσε references (Synthex glassmorphic analytics, Lisso warm dashboard) με εντολή: «να δίνει την εντύπωση ακριβής, καλοσχεδιασμένης εφαρμογής — όχι φοιτητικής εργασίας». Η ταυτότητα (λινό/μελάνι/μπρούντζος, Inter, compact data) ΔΕΝ αλλάζει — αλλάζει το **treatment**:

1. **Ambient gradient καμβάς** αντί για flat φόντο: `linear-gradient(165deg, #F6F1E9 0%, #FAF7F2 45%, #EFE9DE 100%)` + πολύ διακριτικό brass glow (radial, 4-6% opacity) σε μία γωνία. Dark: `#0E0C0A → #171310` με brass glow 8%.
2. **Frosted-glass κάρτες** (tier «glass»): `background: rgb(255 255 255 / 62%)`, `backdrop-filter: blur(20px)`, `border: 1px solid rgb(255 255 255 / 65%)`, radius **16px**, σκιά `0 8px 32px rgb(41 37 36 / 8%)`. Dark: `rgb(28 25 23 / 55%)`, border `rgb(255 255 255 / 8%)`.
3. **Τρία επίπεδα βάθους:** καμβάς → glass κάρτες → αναδυόμενα στοιχεία (popovers/callouts, blur 24px, σκιά βαθύτερη). Επιτρέπεται ελαφρύ layering/επικάλυψη διακοσμητικών «paper» καρτών σε hero/κενές καταστάσεις.
4. **KPI νούμερα:** Inter **200-300 weight**, 32-40px, tabular — μεγάλα και «ανάλαφρα» (βλ. 40.439,00 στα refs). Ετικέτα 12px muted από πάνω.
5. **Pills παντού** στα φίλτρα/chips/κουμπιά δευτερεύοντα (radius 999). Primary κουμπιά μένουν 8-10px radius (σοβαρότητα).
6. **Floating callouts:** μικρές glass κάρτες-badges (π.χ. «+24% αυτή την εβδομάδα») αγκυρωμένες πάνω σε γραφήματα.
7. **Πού εφαρμόζεται πλήρως:** δημόσιο site, auth οθόνες, dashboard, portal. **Πού συγκρατημένα:** data-πυκνές οθόνες (πίνακες) κρατούν το compact πρότυπο §4α — glass μόνο στο περίβλημα της κάρτας του πίνακα, ποτέ blur πίσω από κείμενο δεδομένων.
8. Προσβασιμότητα: κείμενο πάντα σε ≥4.5:1 πάνω στο glass (το blur δεν δικαιολογεί χαμηλή αντίθεση)· `backdrop-filter` με graceful fallback σε συμπαγές `--card`.

## 4γ. Αρχιτεκτονική πλοήγησης (απόφαση χρήστη 2026-07-15)

- **`/` = δημόσιο website** της Damask (marketing) — χωρίς auth. Πάνω δεξιά «Σύνδεση».
- `/login` → redirect βάσει ρόλου: ADMIN/PURCHASING/PRODUCT_MANAGER/SALES → `/dashboard` (εσωτερικό), ARCHITECT/CUSTOMER → `/portal` (B2B).
- Auth οθόνες: login, **lost password**, **register** (αίτημα πρόσβασης με έγκριση από admin) — όλες στο Atelier Glass treatment.
- Σελίδες διαχείρισης: **Users management** + **Roles & access management** (permissions matrix ανά ρόλο).

## 5. Κίνηση (GSAP) — διακριτική, με νόημα

| Πρότυπο | Spec |
|---|---|
| Page transition | fade + 8px slide-up, 250ms, `power2.out` — ποτέ block του input |
| Λίστες/cards | stagger 30ms/στοιχείο, μόνο opacity+transform |
| Feedback (save ok) | checkmark scale 0.95→1, 200ms |
| Progress (sync/import) | πραγματικό progress bar — ποτέ αόριστο spinner >1s (skeleton) |
| Exit | 60-70% της διάρκειας εισόδου |

`prefers-reduced-motion` → όλα instant. Κίνηση = προσανατολισμός/αιτιότητα, ποτέ διακόσμηση.

## 6. Πρότυπα για μη εξοικειωμένους χρήστες (ΔΕΣΜΕΥΤΙΚΑ)

1. **Μία κύρια ενέργεια/οθόνη** — γεμάτο primary κουμπί πάνω-δεξιά, με κείμενο (ποτέ σκέτο εικονίδιο)
2. **Wizards** για κάθε ροή >1 βήματος: αριθμημένα βήματα, «Πίσω» πάντα διαθέσιμο, progress ορατό, autosave draft
3. **Empty states** με 1 πρόταση εξήγηση + 1 κουμπί επόμενης ενέργειας
4. **Επιβεβαίωση** πριν από κάθε καταστροφική ενέργεια (AlertDialog με σαφή συνέπεια) + Undo toast όπου γίνεται
5. **Σφάλματα**: ελληνικά, αιτία + διόρθωση («Το ΑΦΜ πρέπει να έχει 9 ψηφία»), κάτω από το πεδίο, focus στο πρώτο λάθος. Validation on blur — όχι σε κάθε πλήκτρο
6. **Status badges**: εικονίδιο + λέξη + χρώμα (✓ Δημοσιευμένο / ⟳ Συγχρονίζεται / ⚠ Εκκρεμεί μετάφραση)
7. **Labels πάντα ορατά** πάνω από τα πεδία (ποτέ placeholder-μόνο), helper text όπου χρειάζεται σκέψη
8. **Πίνακες**: αναζήτηση + φίλτρα ως ορατά chips, «Λήψη Excel» δεξιά από τα φίλτρα, ταξινόμηση με βέλος, pagination με αριθμούς
9. Breadcrumbs σε βάθος ≥2, τρέχουσα θέση highlighted στο sidebar (μπρούντζινη ράβδος αριστερά)
10. Τίποτα δεν «χάνεται»: κάθε background εργασία (import, sync, μετάφραση) φαίνεται σε κέντρο ειδοποιήσεων στο topbar με progress

## 7. Εικονίδια & εικόνες

- **Lucide** αποκλειστικά, stroke 1.75, μεγέθη tokens: 16/20/24. Ποτέ emoji ως εικονίδιο, ποτέ εικονίδιο χωρίς label σε κύρια ενέργεια
- Εικόνες προϊόντων: aspect-ratio 1:1, `object-cover`, radius 10px, πάντα `width/height` δηλωμένα (CLS=0), lazy εκτός fold, Bunny Optimizer resize

## 8. Anti-patterns (απαγορεύονται)

Γκρι-σε-γκρι κείμενο <4.5:1 · placeholder ως label · icon-only κουμπιά σε primary ροές · spinner χωρίς εκτίμηση χρόνου · modal για πλοήγηση · >2 βάρη σκιάς · ψυχρό μπλε-γκρι φόντο · zebra tables · animation >400ms · αγγλικά strings στο UI · raw error/stack trace στον χρήστη
