import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { ProgramEditor, type ProgramData } from '@/components/programs/program-editor'

/**
 * Detail/editor οθόνη ενός Προγράμματος (Task 14): μετά την αρχική AI
 * αποδελτίωση (Task 10 — extractProgram), εδώ ο χρήστης βλέπει/διορθώνει
 * τα core scalar πεδία (updateProgramMeta) και ανασκοπεί τις εξαγμένες
 * δομημένες λίστες (κατηγορίες δαπανών, παραδοτέα, φάσεις, ΚΑΔ, bonuses,
 * κριτήρια, προθεσμίες, περιφέρειες, νομικές μορφές) — read-only v1, η
 * αποδελτίωση τις γεμίζει· per-row editing είναι follow-up εργασία.
 *
 * `kadRule` (ALL_EXCEPT_LISTED/ONLY_LISTED/MIXED/UNSPECIFIED) δεν έχει δικό
 * του column στο Program (βλ. prisma/schema.prisma) — παραμένει μόνο μέσα
 * στο αποθηκευμένο `extractedData` JSON blob (η πλήρης απάντηση της AI
 * εξαγωγής, βλ. src/lib/programs/actions.ts#extractProgram). Το διαβάζουμε
 * από εκεί, ανεκτικά, μόνο για προβολή.
 */
export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('programs.manage')
  const { id } = await params

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      expenseCats: { orderBy: { order: 'asc' } },
      deliverables: { orderBy: { order: 'asc' } },
      phases: { orderBy: { order: 'asc' } },
      kads: true,
      bonuses: { orderBy: { order: 'asc' } },
      criteria: { orderBy: { order: 'asc' } },
      deadlines: { orderBy: { order: 'asc' } },
      regions: true,
      legalForms: true,
    },
  })
  if (!program) notFound()

  const kadRule = extractKadRule(program.extractedData)

  const data: ProgramData = {
    id: program.id,
    title: program.title,
    summary: program.summary,
    referenceCode: program.referenceCode,
    totalBudget: program.totalBudget != null ? Number(program.totalBudget) : null,
    fundingRate: program.fundingRate != null ? Number(program.fundingRate) : null,
    durationMonths: program.durationMonths,
    publicationDate: program.publicationDate ? program.publicationDate.toISOString() : null,
    submissionStart: program.submissionStart ? program.submissionStart.toISOString() : null,
    submissionEnd: program.submissionEnd ? program.submissionEnd.toISOString() : null,
    minEmployeesFte: program.minEmployeesFte != null ? Number(program.minEmployeesFte) : null,
    minOperationalYears: program.minOperationalYears != null ? Number(program.minOperationalYears) : null,
    eligibilityNote: program.eligibilityNote,
    status: program.status,
    extractStatus: program.extractStatus,
    errorMessage: program.errorMessage,
    notes: program.notes,
    kadRule,
    expenseCats: program.expenseCats.map(c => ({
      id: c.id,
      name: c.name,
      minPercentage: c.minPercentage != null ? Number(c.minPercentage) : null,
      maxPercentage: c.maxPercentage != null ? Number(c.maxPercentage) : null,
      minAmount: c.minAmount != null ? Number(c.minAmount) : null,
      maxAmount: c.maxAmount != null ? Number(c.maxAmount) : null,
      mandatory: c.mandatory,
      notes: c.notes,
    })),
    deliverables: program.deliverables.map(d => ({
      id: d.id,
      name: d.name,
      description: d.description,
      mandatory: d.mandatory,
      phaseName: program.phases.find(p => p.id === d.phaseId)?.name ?? null,
    })),
    phases: program.phases.map(p => ({ id: p.id, name: p.name })),
    kads: program.kads.map(k => ({ id: k.id, code: k.code, description: k.description })),
    bonuses: program.bonuses.map(b => ({
      id: b.id,
      kind: b.kind,
      name: b.name,
      condition: b.condition,
      bonusRate: b.bonusRate != null ? Number(b.bonusRate) : null,
      bonusAmount: b.bonusAmount != null ? Number(b.bonusAmount) : null,
    })),
    criteria: program.criteria.map(c => ({
      id: c.id,
      name: c.name,
      weight: c.weight != null ? Number(c.weight) : null,
      notes: c.notes,
    })),
    deadlines: program.deadlines.map(d => ({
      id: d.id,
      name: d.name,
      date: d.date ? d.date.toISOString() : null,
      notes: d.notes,
    })),
    regions: program.regions.map(r => ({ id: r.id, name: r.name, notes: r.notes })),
    legalForms: program.legalForms.map(f => ({ id: f.id, name: f.name })),
  }

  return (
    <div>
      <div className="mb-4 pt-1.5">
        <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
          <Link href="/programs" className="hover:text-foreground hover:underline">Προγράμματα</Link>{' '}
          <span aria-hidden>›</span> <b className="text-foreground">{program.title}</b>
        </div>
        <h1 className="text-[22px]">{program.title}</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {program.referenceCode ? <>Κωδικός <span className="font-mono">{program.referenceCode}</span> — </> : null}
          ανασκόπησε τα στοιχεία που εξήγαγε η AI αποδελτίωση και διόρθωσε ό,τι χρειάζεται.
        </p>
      </div>

      <ProgramEditor program={data} />
    </div>
  )
}

/** Ανεκτική εξαγωγή του `kadRule` από το αποθηκευμένο extractedData JSON blob
 * (βλ. σχόλιο πάνω στο component) — δεν εμπιστευόμαστε το σχήμα του Json
 * πεδίου, οπότε ελέγχουμε τύπους πριν το διαβάσουμε. */
function extractKadRule(extractedData: unknown): string | null {
  if (extractedData && typeof extractedData === 'object' && 'kadRule' in extractedData) {
    const v = (extractedData as Record<string, unknown>).kadRule
    return typeof v === 'string' && v.trim() ? v : null
  }
  return null
}
