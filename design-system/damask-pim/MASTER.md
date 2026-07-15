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
| `--accent` | `#A16207` | Μπρούντζος: ενεργή κατάσταση nav, highlights — σε λευκό 4.6:1 ✓ |
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

## 3. Τυπογραφία

| Ρόλος | Font | Λόγος |
|---|---|---|
| Display/Headings | **Literata** (500/600) | Editorial serif με ΠΛΗΡΗ ελληνικά· η «υφασμάτινη» κομψότητα |
| UI/Body | **Inter** (400/500/600) | Κορυφαία αναγνωσιμότητα στα ελληνικά, tabular numerals |
| Wordmark | Το logo της Damask (SVG στο `public/`) — μέχρι τότε Literata 600 letter-spacing 0.15em |

Κλίμακα: 13 (labels-uppercase) / **16 (base — ποτέ μικρότερο σε body)** / 18 / 22 / 28 / 36. Line-height 1.6 body, 1.2 headings.
Αριθμοί σε πίνακες/τιμές: `font-variant-numeric: tabular-nums`, δεξιά στοίχιση.

Υλοποίηση με `next/font`: `Inter({ subsets: ['latin','greek'] })`, `Literata({ subsets: ['latin','greek'] })` — μηδέν FOIT/CLS.

## 4. Χώρος, σχήμα, βάθος

- Spacing: κλίμακα 4px — sections 24/32/48. Γενναιόδωρα, όχι στριμωγμένα (αρχάριοι χρήστες = αραιό layout)
- Radius: `--radius: 0.625rem` (10px) — μαλακό, «επιπλάδικο»· pills για badges
- Σκιές: 2 επίπεδα μόνο — `shadow-sm` κάρτες, `shadow-lg` modals. Ζεστές (`rgb(41 37 36 / 8%)`), ποτέ βαριές
- Container: `max-w-7xl`. Πίνακες: γραμμές ύψους ≥52px, ΟΧΙ zebra — διαχωρισμός με ζεστό border
- Κάθε interactive στοιχείο: **min 44×44px**, `cursor-pointer`, ορατό focus ring (μπρούντζος)

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
