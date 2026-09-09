import { requirePermission } from '@/lib/rbac-server'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Σελίδα βοήθειας — ενσωματώνει το πλήρες εγχειρίδιο (public/odigos-wwa.html) σε
 * iframe ώστε τα global styles του (fonts/body/details) να μένουν απομονωμένα από
 * το admin design system. Προσβάσιμη από το «?» του topbar.
 */
export default async function HelpPage() {
  await requirePermission('customer.view')

  return (
    <div>
      <PageHeader
        breadcrumb={<>Βοήθεια <span aria-hidden>›</span></>}
        title="Εγχειρίδιο χρήσης"
        actions={
          <a
            href="/odigos-wwa.html"
            target="_blank"
            rel="noopener"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[0.78125rem] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Άνοιγμα σε νέα καρτέλα
          </a>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <iframe
          src="/odigos-wwa.html"
          title="Εγχειρίδιο χρήσης World Wide Associates"
          className="block h-[calc(100dvh-150px)] min-h-[560px] w-full"
        />
      </div>
    </div>
  )
}
