import { listOpportunities } from '@/lib/pm/portal-documents'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { Opportunities } from '../../_components/opportunities'
import { PortalBanner, PreviewNote } from '../../_components/portal-banner'

export const metadata = { title: 'Ευκαιρίες ένταξης — Portal World Wide Associates' }

/** Όλα τα ενεργά προγράμματα που δεν έχει ήδη η επιχείρηση — με «Ενδιαφέρομαι» (και εξήγηση όπου δεν ταιριάζουν). */
export default async function PortalOpportunities({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  const [opps, dash] = await Promise.all([listOpportunities(preview || undefined, { includeNonMatching: true }), getContactPortalDashboard(preview || undefined)])
  return (
    <>
      <PortalBanner eyebrow={dash.ok ? dash.companyName : null} title="Ευκαιρίες ένταξης" lead="Τα ενεργά προγράμματα ΕΣΠΑ για επιχειρήσεις. Δείχνουμε ποια ταιριάζουν στα στοιχεία σας — πατήστε «Ενδιαφέρομαι» και θα σας καλέσουμε για αξιολόγηση." photo="startup" thanos />
      <main><div className="p-wrap p-stack">
        {dash.ok && dash.preview && <PreviewNote name={dash.contactName} />}
        {!opps.ok ? <div className="p-empty"><p>Δεν έχετε πρόσβαση.</p></div>
          : opps.items.length === 0 ? <div className="p-empty"><p className="p-muted">Δεν υπάρχουν αυτή τη στιγμή νέα ενεργά προγράμματα που δεν συμμετέχετε ήδη. Θα σας ειδοποιήσουμε μόλις ανοίξει κάτι νέο.</p></div>
          : <>
              <p className="p-muted" style={{ margin: 0, fontSize: 14 }}>Ο έλεγχος γίνεται αυτόματα με τα στοιχεία που έχουμε (ΚΑΔ, περιοχή, νομική μορφή, μέγεθος, έτη λειτουργίας). Ακόμα κι αν κάτι «δεν ταιριάζει», μπορείτε να δηλώσετε ενδιαφέρον — π.χ. αν σκοπεύετε να ανοίξετε νέο ΚΑΔ ή εγκατάσταση.</p>
              <Opportunities items={opps.items} preview={opps.preview} />
            </>}
      </div></main>
    </>
  )
}
