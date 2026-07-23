-- C2g absorption: convert existing ProgramExpenseCertification file keys
-- (photoKey / bankStatementKey / newUnusedCertKey) into ExpenseDeliverable
-- + DeliverableFile rows so no uploaded file is lost.
--
-- Mapping:
--   photoKey         -> FULL_CERTIFICATION  "Φωτογραφία φυσικού αντικειμένου"
--   bankStatementKey -> FINAL_PAYMENT       "Εξτρέ τράπεζας"
--   newUnusedCertKey -> FULL_CERTIFICATION  "Βεβαίωση καινούργιου & αμεταχείριστου"
--
-- Idempotent: guarded by NOT EXISTS on DeliverableFile.storageKey, so
-- reapplying (or a partial prior run) never creates duplicates. Correlation
-- between the ExpenseDeliverable insert and the DeliverableFile insert is
-- via (expenseId, phase, name, templateId IS NULL), which is unique per
-- expense because ProgramExpenseCertification.expenseId is itself unique.

-- === photoKey -> FULL_CERTIFICATION ===

INSERT INTO "ExpenseDeliverable" (id, "applicationId", "expenseId", "templateId", phase, name, mandatory, "onSiteVerification", status, "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."applicationId", c."expenseId", NULL, 'FULL_CERTIFICATION', 'Φωτογραφία φυσικού αντικειμένου', true, false, 'UPLOADED', 0, now(), now()
FROM "ProgramExpenseCertification" c
JOIN "ProgramExpense" e ON e.id = c."expenseId"
WHERE c."photoKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DeliverableFile" f WHERE f."storageKey" = c."photoKey"
  );

INSERT INTO "DeliverableFile" (id, "deliverableId", name, "storageKey", "uploadedAt")
SELECT gen_random_uuid()::text, ed.id, 'Φωτογραφία φυσικού αντικειμένου', c."photoKey", now()
FROM "ProgramExpenseCertification" c
JOIN "ExpenseDeliverable" ed
  ON ed."expenseId" = c."expenseId"
 AND ed.phase = 'FULL_CERTIFICATION'
 AND ed.name = 'Φωτογραφία φυσικού αντικειμένου'
 AND ed."templateId" IS NULL
WHERE c."photoKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DeliverableFile" f WHERE f."storageKey" = c."photoKey"
  );

-- === bankStatementKey -> FINAL_PAYMENT ===

INSERT INTO "ExpenseDeliverable" (id, "applicationId", "expenseId", "templateId", phase, name, mandatory, "onSiteVerification", status, "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."applicationId", c."expenseId", NULL, 'FINAL_PAYMENT', 'Εξτρέ τράπεζας', true, false, 'UPLOADED', 0, now(), now()
FROM "ProgramExpenseCertification" c
JOIN "ProgramExpense" e ON e.id = c."expenseId"
WHERE c."bankStatementKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DeliverableFile" f WHERE f."storageKey" = c."bankStatementKey"
  );

INSERT INTO "DeliverableFile" (id, "deliverableId", name, "storageKey", "uploadedAt")
SELECT gen_random_uuid()::text, ed.id, 'Εξτρέ τράπεζας', c."bankStatementKey", now()
FROM "ProgramExpenseCertification" c
JOIN "ExpenseDeliverable" ed
  ON ed."expenseId" = c."expenseId"
 AND ed.phase = 'FINAL_PAYMENT'
 AND ed.name = 'Εξτρέ τράπεζας'
 AND ed."templateId" IS NULL
WHERE c."bankStatementKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DeliverableFile" f WHERE f."storageKey" = c."bankStatementKey"
  );

-- === newUnusedCertKey -> FULL_CERTIFICATION ===

INSERT INTO "ExpenseDeliverable" (id, "applicationId", "expenseId", "templateId", phase, name, mandatory, "onSiteVerification", status, "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."applicationId", c."expenseId", NULL, 'FULL_CERTIFICATION', 'Βεβαίωση καινούργιου & αμεταχείριστου', true, false, 'UPLOADED', 0, now(), now()
FROM "ProgramExpenseCertification" c
JOIN "ProgramExpense" e ON e.id = c."expenseId"
WHERE c."newUnusedCertKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DeliverableFile" f WHERE f."storageKey" = c."newUnusedCertKey"
  );

INSERT INTO "DeliverableFile" (id, "deliverableId", name, "storageKey", "uploadedAt")
SELECT gen_random_uuid()::text, ed.id, 'Βεβαίωση καινούργιου & αμεταχείριστου', c."newUnusedCertKey", now()
FROM "ProgramExpenseCertification" c
JOIN "ExpenseDeliverable" ed
  ON ed."expenseId" = c."expenseId"
 AND ed.phase = 'FULL_CERTIFICATION'
 AND ed.name = 'Βεβαίωση καινούργιου & αμεταχείριστου'
 AND ed."templateId" IS NULL
WHERE c."newUnusedCertKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DeliverableFile" f WHERE f."storageKey" = c."newUnusedCertKey"
  );
