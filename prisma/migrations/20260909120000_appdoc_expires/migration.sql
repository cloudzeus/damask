-- Ημ. λήξης δικαιολογητικού στα έγγραφα εκκρεμότητας (για λήξη-reopen).
ALTER TABLE "ApplicationDocument" ADD COLUMN "expiresAt" TIMESTAMP(3);
