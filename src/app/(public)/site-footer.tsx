import Link from 'next/link'
import { prisma } from '@/lib/prisma'

/** Μικρό glass footer bar — λινκς στις ΔΗΜΟΣΙΕΥΜΕΝΕΣ LegalPages μόνο. Ζει στο (public) layout ώστε να εμφανίζεται σε ΚΑΘΕ δημόσια σελίδα (home + /legal/*). */
export async function SiteFooter() {
  const pages = await prisma.legalPage.findMany({
    where: { published: true },
    include: { translations: { where: { locale: 'el' } } },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <footer className="site-footer glass stagger">
      <span className="wordmark text-[13px]">DAMASK</span>
      <span>© {new Date().getFullYear()} Damask — Υφάσματα &amp; Έπιπλα</span>
      {pages.length > 0 && (
        <nav className="links">
          {pages.map(p => (
            <Link key={p.id} href={`/legal/${p.slug}`}>
              {p.translations[0]?.title ?? p.slug}
            </Link>
          ))}
        </nav>
      )}
    </footer>
  )
}
