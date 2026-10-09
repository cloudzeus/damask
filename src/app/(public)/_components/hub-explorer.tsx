import Link from 'next/link'
import { LuMapPin, LuFactory, LuCalendarClock, LuSparkles, LuCircleHelp, LuBookOpen, LuArrowRight } from 'react-icons/lu'
import { hubCounts, nProgramms, programsByFamily } from '@/lib/seo-content/hubs'

/**
 * «Βρείτε τι σας αφορά»: πλοήγηση ανά περιφέρεια/κλάδο ΜΕ πλήθος ενεργών προγραμμάτων.
 * Εμφανίζονται μόνο σελίδες που έχουν πρόγραμμα (όχι άδειοι κόμβοι)· οι περιφέρειες με δικό τους (περιφερειακό)
 * πρόγραμμα τονίζονται, ώστε να φαίνεται τι διαφέρει από τα πανελλαδικά.
 */
export async function HubExplorer({ idx = '02' }: { idx?: string }) {
  const [c, fam] = await Promise.all([hubCounts(), programsByFamily()])
  const families = [
    { href: '/espa', label: 'ΕΣΠΑ & Περιφερειακά', n: fam.espa.length },
    { href: '/anaptyxiakos-nomos', label: 'Αναπτυξιακός Νόμος', n: fam.anaptyxiakos.length },
    { href: '/leader', label: 'LEADER & ΚΑΠ', n: fam.kap.length },
  ].filter(f => f.n > 0)
  if (!c.total) return null
  const regions = c.regions.filter(r => r.total > 0).sort((a, b) => b.local - a.local || a.hub.short.localeCompare(b.hub.short, 'el'))
  const sectors = c.sectors.filter(s => s.total > 0).sort((a, b) => b.total - a.total)
  const hidden = c.sectors.length - sectors.length
  return (
    <section lang="el" className="hubx">
      <div className="wrap">
        <div className="sec-head r">
          <span className="eyebrow"><span className="idx">{idx}</span>Αναζήτηση</span>
          <h2>Βρείτε τι σας αφορά</h2>
          <p>Επιλέξτε την περιφέρεια ή τον κλάδο της επιχείρησής σας — ο αριθμός δείχνει πόσα ενεργά προγράμματα ισχύουν εκεί.</p>
        </div>
        {families.length > 1 && (
          <nav className="hubx-fam r" aria-label="Ανά είδος προγράμματος">
            <span>Ανά είδος:</span>
            {families.map(f => <Link key={f.href} href={f.href} className="hubx-chip is-local">{f.label}<span className="n">{f.n}</span></Link>)}
          </nav>
        )}
        <div className="hubx-grid r">
          <div className="hubx-panel">
            <h3><LuMapPin aria-hidden /> Ανά περιφέρεια</h3>
            {c.nationwide > 0 && <p className="hubx-note">{c.nationwide === c.total ? `${c.total === 1 ? 'Το ενεργό πρόγραμμα καλύπτει' : 'Όλα τα ενεργά προγράμματα καλύπτουν'} όλη την Ελλάδα.` : `${nProgramms(c.nationwide)} ${c.nationwide === 1 ? 'καλύπτει' : 'καλύπτουν'} όλη την Ελλάδα· με έντονο οι περιφέρειες που έχουν και δικό τους πρόγραμμα.`}</p>}
            <ul className="hubx-chips">
              {regions.map(r => (
                <li key={r.hub.slug}>
                  <Link href={`/espa/${r.hub.slug}`} className={`hubx-chip${r.local ? ' is-local' : ''}`} aria-label={`ΕΣΠΑ ${r.hub.short}: ${nProgramms(r.total)}${r.local ? `, ${r.local} περιφερειακ${r.local === 1 ? 'ό' : 'ά'}` : ''}`}>
                    {r.hub.short}<span className="n">{r.total}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="hubx-panel">
            <h3><LuFactory aria-hidden /> Ανά κλάδο</h3>
            <p className="hubx-note">Με βάση τους επιλέξιμους ΚΑΔ κάθε προγράμματος{hidden > 0 ? ` · ${hidden} ${hidden === 1 ? 'κλάδος δεν έχει' : 'κλάδοι δεν έχουν'} ενεργό πρόγραμμα αυτή τη στιγμή` : ''}.</p>
            <ul className="hubx-chips">
              {sectors.map(s => (
                <li key={s.sector.slug}>
                  <Link href={`/espa/klados/${s.sector.slug}`} className="hubx-chip" aria-label={`${s.sector.name}: ${nProgramms(s.total)}`}>
                    {s.sector.name}<span className="n">{s.total}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <nav className="hubx-quick r" aria-label="Χρήσιμες σελίδες">
          <Link href="/programmata/nea-2026"><LuSparkles aria-hidden /><span><b>Νέα & αναμενόμενα 2026</b><small>Τι έρχεται τους επόμενους μήνες</small></span><LuArrowRight className="go" aria-hidden /></Link>
          <Link href="/prothesmies-espa"><LuCalendarClock aria-hidden /><span><b>Προθεσμίες</b><small>Πότε λήγει κάθε πρόγραμμα</small></span><LuArrowRight className="go" aria-hidden /></Link>
          <Link href="/syxnes-erotiseis"><LuCircleHelp aria-hidden /><span><b>Συχνές ερωτήσεις</b><small>Δικαιούμαι; Πόσα παίρνω;</small></span><LuArrowRight className="go" aria-hidden /></Link>
          <Link href="/glossari"><LuBookOpen aria-hidden /><span><b>Γλωσσάριο</b><small>de minimis, ΕΜΕ, ΚΑΔ</small></span><LuArrowRight className="go" aria-hidden /></Link>
        </nav>
      </div>
    </section>
  )
}
