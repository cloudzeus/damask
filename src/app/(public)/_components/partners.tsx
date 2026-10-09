/* eslint-disable @next/next/no-img-element -- λογότυπα SVG/WebP από το CDN μας */
const P = 'https://damask-1.b-cdn.net/wwa/site/partners'

/** Φορείς όπου η WWA είναι σύμβουλος/μέλος + συνεργάτες — λογότυπα από τα επίσημα sites τους, στο CDN μας. */
export const PARTNERS = [
  { name: 'ΣΕΔΕ — Σύνδεσμος Εταιριών Διαδικτύου Ελλάδας', short: 'ΣΕΔΕ', url: 'https://sede.org.gr', logo: `${P}/sede.svg`, kind: 'member', h: 64 },
  { name: 'ΣΥΣΕΠ — Σύνδεσμος Συμβούλων Επιχειρήσεων', short: 'ΣΥ.Σ.ΕΠ.', url: 'https://www.sysep.org', logo: `${P}/sysep.webp`, kind: 'member', h: 40 },
  { name: 'GR.EC.A — Ελληνικός Σύνδεσμος Ηλεκτρονικού Εμπορίου', short: 'GR.EC.A', url: 'https://www.greekecommerce.gr', logo: `${P}/greca.svg`, kind: 'member', h: 30 },
  { name: 'ΠΣΒΑΚ — Πανελλήνιος Σύνδεσμος Βιομηχάνων & Αντιπροσώπων Καλλυντικών και Αρωμάτων', short: 'ΠΣΒΑΚ', url: 'https://psvak.gr', logo: `${P}/psvak.webp`, kind: 'member', h: 48 },
  { name: 'BNI Greece', short: 'BNI Greece', url: 'https://bni-greece.com', logo: `${P}/bni.webp`, kind: 'member', h: 38 },
  { name: 'Entersoftone', short: 'Entersoftone', url: 'https://www.entersoftone.gr', logo: `${P}/entersoftone.svg`, kind: 'partner', h: 22 },
] as const

export function PartnersStrip({ label = 'Σύμβουλοι, μέλη & συνεργάτες' }: { label?: string }) {
  return (
    <div className="partners-strip">
      <span className="lab">{label}</span>
      <ul>
        {PARTNERS.map(p => (
          <li key={p.short}>
            <a href={p.url} target="_blank" rel="noopener" title={p.name} aria-label={p.name}>
              <img src={p.logo} alt={p.short} height={p.h} style={{ height: p.h }} loading="lazy" decoding="async" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
