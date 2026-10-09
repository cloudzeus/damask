import type { ReactNode } from 'react'
import { LuCheck, LuMapPin, LuArrowRight, LuFileText, LuTriangleAlert, LuClock, LuChevronRight, LuBanknote, LuCircleCheck, LuSparkles, LuLightbulb, LuSendHorizontal } from 'react-icons/lu'
import '../../portal/portal.css'

/**
 * «Οθόνες» της πύλης πελατών για το δημόσιο site: τα ΙΔΙΑ στυλ/components με το portal, με ΕΝΔΕΙΚΤΙΚΑ δεδομένα
 * (καμία πραγματική επιχείρηση/πρόσωπο), μέσα σε πλαίσιο browser. Μόνο εμφάνιση — καμία λογική.
 */
export function BrowserFrame({ url = 'wwa-espa.com/portal', children, label }: { url?: string; children: ReactNode; label: string }) {
  return (
    <figure className="pv-frame" aria-label={label}>
      <div className="pv-bar" aria-hidden><span /><span /><span /><em>{url}</em></div>
      <div className="wwa-portal pv-body">{children}</div>
      <figcaption className="sr-only">{label} — ενδεικτική επίδειξη με υποθετικά στοιχεία</figcaption>
    </figure>
  )
}

const STEPS = ['Αξιολόγηση', 'Δικαιολογητικά', 'Υποβολή & έγκριση', 'Υλοποίηση', 'Πιστοποίηση', 'Εκταμίευση']

/** Επισκόπηση: KPIs + «Χρειάζεται η προσοχή σας». */
export function ShowDashboard() {
  return (
    <BrowserFrame label="Επισκόπηση της πύλης πελατών">
      <div className="p-stack" style={{ padding: 16 }}>
        <div className="p-kpis">
          <div className="p-kpi"><div className="v">3</div><div className="k">έργα στο portal</div></div>
          <div className="p-kpi warn"><div className="v">2</div><div className="k">έγγραφα που χρειαζόμαστε</div></div>
          <div className="p-kpi"><div className="v">14</div><div className="k">δικαιολογητικά σε αρχείο</div></div>
          <div className="p-kpi"><div className="v">€38.400</div><div className="k">έχετε εισπράξει</div></div>
        </div>
        <div className="p-section-title"><h2>Χρειάζεται η προσοχή σας</h2></div>
        <ul className="p-todo">
          {[
            { tone: 'bad', ic: <LuTriangleAlert />, t: 'Ανεβάστε: Ασφαλιστική ενημερότητα', s: 'Ψηφιακός μετασχηματισμός ΜμΕ · έως 24/10 (εκπρόθεσμο)' },
            { tone: 'warn', ic: <LuFileText />, t: 'Ανεβάστε: Έντυπο Ε3 2025', s: 'Πράσινη μετάβαση επιχειρήσεων · έως 31/10' },
            { tone: 'ok', ic: <LuBanknote />, t: 'Πληρώθηκε η 1η δόση: €18.400', s: 'Εκσυγχρονισμός μεταποίησης' },
          ].map((a, i) => (
            <li key={i}><div className="row"><span className={`ic ${a.tone}`}>{a.ic}</span><span className="tx"><b>{a.t}</b><span>{a.s}</span></span><LuChevronRight className="go" /></div></li>
          ))}
        </ul>
      </div>
    </BrowserFrame>
  )
}

/** Πορεία έργου 6 βημάτων + «Πού βρισκόμαστε». */
export function ShowJourney() {
  const cur = 3
  return (
    <BrowserFrame url="wwa-espa.com/portal/erga" label="Πορεία έργου βήμα-βήμα">
      <div style={{ padding: 18 }}>
        <ol className="p-steps" aria-hidden>
          {STEPS.map((s, i) => (
            <li key={s} className={i < cur ? 'done' : i === cur ? 'current' : 'todo'}>
              <span className="dot">{i < cur ? <LuCheck /> : i + 1}</span><span className="lbl">{s}</span>
            </li>
          ))}
        </ol>
        <div className="p-now">
          <div className="t"><LuMapPin /> Πού βρισκόμαστε</div>
          <p>Το έργο εγκρίθηκε και βρίσκεται σε υλοποίηση. Πριν από κάθε αγορά ρωτήστε τον βοηθό αν η δαπάνη είναι επιλέξιμη και στείλτε μας τα παραστατικά.</p>
          <div className="next"><LuArrowRight /><span><b>Μετά:</b> Πιστοποίηση: Ο φορέας ελέγχει τις δαπάνες.</span></div>
        </div>
        <div className="p-figs" style={{ marginTop: 14 }}>
          <div className="p-fig"><div className="k">Προϋπολογισμός</div><div className="v">€60.000</div></div>
          <div className="p-fig"><div className="k">Επιδότηση (60%)</div><div className="v">€36.000</div></div>
          <div className="p-fig"><div className="k">Δαπάνες (7)</div><div className="v">€41.200</div><div className="bar"><span style={{ width: '69%' }} /></div></div>
          <div className="p-fig"><div className="k">Έχετε εισπράξει</div><div className="v">€18.400</div><div className="bar"><span style={{ width: '51%' }} /></div></div>
        </div>
      </div>
    </BrowserFrame>
  )
}

