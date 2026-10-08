import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * (Plain module.) Ο «Οδηγός χρήσης» (public/odigos-wwa.html) ως γνώση του Thanos για τους χρήστες της εφαρμογής.
 * Σπάει σε ενότητες (h2) και επιστρέφει τις πιο σχετικές με την ερώτηση (απλό keyword scoring χωρίς τόνους).
 */

type Section = { title: string; text: string; norm: string }
let cache: { mtime: number; sections: Section[] } | null = null

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ')
const strip = (html: string) => html
  .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h[1-6]|tr|div|dt|dd)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()

async function sections(): Promise<Section[]> {
  const file = path.join(process.cwd(), 'public', 'odigos-wwa.html')
  const stat = await fs.stat(file).catch(() => null)
  if (!stat) return []
  if (cache && cache.mtime === stat.mtimeMs) return cache.sections
  const html = await fs.readFile(file, 'utf8')
  const parts = html.split(/<h2[^>]*>/i).slice(1)
  const out = parts.map(p => {
    const title = strip(p.split(/<\/h2>/i)[0] ?? '')
    const text = strip(p).slice(0, 6000)
    return { title, text, norm: norm(text) }
  }).filter(s => s.title)
  cache = { mtime: stat.mtimeMs, sections: out }
  return out
}

export async function searchManual(question: string, max = 3): Promise<{ toc: string[]; sections: { title: string; text: string }[] }> {
  const all = await sections()
  const words = norm(question).split(/[^a-zα-ω0-9]+/).filter(w => w.length >= 3)
  // Ρίζες (πρώτοι 5 χαρακτήρες) ώστε «δικαιολογητικά/δικαιολογητικών» να ταιριάζουν.
  const stems = [...new Set(words.map(w => w.slice(0, Math.max(4, Math.min(6, w.length - 1)))))]
  const scored = all.map(s => {
    const t = norm(s.title)
    const score = stems.reduce((acc, st) => acc + (t.includes(st) ? 5 : 0) + Math.min(4, s.norm.split(st).length - 1), 0)
    return { s, score }
  }).sort((a, b) => b.score - a.score)
  return {
    toc: all.map(s => s.title),
    sections: scored.filter(x => x.score > 0).slice(0, max).map(x => ({ title: x.s.title, text: x.s.text })),
  }
}
