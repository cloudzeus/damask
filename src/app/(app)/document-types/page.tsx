import { requirePermission } from '@/lib/rbac-server'
import { PageHeader } from '@/components/ui/page-header'
import { listDocumentTypesAdmin, listFormGuidesForLink } from '@/lib/documents/type-admin'
import { DocumentTypesTable } from './document-types-table'

/**
 * «Τύποι Δικαιολογητικών» (/document-types) — standalone διαχείριση του κοινού
 * καταλόγου DocumentType: όνομα, ημ. λήξης, ενεργό, σημειώσεις + σύνδεση με
 * Οδηγούς Εντύπων (τα πεδία που σαρώνονται για εξαγωγή τιμών). Perm doctype.manage.
 */
export default async function DocumentTypesPage() {
  await requirePermission('doctype.manage')
  const [rows, guides] = await Promise.all([listDocumentTypesAdmin(), listFormGuidesForLink()])

  return (
    <div>
      <PageHeader
        breadcrumb={<>Διαχείριση <span aria-hidden>›</span></>}
        title="Τύποι Δικαιολογητικών"
        subtitle="Ο κοινός κατάλογος δικαιολογητικών — ημ. λήξης, σάρωση τιμών (Οδηγός Εντύπων) και σύνδεση με προγράμματα & αποθήκη πελάτη."
      />
      <DocumentTypesTable rows={rows} guides={guides} />
    </div>
  )
}
