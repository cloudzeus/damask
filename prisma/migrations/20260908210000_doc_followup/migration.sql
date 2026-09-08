-- Υπενθύμιση επανεπικοινωνίας δικαιολογητικών ανά αίτηση (πρόγραμμα × πελάτη).
ALTER TABLE "ProgramApplication" ADD COLUMN "docFollowupDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "ProgramApplication" ADD COLUMN "docFollowupLastAt" TIMESTAMP(3);
