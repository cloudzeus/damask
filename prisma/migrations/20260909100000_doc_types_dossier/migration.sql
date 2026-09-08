-- Ελαφρύς κατάλογος τύπων δικαιολογητικών + αποθήκη δικαιολογητικών ανά πελάτη.
CREATE TABLE "DocumentType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "expires" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentType_name_key" ON "DocumentType"("name");

CREATE TABLE "TrdrDossierDocument" (
  "id" TEXT NOT NULL,
  "trdrId" TEXT NOT NULL,
  "documentTypeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrdrDossierDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrdrDossierDocument_trdrId_idx" ON "TrdrDossierDocument"("trdrId");
CREATE INDEX "TrdrDossierDocument_documentTypeId_idx" ON "TrdrDossierDocument"("documentTypeId");
ALTER TABLE "TrdrDossierDocument" ADD CONSTRAINT "TrdrDossierDocument_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrdrDossierDocument" ADD CONSTRAINT "TrdrDossierDocument_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
