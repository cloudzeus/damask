import { indexNowKey } from '@/lib/seo-content/indexnow'

/** Κλειδί IndexNow (keyLocation) — αποδεικνύει ότι οι ειδοποιήσεις URLs προέρχονται από τον ιδιοκτήτη του site. */
export function GET() {
  return new Response(indexNowKey(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
