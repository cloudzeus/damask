-- Ισχύς σε ημέρες από την έκδοση, για έγγραφα που δεν αναγράφουν λήξη (π.χ. Γενικό Πιστοποιητικό ΓΕΜΗ: τρίμηνο).
ALTER TABLE "DocumentType" ADD COLUMN "validityDays" INTEGER;
UPDATE "DocumentType" SET "validityDays" = 90, "expires" = true WHERE "name" = 'Γενικό Πιστοποιητικό Γ.Ε.ΜΗ.';
