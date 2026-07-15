import { SiteNav } from './site-nav'

export default function HomePage() {
  return (
    <>
      <SiteNav />

      <div className="hero">
        <div className="stagger">
          <div className="eyebrow">Υφάσματα · Έπιπλα · Εσωτερικοί χώροι</div>
          <h1>Η ύλη γίνεται ατμόσφαιρα.</h1>
          <p className="lead">
            Επιμελημένες συλλογές υφασμάτων και επίπλων για ξενοδοχεία, αρχιτέκτονες και όσους σχεδιάζουν
            χώρους με πρόθεση. Από το 1987.
          </p>
          <div className="cta-row">
            <button type="button" className="btn-pill btn-navy">
              Δες τη συλλογή <span className="arr">→</span>
            </button>
            <button type="button" className="btn-pill btn-glass">
              Συνεργασία για επαγγελματίες
            </button>
          </div>
          <div className="micro">
            <span>
              <span
                className="status-dot pulse"
                style={{ background: 'var(--success)', color: 'var(--success)' }}
                aria-hidden
              />
              40.439 είδη διαθέσιμα τώρα
            </span>
            <span>·</span>
            <span>Παράδοση σε 3 χώρες</span>
          </div>
        </div>

        <div className="hero-stage stagger">
          <div className="stage-card main">
            <div className="ph" />
          </div>

          <div className="stage-chip float-a" style={{ top: 0, right: 8 }}>
            <div className="k">
              <span className="status-dot" style={{ background: 'var(--success)' }} aria-hidden />
              Είδη σε απόθεμα
            </div>
            <div className="v">
              40.439<b>↑ 128</b>
            </div>
            <svg className="spark" width="150" height="26" viewBox="0 0 150 26" fill="none" aria-hidden>
              <path
                d="M2 20 22 16 42 18 62 11 82 13 102 7 122 9 148 3"
                stroke="var(--info)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="1 5"
              />
              <circle cx="148" cy="3" r="3" fill="var(--coral)" />
            </svg>
          </div>

          <div className="stage-chip float-b" style={{ bottom: 26, left: 0 }}>
            <div className="k">
              <span className="status-dot" style={{ background: 'var(--info)' }} aria-hidden />
              Συνεργάτες αρχιτέκτονες
            </div>
            <div className="v">
              214<b>σε 3 χώρες</b>
            </div>
          </div>

          <div className="stage-chip float-c" style={{ top: '44%', right: -6, padding: '10px 13px' }}>
            <div className="k">Container ΝΙΝΓΚΜΠΟ · 68%</div>
            <svg className="spark" width="120" height="8" viewBox="0 0 120 8" aria-hidden>
              <rect x="0" y="2" width="120" height="4" rx="2" fill="var(--info-soft)" />
              <rect x="0" y="2" width="82" height="4" rx="2" fill="var(--coral)" />
            </svg>
          </div>
        </div>
      </div>

      <div className="trust glass stagger">
        <span>Μας εμπιστεύονται</span>
        <b>Ξενοδοχεία Αιγαίον</b>
        <b>Interior Concept</b>
        <b>Villa Elaia</b>
        <b>Atelier Nord</b>
        <span className="ml-auto inline-flex items-center gap-1.5">
          B2B portal με ζωντανές τιμές container <span className="arr">→</span>
        </span>
      </div>
    </>
  )
}
