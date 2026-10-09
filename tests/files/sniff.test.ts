import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { sniffFile } from '@/lib/files/sniff'

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

describe('sniffFile — τύπος από το περιεχόμενο (αρχεία χωρίς κατάληξη)', () => {
  it('PDF και εικόνες', () => {
    expect(sniffFile(buf(strToU8('%PDF-1.7\n…'))).kind).toBe('pdf')
    expect(sniffFile(buf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).mime).toBe('image/png')
    expect(sniffFile(buf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).mime).toBe('image/jpeg')
  })
  it('Word & Excel (Office Open XML)', () => {
    const docx = zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'word/document.xml': strToU8('<w/>') })
    const xlsx = zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'xl/workbook.xml': strToU8('<w/>') })
    expect(sniffFile(buf(docx)).kind).toBe('docx')
    expect(sniffFile(buf(xlsx)).kind).toBe('sheet')
  })
  it('κείμενο (ελληνικά) vs δυαδικό', () => {
    expect(sniffFile(buf(strToU8('Γενικό Πιστοποιητικό ΓΕΜΗ\nΑρ. 123'))).kind).toBe('text')
    expect(sniffFile(buf(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).kind).toBe('other')
    expect(sniffFile(buf(new Uint8Array([1, 2, 3, 0, 255]))).kind).toBe('other')
  })
})
