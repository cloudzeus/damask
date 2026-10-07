#!/usr/bin/env node
// Μία φορά: μετατρέπει σταθερά μεγέθη γραμματοσειράς σε fluid tokens --fs-N.
//   text-[0.75rem] / text-[12px]      → text-[length:var(--fs-12)]
//   style fontSize: '0.9rem' | 13     → fontSize: 'var(--fs-14-5)' | 'var(--fs-13)'
//   globals.css  font-size: 13px      → font-size: var(--fs-13)
// Εκτός: δημόσιο site (δικό του design), SVG charts (recharts tick), HTML emails/εξαγωγές.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const px = (v, unit) => (unit === 'rem' ? v * 16 : v)
const name = p => String(Math.round(p * 2) / 2).replace('.', '-')
const tok = p => `var(--fs-${name(p)})`

const files = execSync(`git ls-files 'src/**/*.tsx' 'src/**/*.ts'`, { encoding: 'utf8' })
  .split('\n')
  .filter(f => f && !f.startsWith('src/app/(public)/') && !/-html\.ts$|^src\/lib\/email\//.test(f))
let changed = 0, hits = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  let out = src.replace(/text-\[([0-9.]+)(rem|px)\]/g, (_, v, u) => { hits++; return `text-[length:${tok(px(Number(v), u))}]` })
  // inline style fontSize (όχι recharts `tick={{ fontSize }}` — SVG attribute δεν δέχεται var()).
  out = out.replace(/(?<!tick=\{\{ )fontSize: ?'([0-9.]+)(rem|px)'/g, (_, v, u) => { hits++; return `fontSize: '${tok(px(Number(v), u))}'` })
  out = out.replace(/(?<!tick=\{\{ )fontSize: ?([0-9]+(?:\.[0-9]+)?)(?=[,\s}])/g, (_, v) => { hits++; return `fontSize: '${tok(Number(v))}'` })
  if (out !== src) { writeFileSync(f, out); changed++ }
}

const CSS = 'src/app/globals.css'
let css = readFileSync(CSS, 'utf8')
css = css.replace(/font-size: ?([0-9.]+)(px|rem);/g, (m, v, u) => { hits++; return `font-size: ${tok(px(Number(v), u))};` })
writeFileSync(CSS, css)
console.log(`${hits} αντικαταστάσεις σε ${changed} αρχεία + globals.css`)
