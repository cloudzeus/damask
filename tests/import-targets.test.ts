import { describe, it, expect } from 'vitest'
import {
  parseGreekNumber, autoMatchField, normalizeHeader, parseProductRow,
  findDuplicateCodes, PRODUCT_TARGET, getImportTarget, IMPORT_TARGETS,
} from '@/lib/import/targets'

describe('parseGreekNumber()', () => {
  it('δέχεται κόμμα ως δεκαδικό διαχωριστικό', () => {
    expect(parseGreekNumber('12,50')).toEqual({ value: 12.5, error: null })
  })

  it('δέχεται τελεία ως δεκαδικό διαχωριστικό', () => {
    expect(parseGreekNumber('12.5')).toEqual({ value: 12.5, error: null })
  })

  it('δέχεται τελεία χιλιάδων + κόμμα δεκαδικό (1.234,56)', () => {
    expect(parseGreekNumber('1.234,56')).toEqual({ value: 1234.56, error: null })
  })

  it('δέχεται κόμμα χιλιάδων + τελεία δεκαδικό (1,234.56)', () => {
    expect(parseGreekNumber('1,234.56')).toEqual({ value: 1234.56, error: null })
  })

  it('δέχεται ακέραιο χωρίς διαχωριστικό', () => {
    expect(parseGreekNumber('25')).toEqual({ value: 25, error: null })
  })

  it('κενό string → null, χωρίς σφάλμα (προαιρετικό πεδίο)', () => {
    expect(parseGreekNumber('')).toEqual({ value: null, error: null })
    expect(parseGreekNumber('   ')).toEqual({ value: null, error: null })
  })

  it('απορρίπτει μη έγκυρο αριθμό', () => {
    const res = parseGreekNumber('δώδεκα')
    expect(res.value).toBeNull()
    expect(res.error).toContain('Μη έγκυρος αριθμός')
  })

  it('απορρίπτει αρνητικό αριθμό εξ ορισμού', () => {
    const res = parseGreekNumber('-5')
    expect(res.value).toBeNull()
    expect(res.error).toContain('αρνητικός')
  })

  it('επιτρέπει αρνητικό όταν allowNegative=true', () => {
    expect(parseGreekNumber('-5', true)).toEqual({ value: -5, error: null })
  })

  it('αγνοεί κενά διαστήματα μέσα στον αριθμό', () => {
    expect(parseGreekNumber(' 1 234,50 ')).toEqual({ value: 1234.5, error: null })
  })
})

describe('normalizeHeader()', () => {
  it('αφαιρεί ελληνικούς τόνους και κάνει lowercase', () => {
    expect(normalizeHeader('Κωδικός')).toBe('κωδικος')
    expect(normalizeHeader('Τιμή Λιανικής')).toBe('τιμηλιανικης')
  })

  it('αφαιρεί μη αλφαριθμητικούς χαρακτήρες', () => {
    expect(normalizeHeader('Code #1!')).toBe('code1')
  })
})

describe('autoMatchField()', () => {
  const fields = PRODUCT_TARGET.fields

  it('ταιριάζει ελληνικές επικεφαλίδες μέσω alias', () => {
    expect(autoMatchField('Κωδικός', fields)).toBe('code')
    expect(autoMatchField('Περιγραφή', fields)).toBe('name')
    expect(autoMatchField('Τιμή Λιανικής', fields)).toBe('priceRetail')
    expect(autoMatchField('Τιμή Χονδρικής', fields)).toBe('priceWholesale')
    expect(autoMatchField('Απόθεμα', fields)).toBe('stock')
    expect(autoMatchField('Βάρος', fields)).toBe('weightPerUnit')
    expect(autoMatchField('CBM', fields)).toBe('cbmPerUnit')
  })

  it('ταιριάζει αγγλικές επικεφαλίδες μέσω alias', () => {
    expect(autoMatchField('SKU', fields)).toBe('code')
    expect(autoMatchField('Description', fields)).toBe('name')
    expect(autoMatchField('Stock', fields)).toBe('stock')
  })

  it('ταιριάζει ακριβές όνομα πεδίου (key ή label)', () => {
    expect(autoMatchField('nameEn', fields)).toBe('nameEn')
    expect(autoMatchField('Ονομασία (Αγγλικά)', fields)).toBe('nameEn')
  })

  it('επιστρέφει κενό όταν δεν βρίσκει κανένα λογικό ταίριασμα', () => {
    expect(autoMatchField('Ξξξξξ Ζζζζζ', fields)).toBe('')
  })

  it('επιστρέφει κενό για κενή επικεφαλίδα', () => {
    expect(autoMatchField('', fields)).toBe('')
  })
})

