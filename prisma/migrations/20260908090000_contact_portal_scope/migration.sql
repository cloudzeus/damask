-- Contact portal scope: central (όλα τα προγράμματα) vs per-program
ALTER TABLE "Contact" ADD COLUMN "portalAllPrograms" BOOLEAN NOT NULL DEFAULT false;
