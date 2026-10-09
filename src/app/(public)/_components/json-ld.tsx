import { SITE_URL, SITE_NAME, absoluteUrl } from '@/lib/site-url'
import { wwaLogoDark } from '../_wwa/assets'

/** Ασφαλές JSON-LD (escape του «<» ώστε να μη σπάει το <script>). */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}

const ORG_ID = `${SITE_URL}/#organization`

/** Η εταιρεία ως οντότητα (Google/AI): ProfessionalService + WebSite — μία φορά στο layout του website. */
export function organizationJsonLd(): Record<string, unknown>[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      '@id': ORG_ID,
      name: SITE_NAME,
      legalName: 'World Wide Associates Ε.Ε.',
      alternateName: 'WWA',
      url: SITE_URL,
      logo: wwaLogoDark,
      image: wwaLogoDark,
      description: 'Σύμβουλοι ΕΣΠΑ και ευρωπαϊκών προγραμμάτων χρηματοδότησης: έλεγχος επιλεξιμότητας, σχεδιασμός και υποβολή επενδυτικών σχεδίων, υλοποίηση, πιστοποίηση και αποπληρωμή επιδοτήσεων για επιχειρήσεις.',
      telephone: '+30 210 721 8758',
      email: 'info@wwa-espa.com',
      address: { '@type': 'PostalAddress', streetAddress: 'Αλεξανδρουπόλεως 25', addressLocality: 'Αθήνα', postalCode: '115 27', addressCountry: 'GR' },
      areaServed: { '@type': 'Country', name: 'Ελλάδα' },
      openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' }],
      knowsAbout: ['ΕΣΠΑ 2021-2027', 'Ευρωπαϊκά προγράμματα', 'Επιδοτήσεις επιχειρήσεων', 'Αναπτυξιακός Νόμος', 'Ταμείο Ανάκαμψης', 'de minimis', 'Επιλέξιμες δαπάνες'],
      priceRange: '€€',
      // Φορείς όπως αναγράφονται στη σελίδα «Εταιρεία» (επίσημοι σύμβουλοι ΣΕΔΕ, μέλη κλαδικών φορέων).
      // Επίσημα προφίλ της εταιρείας (οντότητα για Google/AI). Πρόσθεσε εδώ LinkedIn/Instagram/Google Business όταν υπάρξουν.
      sameAs: ['https://www.facebook.com/p/World-Wide-Associates-61568828876859/'],
      memberOf: ['ΣΕΔΕ', 'ΣΥ.Σ.ΕΠ.', 'GR.EC.A', 'ΠΣΒΑΚ', 'BNI Greece'].map(name => ({ '@type': 'Organization', name })),
    },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, inLanguage: 'el-GR', publisher: { '@id': ORG_ID } },
  ]
}

/** BreadcrumbList από τα «ψίχουλα» της σελίδας (href σχετικό). */
export function breadcrumbJsonLd(crumbs: { label: string; href?: string }[]): Record<string, unknown> {
  const all = [{ label: 'Αρχική', href: '/' }, ...crumbs]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, ...(c.href ? { item: absoluteUrl(c.href) } : {}) })),
  }
}

export const organizationRef = { '@id': ORG_ID }

/** ItemList (λίστα προγραμμάτων/άρθρων) — το Google/AI καταλαβαίνει ότι η σελίδα είναι κατάλογος. */
export function itemListJsonLd(name: string, items: { name: string; href: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: absoluteUrl(it.href) })),
  }
}
