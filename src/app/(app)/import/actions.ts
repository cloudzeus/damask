'use server'

import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { getBoss } from '@/lib/queue'
import { QUEUE_IMPORT } from '@/server/queue-start'
import {
  validateProductChunk,
  runProductImport,
  emptyTotals,
  IMPORT_CHUNK_SIZE,
  SYNC_EXECUTE_THRESHOLD,
  type RawImportRow,
  type ImportTotals,
  type ValidateChunkResult,
} from '@/lib/import/product-upsert'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

// ─── Βήμα 4 — Έλεγχος (dry-run, ανά chunk ≤1000 γραμμές) ──────────────────────

export async function validateImportChunk(rows: RawImportRow[]): Promise<ValidateChunkResult> {
  await requirePermission('import.run')
  if (rows.length === 0) return { toCreate: 0, toUpdate: 0, errors: [] }
  if (rows.length > IMPORT_CHUNK_SIZE) {
    throw new Error(`Το chunk δεν μπορεί να ξεπερνά τις ${IMPORT_CHUNK_SIZE} γραμμές.`)
  }
  return validateProductChunk(rows)
}

// ─── Βήμα 5 — Εκτέλεση (sync ≤500 γραμμές, αλλιώς pg-boss job) ────────────────

export type ExecuteImportResult =
  | { ok: true; sync: true; jobId: string; totals: ImportTotals }
  | { ok: true; sync: false; jobId: string }
  | { ok: false; message: string }

export async function executeImport(rows: RawImportRow[]): Promise<ExecuteImportResult> {
  const session = await requirePermission('import.run')
  if (rows.length === 0) return { ok: false, message: 'Δεν υπάρχουν γραμμές προς εισαγωγή.' }

  if (rows.length <= SYNC_EXECUTE_THRESHOLD) {
    const job = await prisma.importJob.create({
      data: {
        entity: 'product',
        status: 'RUNNING',
        createdById: session.user.id,
        totals: emptyTotals(rows.length) as unknown as Prisma.InputJsonValue,
      },
    })
    const totals = await runProductImport(rows)
    const status = totals.failed > 0 && totals.created + totals.updated === 0 ? 'FAILED' : 'DONE'
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status, totals: totals as unknown as Prisma.InputJsonValue },
    })
    revalidatePath('/import')
    return { ok: true, sync: true, jobId: job.id, totals }
  }

  const job = await prisma.importJob.create({
    data: {
      entity: 'product',
      status: 'PENDING',
      createdById: session.user.id,
      totals: emptyTotals(rows.length) as unknown as Prisma.InputJsonValue,
    },
  })
  const boss = getBoss()
  await boss.send(QUEUE_IMPORT, { jobId: job.id, rows })
  return { ok: true, sync: false, jobId: job.id }
}

// ─── ImportMapping templates (spec §11α — "αποθηκευμένα mapping templates") ──

const saveMappingSchema = z.object({
  name: z.string().trim().min(1, 'Δώσε ένα όνομα στο mapping.').max(100, 'Πολύ μεγάλο όνομα.'),
  columnMap: z.record(z.string(), z.string()),
})

export async function saveImportMapping(input: { name: string; columnMap: Record<string, string> }): Promise<ActionResult> {
  await requirePermission('import.run')
  const parsed = saveMappingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα δεδομένα mapping.' }
  }

  await prisma.importMapping.upsert({
    where: { entity_name: { entity: 'product', name: parsed.data.name } },
    create: { entity: 'product', name: parsed.data.name, columnMap: parsed.data.columnMap },
    update: { columnMap: parsed.data.columnMap },
  })

  revalidatePath('/import')
  return { ok: true, message: `Το mapping «${parsed.data.name}» αποθηκεύτηκε.` }
}
