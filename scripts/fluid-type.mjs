#!/usr/bin/env node
// Fluid type scale (κανόνας όλων των projects — βλ. ~/.claude/CLAUDE.md «Typography»).
//
//   node scripts/fluid-type.mjs            → τυπώνει το block των --fs-N tokens
//   node scripts/fluid-type.mjs --write    → το γράφει στο src/app/globals.css
//                                            (ανάμεσα στους markers FLUID-TYPE)
//
// Μαζεύει ΚΑΘΕ μέγεθος που χρησιμοποιείται (var(--fs-N) στα tsx/css) και φτιάχνει
// ένα token ανά μέγεθος: γραμμικό clamp() από οθόνη 360px έως 1280px. Desktop =
// ακριβώς το px του design. Κινητό: ≤15px → +1px, 16–20px → ίδιο, ≥22px → ×0.78.
// Ξανατρέξ' το όταν εμφανιστεί νέο μέγεθος.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const CSS = 'src/app/globals.css'
const grab = cmd => execSync(cmd, { encoding: 'utf8' }).split('\n').filter(Boolean)
const used = grab(`grep -rhoE "var\\(--fs-[0-9]+(-[0-9]+)?\\)" src || true`)
  .map(s => s.replace(/var\(--fs-([0-9]+)(?:-([0-9]+))?\)/, (_, a, b) => (b ? `${a}.${b}` : a)))
const sizes = [...new Set([...used, '14', '16'].map(Number))].filter(Number.isFinite).sort((a, b) => a - b)

const MINW = 360, MAXW = 1280
const r = v => Number(v.toFixed(4))
const mobile = d => (d <= 15 ? d + 1 : d <= 20 ? d : Math.round(d * 0.78 * 2) / 2)
const lines = sizes.map(d => {
  const m = mobile(d)
  const name = String(d).replace('.', '-')
  if (m === d) return `  --fs-${name}: ${r(d / 16)}rem;`
  const slope = (d - m) / (MAXW - MINW)
  const intercept = m - slope * MINW
  return `  --fs-${name}: clamp(${r(Math.min(m, d) / 16)}rem, ${r(intercept / 16)}rem ${slope < 0 ? '-' : '+'} ${r(Math.abs(slope) * 100)}vw, ${r(Math.max(m, d) / 16)}rem);`
})
const block = `/* FLUID-TYPE:START — παράγεται από scripts/fluid-type.mjs, μην το επεξεργάζεσαι με το χέρι. */
:root {
${lines.join('\n')}
}
/* FLUID-TYPE:END */`

if (process.argv.includes('--write')) {
  const css = readFileSync(CSS, 'utf8')
  const re = /\/\* FLUID-TYPE:START[\s\S]*?FLUID-TYPE:END \*\//
  if (!re.test(css)) throw new Error('Λείπουν οι markers FLUID-TYPE στο globals.css')
  writeFileSync(CSS, css.replace(re, block))
  console.log(`globals.css: ${sizes.length} tokens`)
} else {
  console.log(block)
}
