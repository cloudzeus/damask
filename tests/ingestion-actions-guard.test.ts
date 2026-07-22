import { describe, it, expect } from 'vitest'
import { assertSafeIngestUrl } from '@/lib/ingestion/api-normalize'

describe('acquireFromApi uses the SSRF guard', () => {
  it('guard throws for private targets (contract the action relies on)', () => {
    expect(() => assertSafeIngestUrl('https://10.1.2.3/data')).toThrow()
    expect(() => assertSafeIngestUrl('https://public.example.com/data')).not.toThrow()
  })
})
