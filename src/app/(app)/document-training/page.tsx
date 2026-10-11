import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { requirePermission } from '@/lib/rbac-server'
import { PageHeader } from '@/components/ui/page-header'
import { listTrainingOverview } from '@/lib/documents/training'
import { TrainingClient } from './training-client'

/**
 * «Εκπαίδευση αναγνώρισης» (/document-training): το προσωπικό ανεβάζει δείγματα εγγράφων διαλέγοντας τον τύπο·
 * η μνήμη αναγνώρισης μαθαίνει από αυτά και από όσα καταχωρίζονται σε πελάτες. Ανά τύπο: δείγματα, πελάτες,
 * ακρίβεια χωρίς AI και «διάγνωση» (χαρακτηριστικές φράσεις + προτεινόμενα πεδία για τον Οδηγό Εντύπου).
 */
export default async function DocumentTrainingPage() {
  await requirePermission('doctraining.upload')
  const [overview, session] = await Promise.all([listTrainingOverview(), auth()])
  return (
    <div>
      <PageHeader
        breadcrumb={<>Διαχείριση <span aria-hidden>›</span></>}
        title="Εκπαίδευση αναγνώρισης"
        subtitle="Ανεβάστε δείγματα εγγράφων διαλέγοντας τον τύπο τους — η αυτόματη αναγνώριση μαθαίνει και γίνεται γρηγορότερη."
      />
      <TrainingClient overview={overview} canDiagnose={can(session, 'doctype.manage')} />
    </div>
  )
}
