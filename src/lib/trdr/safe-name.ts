// src/lib/trdr/safe-name.ts — ISOMORPHIC. Ονόματα φακέλων/αρχείων για το CDN (μόνο A-Z a-z 0-9 . _ -):
// τα ελληνικά μεταγράφονται (ΕΛΟΤ-like) αντί να χάνονται — «Τιμολόγια 2024» → «Timologia-2024».

const MAP: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o',
  π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
}

export function greekToLatin(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[α-ωςΑ-Ω]/g, ch => {
    const lower = ch.toLowerCase()
    const t = MAP[lower] ?? ch
    return ch === lower ? t : t.charAt(0).toUpperCase() + t.slice(1)
  })
}

/** Ένα τμήμα διαδρομής (φάκελος ή όνομα αρχείου χωρίς κατάληξη) ασφαλές για το storage. */
export function safeSegment(input: string, fallback = 'item'): string {
  const s = greekToLatin(input.trim())
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
  return s || fallback
}

/** Σχετική διαδρομή φακέλων («Φάκελος/Υποφάκελος») → «Fakelos/Ypofakelos/» (κενό αν δεν υπάρχει). */
export function safeRelativeDir(rel: string): string {
  const parts = rel.split(/[\\/]+/).map(p => p.trim()).filter(p => p && p !== '.' && p !== '..')
  return parts.length ? `${parts.slice(0, 12).map(p => safeSegment(p, 'folder')).join('/')}/` : ''
}
