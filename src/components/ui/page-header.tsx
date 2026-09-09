import type * as React from 'react'
import Link from 'next/link'

export type Crumb = { label: string; href?: string }

/**
 * Κοινό, compact page header για ΟΛΗ την εφαρμογή (CRM density). Ο τίτλος μπαίνει
 * ΠΑΝΤΑ μέσα σε glass pane (ποτέ σε γυμνό/σκούρο φόντο), με μικρή γραμματοσειρά.
 * Breadcrumb + subtitle προαιρετικά· `actions` για κουμπιά δεξιά (responsive wrap).
 *
 * Breadcrumb: πέρασε `crumbs` (array με clickable links — προτιμώμενο, σταθερό
 * μοτίβο «πού είμαι / πώς γυρίζω πίσω») ή το legacy `breadcrumb` ReactNode.
 */
export function PageHeader({
  breadcrumb, crumbs, title, subtitle, actions,
}: {
  breadcrumb?: React.ReactNode
  crumbs?: Crumb[]
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="glass mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        {crumbs && crumbs.length > 0 ? (
          <nav aria-label="Διαδρομή" className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-semibold text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {c.href && i < crumbs.length - 1
                  ? <Link href={c.href} className="transition-colors hover:text-foreground">{c.label}</Link>
                  : <span className={i === crumbs.length - 1 ? 'text-foreground' : undefined}>{c.label}</span>}
                {i < crumbs.length - 1 && <span aria-hidden>›</span>}
              </span>
            ))}
          </nav>
        ) : breadcrumb ? (
          <div className="mb-0.5 flex items-center gap-1.5 text-[0.6875rem] font-semibold text-muted-foreground">
            {breadcrumb}
          </div>
        ) : null}
        <h1 className="text-[1rem] leading-tight font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[0.71875rem] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
