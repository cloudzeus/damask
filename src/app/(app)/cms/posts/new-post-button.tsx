import Link from 'next/link'
import { Plus } from 'lucide-react'

/** «+ Νέο άρθρο» — πλοήγηση σε ΣΕΛΙΔΑ (/cms/posts/new), όχι dialog. */
export function NewPostButton() {
  return (
    <Link href="/cms/posts/new" className="btn-pill btn-navy">
      <Plus className="size-3.5" strokeWidth={2} aria-hidden /> Νέο άρθρο
    </Link>
  )
}
