import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { renderAssessmentPdf } from '@/lib/assessment/pdf'
import type { AssessmentResult } from '@/lib/assessment/agent'
import type { CompanyProfile } from '@/lib/assessment/company-profile'

export const runtime = 'nodejs'

/** PDF αναφορά αξιολόγησης ένταξης (WWA). ?download=1 → αποθήκευση αντί για προβολή. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requirePermission('customer.view') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  const { id } = await params
  const a = await prisma.eligibilityAssessment.findUnique({
    where: { id },
    include: { program: { select: { title: true, referenceCode: true, submissionEnd: true } } },
  })
  if (!a || a.status !== 'DONE' || !a.result) return NextResponse.json({ error: 'Η αξιολόγηση δεν είναι έτοιμη.' }, { status: 404 })
  const snap = (a.inputSnapshot ?? {}) as { profile?: CompanyProfile }
  if (!snap.profile) return NextResponse.json({ error: 'Λείπει το στιγμιότυπο της επιχείρησης.' }, { status: 404 })

  const pdf = await renderAssessmentPdf({
    createdAt: a.createdAt,
    programTitle: a.program.title,
    programRef: a.program.referenceCode,
    submissionEnd: a.program.submissionEnd,
    usedGuidePdf: a.usedGuidePdf,
    model: a.model,
    profile: snap.profile,
    result: a.result as unknown as AssessmentResult,
  })
  const safe = snap.profile.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60)
  const fileName = `Αξιολόγηση-ένταξης-${safe}.pdf`
  const download = new URL(request.url).searchParams.get('download') === '1'
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="assessment.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
