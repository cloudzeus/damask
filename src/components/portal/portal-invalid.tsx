import Link from 'next/link'

/**
 * Δημόσια σελίδα σφάλματος για magic-link tokens (upload/access) που δεν
 * είναι έγκυρα, έχουν λήξει ή έχουν κλείσει. Ίδιο minimal shell με το
 * src/app/portal/page.tsx (app-canvas + glass), χωρίς auth/nav — αυτές οι
 * σελίδες είναι δημόσιες (C2d).
 */
export function PortalInvalid() {
  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center px-6">
      <div className="glass stagger w-full max-w-md p-8 text-center">
        <Link href="/" className="wordmark mb-6 inline-flex text-[18px] text-foreground">
          DAMASK
        </Link>
        <h1 className="mb-2 text-[22px]">Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει</h1>
        <p className="text-sm text-muted-foreground">
          Ελέγξτε ότι ανοίξατε τον πιο πρόσφατο σύνδεσμο που λάβατε, ή επικοινωνήστε με τον υπεύθυνο του έργου για
          νέο σύνδεσμο.
        </p>
      </div>
    </div>
  )
}
