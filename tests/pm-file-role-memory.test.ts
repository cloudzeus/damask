import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { fileRoleExample: { findMany: (...a: unknown[]) => findMany(...a) } } }))

import { namePattern, folderPattern, classifyWithMemory } from '@/lib/pm/file-role-memory'

beforeEach(() => findMany.mockReset())

describe('σχήματα ονόματος/φακέλου', () => {
  it('ψηφία → # και χωρίς τόνους/κατάληξη', () => {
    expect(namePattern('Πληρωμή (2) - 10.000.pdf')).toBe('πληρωμη # #')
    expect(namePattern('Πληρωμή (1) - 4.152.pdf')).toBe(namePattern('Πληρωμή (3) - 10.502,76.pdf'))
    expect(namePattern('ΤΔΑ 14759.pdf')).toBe('τδα #')
    expect(folderPattern('Α ΔΟΣΗ/2.1 - NETSCOPE/ΤΔΑ 14759/x.pdf')).toBe('# netscope / τδα #')
  })
})

describe('classifyWithMemory', () => {
  it('επιλογή χρήστη για ίδιο σχήμα υπερισχύει των κανόνων', async () => {
    findMany.mockResolvedValueOnce([{ pattern: 'τδα #', folder: '', role: 'ACCOUNTING', source: 'USER', hits: 1 }])
    expect(await classifyWithMemory({ fileName: 'ΤΔΑ 99.pdf' })).toMatchObject({ role: 'ACCOUNTING', source: 'user' })
  })
  it('κανόνες όταν δεν υπάρχει διόρθωση', async () => {
    findMany.mockResolvedValueOnce([])
    expect(await classifyWithMemory({ fileName: 'Πληρωμή (1) - 4.000.pdf' })).toMatchObject({ role: 'PAYMENT', source: 'rules' })
  })
  it('άγνωστο για τους κανόνες → πλησιέστερο παράδειγμα μνήμης', async () => {
    findMany
      .mockResolvedValueOnce([]) // ίδιο σχήμα: τίποτα
      .mockResolvedValueOnce([{ pattern: 'καταθεση μισθων #', folder: 'x / μισθοδοσια', role: 'PAYROLL_PAYMENT', source: 'AUTO', hits: 3 }])
    expect(await classifyWithMemory({ fileName: 'Κατάθεση μισθών 05.pdf', relPath: 'x/Μισθοδοσία/Κατάθεση μισθών 05.pdf' })).toMatchObject({ role: 'PAYROLL_PAYMENT', source: 'memory' })
  })
  it('χωρίς κανόνα και χωρίς παρόμοιο παράδειγμα → λοιπό', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    expect((await classifyWithMemory({ fileName: 'κάτι.pdf' })).role).toBe('OTHER')
  })
  it('σύμβαση δεν γίνεται παραστατικό από ομοιότητα φακέλου', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ pattern: 'efcc ι κ ε τδα #', folder: '# efcc ικε / εγκριση', role: 'INVOICE', source: 'AUTO', hits: 3 }])
    expect((await classifyWithMemory({ fileName: 'Σύμβαση EFCC Ι Κ Ε.doc', relPath: '3 = EFCC ΙΚΕ/ΕΓΚΡΙΣΗ/Σύμβαση EFCC Ι Κ Ε.doc' })).role).toBe('OTHER')
  })
  it('αρχείο Word δεν γίνεται πληρωμή από ομοιότητα', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ pattern: 'efcc καταλογος', folder: 'x / y', role: 'PAYMENT', source: 'USER', hits: 3 }])
    expect((await classifyWithMemory({ fileName: 'EFCC κατάλογος.docx', relPath: 'x/y/EFCC κατάλογος.docx' })).role).toBe('OTHER')
  })
})
