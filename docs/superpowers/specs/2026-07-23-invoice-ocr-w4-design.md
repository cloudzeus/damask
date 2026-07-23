# W4 — Διπλά OCR Workflows Τιμολογίων — Design + Plan

**Date:** 2026-07-23 · Approved (user). Υπάρχουσα υποδομή: `src/lib/ocr/*` (extract/schema/validate/invoice-math/customer-actions με ΑΦΜ), `createExpense` (C3, vendorAfm), `src/lib/softone.ts` (S1 client, session-scoped setData), Trdr (TRDR null = μη-συγχρονισμένο, SODTYPE 12 προμηθευτής/13 πελάτης), W2 aade lookup για στοιχεία από ΑΦΜ.

## Workflow Α — ΕΤΑΙΡΙΑ (λογιστική παρακολούθηση ΕΛΠ)
`processCompanyInvoice(scan)` server flow: (1) OCR extract → ΑΦΜ αντισυμβαλλόμενου· (2) **lookup Trdr by AFM** (σωστό SODTYPE από το είδος παραστατικού — αγορά→12, πώληση→13)· αν δεν υπάρχει → create Trdr (στοιχεία από OCR + προαιρετικό ΑΑΔΕ enrich μέσω W2 aadeLookup) **+ push στο SoftOne αν ενεργή σύνδεση** (softone.ts setData CUSTOMER/SUPPLIER → αποθήκευση TRDR id· αν όχι σύνδεση/αποτυχία → TRDR null, non-fatal)· (3) **έλεγχος γραμμών**: ανά γραμμή match σε υπάρχον Product (κατά κωδικό/ονομασία — reuse name-similarity)· όσα λείπουν → create Product στη βάση μας **+ S1 setData ITEM αν σύνδεση** (non-fatal)· (4) επιστρέφει σύνοψη {trdr created/matched, lines matched/created, s1 pushed/failed}. UI: στο υπάρχον OCR flow, επιλογή workflow «Εταιρία» → preview βημάτων → εκτέλεση → report.

## Workflow Β — ΕΥΡΩΠΑΪΚΟ ΠΡΟΓΡΑΜΜΑ
`processProgramInvoice(scan, applicationId)`: (1) OCR extract· (2) προμηθευτής → Trdr (SODTYPE 12) πλήρης (create αν λείπει, ΑΑΔΕ enrich optional) — ΧΩΡΙΣ S1 push (καθαρά δικό μας μητρώο)· (3) τιμολόγιο → **`createExpense` στο συγκεκριμένο application** (description/amount/vat/date/vendor/vendorAfm/docNumber από OCR) + auto-suggest κατηγορίας (C3 υπάρχον)· (4) **ΚΑΝΕΝΑ Product** δεν δημιουργείται. UI: στο tab «Δαπάνες & Πλάνο» του έργου, κουμπί «Καταχώριση από OCR» → upload → preview (προμηθευτής+ποσά+πρόταση) → επιβεβαίωση → δαπάνη.

## Plan
- **T1**: `src/lib/invoice-flows/company.ts` + `program.ts` (server orchestrations πάνω στα υπάρχοντα — pure prep helpers `src/lib/invoice-flows/prep.ts` για matching/decisions, TDD) + actions gated (εταιρία: υπάρχον OCR permission — βρες το· πρόγραμμα: `requireVisibleApplication`). S1 push non-fatal via `softone.ts` ΜΟΝΟ αν `getIntegration('softone')` ενεργή (έλεγχος διαθέσιμος — δες s1-sync). TDD: prep pure + flows με hoisted mocks (lookup-or-create, non-fatal S1, no-products στο Β).
- **T2**: UI entries (OCR σελίδα: workflow picker + report· expenses-tab έργου: «Καταχώριση από OCR» dialog με preview/confirm). tsc/build/tests.
- **T3**: review (S1 push non-fatal + μόνο με σύνδεση, SODTYPE σωστό, Β ποτέ products, gates, ΑΦΜ validation) → fix → merge.
