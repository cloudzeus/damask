import type { ImportFieldDef } from '@/lib/import/targets'
import type { OcrDocTypeHint } from '@/lib/ocr/schema'
import type { SourceKind } from './normalized'

export type IngestionFieldDef = ImportFieldDef & { aliases?: string[] }
export type OcrProjection = 'party' | 'lines'

export type IngestionTarget = {
  key: string
  label: string
  objectKey: string
  permission: string
  fields: IngestionFieldDef[]
  uniqueBy: string
  sources: SourceKind[]
  ocr?: { docTypeHint?: OcrDocTypeHint; project: OcrProjection }
}

export function requiredFieldKeys(target: IngestionTarget): string[] {
  return target.fields.filter(f => f.required).map(f => f.key)
}
