import Link from 'next/link'

export function SiteNav() {
  return (
    <header className="site-nav glass stagger">
      <span className="wordmark text-[18px] text-foreground">DAMASK</span>
      <nav className="links">
        <a href="#">Συλλογή</a>
        <a href="#">Έργα</a>
        <a href="#">Η εταιρεία</a>
        <a href="#">Επικοινωνία</a>
      </nav>
      <div className="flex-1" />
      <button type="button" className="pill">
        EL ▾
      </button>
      <Link href="/login" className="btn-pill btn-navy h-10">
        Σύνδεση <span className="arr">→</span>
      </Link>
    </header>
  )
}
