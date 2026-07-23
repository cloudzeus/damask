import { prisma } from '@/lib/prisma'
import { hashToken } from '@/lib/pm/portal-token'

/**
 * Public (NO permission gate — token-only, same trust model as
 * src/lib/pm/portal-public.ts). Backs the public /go/[token] click route:
 * a Trdr clicking their personalized newsletter link records «εκδήλωση
 * ενδιαφέροντος» (opportunity) on the matching ProgramLead. Idempotent —
 * a repeat click does NOT rewrite clickedAt or re-run the update.
 *
 * No data beyond the program title is ever returned — see
 * docs/superpowers/specs/2026-07-23-prospects-w3-design.md §4 ("Κανένα
 * άλλο data leak").
 */
export type RecordLeadClickResult = { ok: true; programTitle: string } | { ok: false }

export async function recordLeadClick(raw: string): Promise<RecordLeadClickResult> {
  const lead = await prisma.programLead.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { program: { select: { title: true } } },
  })
  if (!lead) return { ok: false }

  if (lead.status !== 'CLICKED') {
    await prisma.programLead.update({
      where: { id: lead.id },
      data: { status: 'CLICKED', clickedAt: new Date() },
    })
  }

  return { ok: true, programTitle: lead.program.title }
}