describe('parseProductRow()', () => {
  it('δέχεται πλήρη έγκυρη γραμμή', () => {
    const res = parseProductRow(5, {
      code: 'DM-1', name: 'Πολυθρόνα', nameEn: 'Armchair',
      priceWholesale: '120,50', priceRetail: '199', cbmPerUnit: '0,85', weightPerUnit: '12,4', stock: '25',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toEqual({
        code: 'DM-1', name: 'Πολυθρόνα', nameEn: 'Armchair',
        priceWholesale: 120.5, priceRetail: 199, cbmPerUnit: 0.85, weightPerUnit: 12.4, stock: 25,
      })
    }
  })

  it('δέχεται γραμμή με μόνο τα υποχρεωτικά πεδία', () => {
    const res = parseProductRow(2, { code: 'DM-2', name: 'Τραπέζι' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.code).toBe('DM-2')
      expect(res.data.name).toBe('Τραπέζι')
      expect(res.data.nameEn).toBeNull()
      expect(res.data.priceWholesale).toBeNull()
    }
  })

  it('απορρίπτει γραμμή χωρίς κωδικό', () => {
    const res = parseProductRow(3, { code: '', name: 'Κάτι' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors.some(e => e.column === 'Κωδικός')).toBe(true)
      expect(res.errors[0].row).toBe(3)
    }
  })

  it('απορρίπτει γραμμή χωρίς ονομασία', () => {
    const res = parseProductRow(4, { code: 'DM-4', name: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some(e => e.column === 'Ονομασία (Ελληνικά)')).toBe(true)
  })

  it('απορρίπτει μη έγκυρη τιμή και επιστρέφει ελληνικό μήνυμα', () => {
    const res = parseProductRow(6, { code: 'DM-6', name: 'Καρέκλα', priceRetail: 'abc' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      const err = res.errors.find(e => e.column === 'Τιμή Λιανικής')
      expect(err).toBeTruthy()
      expect(err!.message).toContain('Μη έγκυρος αριθμός')
    }
  })

  it('συγκεντρώνει πολλαπλά σφάλματα στην ίδια γραμμή', () => {
    const res = parseProductRow(7, { code: '', name: '', priceRetail: 'xxx' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.length).toBe(3)
  })
})

describe('findDuplicateCodes()', () => {
  it('εντοπίζει διπλότυπο κωδικό σε διαφορετικές γραμμές', () => {
    const errors = findDuplicateCodes([
      { rowNum: 2, code: 'A' },
      { rowNum: 3, code: 'B' },
      { rowNum: 4, code: 'A' },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].row).toBe(4)
    expect(errors[0].message).toContain('γραμμή 2')
  })

  it('δεν επιστρέφει τίποτα όταν όλοι οι κωδικοί είναι μοναδικοί', () => {
    expect(findDuplicateCodes([{ rowNum: 2, code: 'A' }, { rowNum: 3, code: 'B' }])).toHaveLength(0)
  })

  it('εντοπίζει τριπλότυπο ως 2 σφάλματα (γραμμές 2 & 3)', () => {
    const errors = findDuplicateCodes([
      { rowNum: 2, code: 'A' }, { rowNum: 3, code: 'A' }, { rowNum: 4, code: 'A' },
    ])
    expect(errors).toHaveLength(2)
    expect(errors.map(e => e.row)).toEqual([3, 4])
  })
})

describe('IMPORT_TARGETS registry', () => {
  it('περιέχει το target "product" με τα αναμενόμενα πεδία', () => {
    expect(getImportTarget('product')).toBe(PRODUCT_TARGET)
    const keys = PRODUCT_TARGET.fields.map(f => f.key)
    expect(keys).toEqual(['code', 'name', 'nameEn', 'priceWholesale', 'priceRetail', 'cbmPerUnit', 'weightPerUnit', 'stock'])
  })

  it('μόνο code και name είναι υποχρεωτικά', () => {
    const required = PRODUCT_TARGET.fields.filter(f => f.required).map(f => f.key)
    expect(required).toEqual(['code', 'name'])
  })

  it('επιστρέφει undefined για άγνωστο target key', () => {
    expect(getImportTarget('does-not-exist')).toBeUndefined()
  })

  it('IMPORT_TARGETS εκθέτει ακριβώς το ίδιο registry object', () => {
    expect(IMPORT_TARGETS.product).toBe(PRODUCT_TARGET)
  })
})