/** Έξυπνος έλεγχος εγγράφων: σωστό / λάθος έγγραφο. */
export function ShowDocCheck() {
  return (
    <BrowserFrame url="wwa-espa.com/portal/erga" label="Έξυπνος έλεγχος εγγράφων">
      <div style={{ padding: 18 }}>
        <h3 className="p-h3">Τι χρειαζόμαστε από εσάς</h3>
        <ul className="p-list">
          <li>
            <LuFileText className="ico" />
            <div className="name">Φορολογική ενημερότητα<div className="sub">Έως 30/10</div></div>
            <span className="p-badge ok"><LuCircleCheck /> Ελέγχθηκε</span>
          </li>
          <li style={{ flexWrap: 'wrap' }}>
            <LuFileText className="ico" />
            <div className="name">Έντυπο Ε3 2025<div className="sub">Έως 31/10</div></div>
            <span className="p-badge warn"><LuClock /> Εκκρεμεί</span>
            <div className="p-review bad"><div className="msg"><LuTriangleAlert /><span><b>Δεν ανέβηκε.</b> Αυτό δεν είναι το «Έντυπο Ε3 2025» — μοιάζει με «Ισολογισμός 2024». Ελέγξτε ότι επιλέξατε το σωστό αρχείο.</span></div></div>
          </li>
        </ul>
      </div>
    </BrowserFrame>
  )
}

/** Ψηφιακός βοηθός 24/7. */
export function ShowAssistant() {
  return (
    <BrowserFrame url="wwa-espa.com/portal" label="Ψηφιακός βοηθός 24/7">
      <div className="pv-chat">
        <div className="pv-msg me">Θέλω να αγοράσω ένα φορτηγάκι για τις διανομές. Επιδοτείται;</div>
        <div className="pv-msg bot">
          Καλή ερώτηση! Στο δικό σας πρόγραμμα τα <b>μεταφορικά μέσα δεν είναι επιλέξιμα</b>, όμως μπορείτε να επιδοτηθείτε για <b>σύστημα διαχείρισης διανομών</b> και <b>εξοπλισμό αποθήκης</b>. Θέλετε να ετοιμάσω το αίτημα προσφοράς;
        </div>
        <div className="pv-msg me">Ναι, και στείλε στον λογιστή μου να ανεβάσει το Ε3.</div>
        <div className="pv-msg bot">Έτοιμο — ετοίμασα το email με ασφαλή σύνδεσμο για τον λογιστή σας. Πατήστε «Αποστολή» όταν είστε έτοιμοι.</div>
        <div className="pv-input" aria-hidden><span>Ρωτήστε οτιδήποτε για τα έργα σας…</span><LuSendHorizontal /></div>
      </div>
    </BrowserFrame>
  )
}

/** Οδηγός βήμα-βήμα (wizard). */
export function ShowWizard() {
  return (
    <BrowserFrame url="wwa-espa.com/portal/odigoi" label="Οδηγοί βήμα-βήμα">
      <div className="p-card p-wbody" style={{ margin: 16 }}>
        <div className="p-wbar"><span style={{ width: '43%' }} /></div>
        <div className="p-kicker">ΒΗΜΑ 3 ΑΠΟ 7</div>
        <h2>Στείλτε μας την προσφορά πριν αγοράσετε</h2>
        <p className="lead">Ελέγχουμε ότι ταιριάζει στο εγκεκριμένο έργο — ώστε κάθε ευρώ να επιδοτηθεί χωρίς εκπλήξεις.</p>
        <ul className="p-wtodo"><li><LuCheck />Επωνυμία & ΑΦΜ της επιχείρησης</li><li><LuCheck />Αναλυτική περιγραφή και τιμή</li></ul>
        <div className="p-wtip"><LuLightbulb /><span>Αν χρειάζεται αλλαγή προμηθευτή, θα σας το πούμε πριν την αγορά.</span></div>
        <div className="p-wnav"><span className="p-btn p-btn-outline">Προηγούμενο</span><span className="p-btn">Κατάλαβα, επόμενο <LuArrowRight /></span></div>
      </div>
    </BrowserFrame>
  )
}

export function ShowOpportunity() {
  return (
    <BrowserFrame url="wwa-espa.com/portal/eukairies" label="Ευκαιρίες ένταξης">
      <div style={{ padding: 16 }}>
        <article className="p-project" style={{ cursor: 'default' }}>
          <div className="meta"><span className="p-badge ok"><LuCircleCheck /> Ταιριάζει στην επιχείρησή σας</span><span className="p-badge">Επιδότηση έως 70%</span></div>
          <h3>Ενίσχυση εξωστρέφειας μικρομεσαίων επιχειρήσεων</h3>
          <p className="p-muted" style={{ margin: 0, fontSize: 14 }}>Νέο πρόγραμμα για συμμετοχή σε εκθέσεις, πιστοποιήσεις και ψηφιακή προβολή σε αγορές εξωτερικού.</p>
          <span className="p-btn" style={{ alignSelf: 'flex-start' }}><LuSparkles /> Ενδιαφέρομαι</span>
        </article>
      </div>
    </BrowserFrame>
  )
}
