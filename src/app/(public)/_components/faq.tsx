/**
 * WWA public FAQ — accordion (native <details>) + FAQPage JSON-LD με ΤΑΥΤΟΣΗΜΟ
 * κείμενο (AEO/GEO κανόνας: κάθε σελίδα έχει FAQ + schema). Το πρώτο item ανοιχτό.
 */
export type FaqItem = { q: string; a: string }

export function Faq({
  items, idx = '07', title = 'Συχνές ερωτήσεις', subtitle, id = 'faq',
}: {
  items: FaqItem[]
  idx?: string
  title?: string
  subtitle?: string
  id?: string
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(it => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  }
  return (
    <section lang="el" className="faq-sec" id={id}>
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow"><span className="idx">{idx}</span>FAQ</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="acc faq" style={{ maxWidth: 820, margin: '0 auto' }}>
          {items.map((it, i) => (
            <details key={i} open={i === 0}>
              <summary>{it.q}</summary>
              <div className="acc-body">{it.a}</div>
            </details>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--fg-3)', marginTop: 20 }}>
          Δεν βρήκατε την απάντηση; <a href="#contact" style={{ color: 'var(--brand)', fontWeight: 500 }}>Ρωτήστε μας</a> — απαντάμε σε μία εργάσιμη.
        </p>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </section>
  )
}
