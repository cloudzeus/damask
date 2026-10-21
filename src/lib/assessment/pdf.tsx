import path from 'node:path'
import { Document, Page, Text, View, Image, Svg, Path, Circle, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { AssessmentResult, CheckStatus } from './agent'
import type { CompanyProfile } from './company-profile'

/**
 * (Server-only.) PDF «Αξιολόγηση πιθανότητας ένταξης» — ταυτότητα WWA (navy/cyan, Roboto +
 * Roboto Condensed με ελληνικά). Fonts/λογότυπο από το public/ (υπάρχει και στο Docker image).
 */

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'pdf')
let fontsReady = false
export function ensureFonts() {
  if (fontsReady) return
  Font.register({
    family: 'Roboto',
    fonts: [
      { src: path.join(FONT_DIR, 'Roboto-Regular.ttf') },
      { src: path.join(FONT_DIR, 'Roboto-Italic.ttf'), fontStyle: 'italic' },
      { src: path.join(FONT_DIR, 'Roboto-Medium.ttf'), fontWeight: 500 },
      { src: path.join(FONT_DIR, 'Roboto-Bold.ttf'), fontWeight: 700 },
    ],
  })
  Font.register({
    family: 'RobotoCondensed',
    fonts: [
      { src: path.join(FONT_DIR, 'RobotoCondensed-Bold.ttf'), fontWeight: 700 },
      { src: path.join(FONT_DIR, 'RobotoCondensed-Black.ttf'), fontWeight: 900 },
    ],
  })
  // Χωρίς συλλαβισμό (αγγλικοί κανόνες σπάνε τα ελληνικά).
  Font.registerHyphenationCallback(word => [word])
  fontsReady = true
}

export const C = {
  navy: '#001B72', navy950: '#000022', navy50: '#EEF1FA', navy200: '#B9C4E6', cyan: '#34C8F6',
  ink: '#0B0F2A', fg2: '#474C60', muted: '#666C80', rule: '#DFE2EA', canvas: '#F6F7FA',
  ok: '#117235', okBg: '#E1F3E7', warn: '#8F4B00', warnBg: '#FBEEDC', bad: '#B3261E', badBg: '#FBE4E2', info: '#001B72', infoBg: '#E7EBF7',
}

const STATUS: Record<CheckStatus, { label: string; fg: string; bg: string }> = {
  PASS: { label: 'Πληροί', fg: C.ok, bg: C.okBg },
  ESTIMATED: { label: 'Πληροί (εκτίμηση)', fg: C.info, bg: C.infoBg },
  PARTIAL: { label: 'Υπό όρους', fg: C.warn, bg: C.warnBg },
  FAIL: { label: 'Δεν πληροί', fg: C.bad, bg: C.badBg },
  UNKNOWN: { label: 'Άγνωστο', fg: C.muted, bg: C.canvas },
}
const VERDICT: Record<AssessmentResult['verdict'], { label: string; fg: string; bg: string }> = {
  ELIGIBLE: { label: 'ΕΠΙΛΕΞΙΜΗ', fg: C.ok, bg: C.okBg },
  CONDITIONAL: { label: 'ΕΠΙΛΕΞΙΜΗ ΥΠΟ ΠΡΟΫΠΟΘΕΣΕΙΣ', fg: C.warn, bg: C.warnBg },
  NOT_ELIGIBLE: { label: 'ΜΗ ΕΠΙΛΕΞΙΜΗ', fg: C.bad, bg: C.badBg },
}
const IMPACT: Record<string, { label: string; fg: string; bg: string }> = {
  HIGH: { label: 'Υψηλή', fg: C.bad, bg: C.badBg },
  MEDIUM: { label: 'Μεσαία', fg: C.warn, bg: C.warnBg },
  LOW: { label: 'Χαμηλή', fg: C.muted, bg: C.canvas },
}
const CATEGORY: Record<string, string> = { DOCUMENT: 'Δικαιολογητικό', DATA: 'Στοιχεία', BUSINESS: 'Επιχείρηση', BUDGET: 'Προϋπολογισμός', OTHER: 'Σχέδιο' }
const DOC: Record<string, { label: string; fg: string; bg: string }> = {
  OK: { label: 'Σε ισχύ', fg: C.ok, bg: C.okBg },
  EXPIRED: { label: 'Έληξε', fg: C.warn, bg: C.warnBg },
  MISSING: { label: 'Λείπει', fg: C.bad, bg: C.badBg },
}

const REQ_DOC: Record<string, { label: string; fg: string; bg: string }> = {
  OK: { label: 'Υπάρχει', fg: C.ok, bg: C.okBg },
  EXPIRED: { label: 'Ανανέωση', fg: C.warn, bg: C.warnBg },
  MISSING: { label: 'Να εκδοθεί', fg: C.bad, bg: C.badBg },
  TO_PREPARE: { label: 'Σύνταξη', fg: C.info, bg: C.infoBg },
}

const s = StyleSheet.create({
  page: { fontFamily: 'Roboto', fontSize: 9, color: C.ink, paddingTop: 30, paddingBottom: 46, paddingHorizontal: 0, backgroundColor: '#FFFFFF' },
  body: { paddingHorizontal: 36 },
  header: { backgroundColor: C.navy950, paddingHorizontal: 36, paddingTop: 22, paddingBottom: 20, marginBottom: 18, marginTop: -30 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  logo: { width: 112, height: 35 },
  eyebrow: { color: C.cyan, fontSize: 8, fontWeight: 700, letterSpacing: 1.2 },
  h1: { fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 20, color: '#FFFFFF', letterSpacing: 0.3, marginBottom: 6 },
  hSub: { color: C.navy200, fontSize: 9.5, lineHeight: 1.4 },
  hProgram: { color: '#FFFFFF', fontSize: 10.5, fontWeight: 500, lineHeight: 1.35, marginTop: 2 },
  h2: { fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 12.5, color: C.navy, letterSpacing: 0.4, marginBottom: 8, marginTop: 16 },
  card: { borderWidth: 1, borderColor: C.rule, borderRadius: 8, padding: 12 },
  muted: { color: C.muted },
  para: { fontSize: 9.5, lineHeight: 1.5, color: C.fg2 },
  pill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2.5, fontSize: 7.5, fontWeight: 700, alignSelf: 'flex-start' },
  th: { fontSize: 7, fontWeight: 700, color: C.muted, letterSpacing: 0.6 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: C.rule, paddingVertical: 7 },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: C.muted, borderTopWidth: 0.75, borderTopColor: C.rule, paddingTop: 6 },
})

const NUM = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 })
const EUR = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 })
const dateEl = (isoDate: string | null | undefined) => (isoDate ? isoDate.slice(0, 10).split('-').reverse().join('/') : '—')

function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return <Text style={[s.pill, { color: fg, backgroundColor: bg }]}>{label}</Text>
}

/** Ημικυκλικός μετρητής πιθανότητας (0-100). */
function Gauge({ value }: { value: number }) {
  const r = 52, cx = 64, cy = 62, sw = 12
  const pt = (p: number) => {
    const a = Math.PI * (1 - p / 100)
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) }
  }
  const arc = (from: number, to: number) => {
    const a = pt(from), b = pt(to)
    return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`
  }
  const color = value >= 65 ? C.ok : value >= 35 ? '#C07A00' : C.bad
  const tip = pt(Math.max(1, value))
  return (
    <View style={{ width: 128, alignItems: 'center' }}>
      <Svg width={128} height={72} viewBox="0 0 128 72">
        <Path d={arc(0, 100)} stroke={C.rule} strokeWidth={sw} fill="none" strokeLinecap="round" />
        {value > 0 && <Path d={arc(0, Math.max(1, value))} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />}
        <Circle cx={tip.x} cy={tip.y} r={3} fill="#FFFFFF" />
      </Svg>
      <Text style={{ fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 30, color, marginTop: -30 }}>{value}%</Text>
      <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1, letterSpacing: 0.6 }}>ΠΙΘΑΝΟΤΗΤΑ ΕΝΤΑΞΗΣ</Text>
    </View>
  )
}

function Bar({ pct, color = C.navy }: { pct: number; color?: string }) {
  return (
    <View style={{ height: 5, backgroundColor: C.navy50, borderRadius: 3, width: '100%' }}>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: color, width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </View>
  )
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <View style={{ width: '33.33%', paddingRight: 8, marginBottom: 10 }}>
      <Text style={{ fontSize: 7, color: C.muted, fontWeight: 700, letterSpacing: 0.6, marginBottom: 2 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 10.5, fontWeight: 700, color: C.ink }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  )
}

function Footer({ company }: { company: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>World Wide Associates · Αξιολόγηση ένταξης · {company}</Text>
      <Text render={({ pageNumber, totalPages }) => `Σελίδα ${pageNumber} / ${totalPages}`} />
    </View>
  )
}

export type AssessmentPdfInput = {
  createdAt: Date
  programTitle: string
  programRef: string | null
  submissionEnd: Date | null
  usedGuidePdf: boolean
  model: string | null
  profile: CompanyProfile
  result: AssessmentResult
}

function AssessmentDocument({ d }: { d: AssessmentPdfInput }) {
  const { profile: p, result: r } = d
  const v = VERDICT[r.verdict]
  const primary = p.kads.find(k => k.primary) ?? p.kads[0]
  const scorePct = r.scoring.total != null && r.scoring.max ? (r.scoring.total / r.scoring.max) * 100 : null
  const passPct = r.scoring.passMark != null && r.scoring.max && r.scoring.passMark <= r.scoring.max ? (r.scoring.passMark / r.scoring.max) * 100 : null
  const impactOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const
  const actions = [...r.actions].sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact])
  const exclusion = r.criteria.filter(c => c.exclusion)
  const otherChecks = r.criteria.filter(c => !c.exclusion)

  return (
    <Document title={`Αξιολόγηση ένταξης — ${p.name}`} author="World Wide Associates" subject={d.programTitle} language="el">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerTop}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image (όχι <img>), δεν δέχεται alt */}
            <Image src={path.join(process.cwd(), 'public', 'wwa', 'wwa-logo-light-text.png')} style={s.logo} />
            <Text style={s.eyebrow}>ΑΞΙΟΛΟΓΗΣΗ ΕΝΤΑΞΗΣ · {dateEl(d.createdAt.toISOString())}</Text>
          </View>
          <Text style={s.h1}>{p.name.toUpperCase()}</Text>
          <Text style={s.hSub}>ΑΦΜ {p.afm ?? '—'} · {p.legalForm ?? '—'} · {[p.region.dimos, p.region.periferia].filter(Boolean).join(', ') || '—'}</Text>
          <Text style={[s.hSub, { marginTop: 8, color: C.cyan, fontWeight: 700, fontSize: 7.5, letterSpacing: 1 }]}>ΠΡΟΓΡΑΜΜΑ</Text>
          <Text style={s.hProgram}>{d.programTitle}{d.programRef ? ` (${d.programRef})` : ''}</Text>
        </View>

        <View style={s.body}>
          {/* Σύνοψη: μετρητής + ετυμηγορία + βαθμολογία */}
          <View style={[s.card, { flexDirection: 'row', alignItems: 'center', backgroundColor: C.canvas, borderColor: C.canvas }]}>
            <Gauge value={r.probability} />
            <View style={{ flex: 1, paddingLeft: 16 }}>
              <Pill {...v} />
              <Text style={[s.para, { marginTop: 7, color: C.ink }]}>{r.summary}</Text>
              {scorePct != null && (
                <View style={{ marginTop: 9 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 8, fontWeight: 700 }}>Εκτιμώμενη βαθμολογία αξιολόγησης</Text>
                    <Text style={{ fontSize: 8, fontWeight: 700, color: C.navy }}>
                      {NUM.format(r.scoring.total!)} / {NUM.format(r.scoring.max!)}{r.scoring.passMark != null ? ` · βάση ${NUM.format(r.scoring.passMark)}` : ''}
                    </Text>
                  </View>
                  <View>
                    <Bar pct={scorePct} color={passPct != null && scorePct < passPct ? C.bad : C.navy} />
                    {passPct != null && <View style={{ position: 'absolute', left: `${Math.min(99, passPct)}%`, top: -2, width: 1.5, height: 9, backgroundColor: C.ink }} />}
                  </View>
                </View>
              )}
            </View>
          </View>
          {r.caps.length > 0 && (
            <Text style={{ fontSize: 8, color: C.bad, marginTop: 6 }}>Όριο πιθανότητας: {r.caps.join(' ')}</Text>
          )}

          {/* Στοιχεία επιχείρησης */}
          <Text style={s.h2} minPresenceAhead={60}>ΣΤΟΙΧΕΙΑ ΕΠΙΧΕΙΡΗΣΗΣ ΠΟΥ ΑΞΙΟΛΟΓΗΘΗΚΑΝ</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Fact label="Κύριος ΚΑΔ" value={primary ? primary.code : '—'} sub={primary?.description ?? null} />
            <Fact label="ΕΜΕ" value={p.headline.eme != null ? NUM.format(p.headline.eme) : '—'} sub={p.headline.emeYear ? `έτος ${p.headline.emeYear}` : 'δεν έχει ανέβει ΕΜΕ'} />
            <Fact label="Κύκλος εργασιών" value={p.headline.revenue != null ? `${EUR.format(p.headline.revenue)} €` : '—'} sub={p.headline.revenueYear ? `χρήση ${p.headline.revenueYear}` : 'δεν έχει ανέβει Ε3'} />
            <Fact label="Έτη λειτουργίας" value={p.operationalYears != null ? NUM.format(p.operationalYears) : '—'} sub={p.foundingDate ? `ίδρυση ${dateEl(p.foundingDate)}` : null} />
            <Fact label="Κατηγορία ΜΜΕ" value={p.headline.smeCategory ?? '—'} sub={p.headline.smeCategory ? 'από Δήλωση ΜΜΕ' : null} />
            <Fact label="Κατάσταση" value={p.gemiStatus ?? p.aadeStatus ?? '—'} sub={p.aadeStatus && p.gemiStatus ? p.aadeStatus : null} />
          </View>
          {p.kads.length > 1 && (
            <Text style={{ fontSize: 7.5, color: C.muted, marginTop: -2 }}>
              Δευτερεύοντες ΚΑΔ: {p.kads.filter(k => !k.primary).slice(0, 8).map(k => k.code).join(', ')}{p.kads.length > 9 ? ' …' : ''}
            </Text>
          )}

          {/* Κριτήρια επιλεξιμότητας */}
          <Text style={s.h2} minPresenceAhead={60}>ΚΡΙΤΗΡΙΑ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ</Text>
          <CriteriaTable rows={exclusion.length ? exclusion : r.criteria} />
          {exclusion.length > 0 && otherChecks.length > 0 && (
            <>
              <Text style={[s.h2, { fontSize: 11 }]}>ΛΟΙΠΟΙ ΕΛΕΓΧΟΙ</Text>
              <CriteriaTable rows={otherChecks} />
            </>
          )}
          {r.scoring.items.length > 0 && (
            <>
              <Text style={s.h2} minPresenceAhead={60}>ΕΚΤΙΜΩΜΕΝΗ ΒΑΘΜΟΛΟΓΙΑ ΑΝΑ ΚΡΙΤΗΡΙΟ</Text>
              {r.scoring.items.map((it, i) => {
                const pct = it.estimated != null && it.max ? (it.estimated / it.max) * 100 : 0
                return (
                  <View key={i} style={s.tr} wrap={false}>
                    <View style={{ width: '38%', paddingRight: 8 }}>
                      <Text style={{ fontWeight: 700, fontSize: 8.5 }}>{it.criterion}</Text>
                      {it.weight != null && <Text style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>στάθμιση {NUM.format(it.weight)}%</Text>}
                    </View>
                    <View style={{ width: '16%', paddingRight: 8, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: 700, color: C.navy, marginBottom: 3 }}>
                        {it.estimated != null ? NUM.format(it.estimated) : '—'}{it.max != null ? ` / ${NUM.format(it.max)}` : ''}
                      </Text>
                      <Bar pct={pct} color={pct >= 70 ? C.ok : pct >= 40 ? '#C07A00' : C.bad} />
                    </View>
                    <Text style={{ width: '46%', fontSize: 8, color: C.fg2, lineHeight: 1.4 }}>{it.reasoning}</Text>
                  </View>
                )
              })}
            </>
          )}

          {(r.strengths.length > 0 || r.risks.length > 0) && (
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <View style={{ width: '50%', paddingRight: 8 }}>
                <Text style={s.h2} minPresenceAhead={60}>ΔΥΝΑΤΑ ΣΗΜΕΙΑ</Text>
                {r.strengths.map((x, i) => <Bullet key={i} color={C.ok} text={x} />)}
              </View>
              <View style={{ width: '50%', paddingLeft: 8 }}>
                <Text style={s.h2} minPresenceAhead={60}>ΚΙΝΔΥΝΟΙ</Text>
                {r.risks.map((x, i) => <Bullet key={i} color={C.bad} text={x} />)}
              </View>
            </View>
          )}

          {actions.length > 0 && (
            <>
              <Text style={s.h2} minPresenceAhead={60}>ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΓΙΑ ΤΗΝ ΕΝΤΑΞΗ</Text>
              {actions.map((a, i) => (
                <View key={i} style={[s.tr, { alignItems: 'center' }]} wrap={false}>
                  <Text style={{ width: 20, fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 12, color: C.navy }}>{i + 1}</Text>
                  <Text style={{ flex: 1, fontSize: 9, lineHeight: 1.4, paddingRight: 8 }}>{a.action}</Text>
                  <Text style={{ width: 78, fontSize: 7.5, color: C.muted }}>{CATEGORY[a.category] ?? a.category}</Text>
                  <View style={{ width: 52 }}><Pill {...IMPACT[a.impact]} /></View>
                </View>
              ))}
            </>
          )}

          {(r.requiredDocuments ?? []).length > 0 && (
            <>
              <Text style={s.h2} minPresenceAhead={60}>ΠΙΣΤΟΠΟΙΗΤΙΚΑ & ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ ΠΟΥ ΘΑ ΧΡΕΙΑΣΤΟΥΝ</Text>
              <View style={[s.tr, { paddingVertical: 4 }]}>
                <Text style={[s.th, { width: '34%' }]}>ΔΙΚΑΙΟΛΟΓΗΤΙΚΟ</Text>
                <Text style={[s.th, { width: '18%' }]}>ΕΚΔΙΔΕΤΑΙ ΑΠΟ</Text>
                <Text style={[s.th, { width: '34%' }]}>ΤΙ ΝΑ ΓΙΝΕΙ</Text>
                <Text style={[s.th, { width: '14%' }]}>ΚΑΤΑΣΤΑΣΗ</Text>
              </View>
              {r.requiredDocuments.map((doc, i) => (
                <View key={i} style={s.tr} wrap={false}>
                  <View style={{ width: '34%', paddingRight: 8 }}>
                    <Text style={{ fontSize: 8.5, fontWeight: 700 }}>{doc.name}</Text>
                    {doc.stage ? <Text style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>{doc.stage}</Text> : null}
                  </View>
                  <Text style={{ width: '18%', fontSize: 8, color: C.fg2, paddingRight: 8 }}>{doc.issuer ?? '—'}</Text>
                  <Text style={{ width: '34%', fontSize: 8, color: C.fg2, paddingRight: 8, lineHeight: 1.35 }}>{doc.note}</Text>
                  <View style={{ width: '14%' }}><Pill {...REQ_DOC[doc.status]} /></View>
                </View>
              ))}
            </>
          )}

          {r.documents.length > 0 && (
            <>
              <Text style={s.h2} minPresenceAhead={60}>ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ ΣΤΟΝ ΦΑΚΕΛΟ ΤΟΥ ΠΕΛΑΤΗ</Text>
              {r.documents.map((doc, i) => (
                <View key={i} style={[s.tr, { alignItems: 'center', paddingVertical: 5 }]} wrap={false}>
                  <Text style={{ flex: 1, fontSize: 8.5, paddingRight: 8 }}>{doc.name}{doc.mandatory ? '' : ' (προαιρετικό)'}</Text>
                  <Text style={{ width: 190, fontSize: 7.5, color: C.muted, paddingRight: 8 }}>{doc.note ?? ''}</Text>
                  <View style={{ width: 52 }}><Pill {...DOC[doc.status]} /></View>
                </View>
              ))}
            </>
          )}

          {r.estimates.length > 0 && (
            <>
              <Text style={s.h2} minPresenceAhead={60}>ΕΚΤΙΜΗΣΕΙΣ ΓΙΑ ΝΕΟΤΕΡΑ ΣΤΟΙΧΕΙΑ</Text>
              <Text style={[s.para, { fontSize: 8, marginBottom: 4 }]}>
                Όπου ο οδηγός ζητά στοιχεία νεότερης περιόδου από όσα έχουν καταχωριστεί, θεωρήθηκε ότι είναι κοντά στα τελευταία γνωστά. Επιβεβαιώνονται όταν εκδοθούν τα σχετικά έγγραφα.
              </Text>
              {r.estimates.map((e, i) => (
                <View key={i} style={s.tr} wrap={false}>
                  <Text style={{ width: '24%', fontSize: 8.5, fontWeight: 700 }}>{e.field}</Text>
                  <Text style={{ width: '16%', fontSize: 8 }}>{e.requiredPeriod}</Text>
                  <Text style={{ width: '22%', fontSize: 8, color: C.muted }}>βάσει {e.basedOn}</Text>
                  <Text style={{ width: '38%', fontSize: 8, color: C.fg2 }}>{e.note}</Text>
                </View>
              ))}
            </>
          )}

          <View style={[s.card, { marginTop: 18, backgroundColor: C.navy50, borderColor: C.navy50 }]} wrap={false}>
            <Text style={{ fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 9.5, color: C.navy, marginBottom: 4 }}>ΜΕΘΟΔΟΛΟΓΙΑ & ΠΗΓΕΣ</Text>
            <Text style={[s.para, { fontSize: 7.5 }]}>
              Η αξιολόγηση συνδυάζει έλεγχο των κριτηρίων επιλεξιμότητας (ΚΑΔ, περιφέρεια, νομική μορφή, ΕΜΕ, έτη λειτουργίας, δικαιολογητικά) με ανάλυση
              {d.usedGuidePdf ? ' του επίσημου οδηγού του προγράμματος' : ' των στοιχείων του προγράμματος (ο οδηγός δεν ήταν διαθέσιμος)'}. Στοιχεία επιχείρησης: ΓΕΜΗ, ΑΑΔΕ και καταχωρισμένα έντυπα (Ε3, ΕΜΕ, Δήλωση ΜΜΕ).
              {d.submissionEnd ? ` Λήξη υποβολών: ${dateEl(d.submissionEnd.toISOString())}.` : ''} Η πιθανότητα είναι εκτίμηση και προϋποθέτει
              την έγκαιρη ολοκλήρωση των ενεργειών· δεν αποτελεί δέσμευση έγκρισης.
            </Text>
          </View>
        </View>
        <Footer company={p.name} />
      </Page>
    </Document>
  )
}

function Bullet({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 5 }} wrap={false}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color, marginTop: 3.5, marginRight: 6 }} />
      <Text style={{ flex: 1, fontSize: 8.5, lineHeight: 1.45, color: C.fg2 }}>{text}</Text>
    </View>
  )
}

function CriteriaTable({ rows }: { rows: AssessmentResult['criteria'] }) {
  return (
    <View>
      <View style={[s.tr, { paddingVertical: 4 }]}>
        <Text style={[s.th, { width: '26%' }]}>ΚΡΙΤΗΡΙΟ</Text>
        <Text style={[s.th, { width: '24%' }]}>ΣΤΟΙΧΕΙΟ ΕΠΙΧΕΙΡΗΣΗΣ</Text>
        <Text style={[s.th, { width: '36%' }]}>ΑΙΤΙΟΛΟΓΗΣΗ</Text>
        <Text style={[s.th, { width: '14%' }]}>ΑΠΟΤΕΛΕΣΜΑ</Text>
      </View>
      {rows.map((c, i) => {
        const st = STATUS[c.status]
        return (
          <View key={i} style={s.tr} wrap={false}>
            <View style={{ width: '26%', paddingRight: 8 }}>
              <Text style={{ fontWeight: 700, fontSize: 8.5 }}>{c.criterion}</Text>
              {c.requirement ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2, lineHeight: 1.35 }}>{c.requirement}</Text> : null}
              {c.guideRef ? <Text style={{ fontSize: 7, color: C.navy, marginTop: 2, fontStyle: 'italic' }}>Οδηγός: {c.guideRef}</Text> : null}
            </View>
            <Text style={{ width: '24%', paddingRight: 8, fontSize: 8, lineHeight: 1.35 }}>{c.companyValue}</Text>
            <Text style={{ width: '36%', paddingRight: 8, fontSize: 8, color: C.fg2, lineHeight: 1.4 }}>{c.reasoning}</Text>
            <View style={{ width: '14%' }}><Pill {...st} /></View>
          </View>
        )
      })}
    </View>
  )
}

export async function renderAssessmentPdf(input: AssessmentPdfInput): Promise<Buffer> {
  ensureFonts()
  return renderToBuffer(<AssessmentDocument d={input} />)
}

/** PDF μιας ολοκληρωμένης αξιολόγησης από τη βάση (προβολή/λήψη και αποστολή με email). null αν δεν είναι έτοιμη. */
export async function assessmentPdfById(id: string): Promise<{ pdf: Buffer; fileName: string; companyName: string; programTitle: string; trdrId: string; programId: string } | null> {
  const { prisma } = await import('@/lib/prisma')
  const a = await prisma.eligibilityAssessment.findUnique({
    where: { id },
    include: { program: { select: { title: true, referenceCode: true, submissionEnd: true } } },
  })
  if (!a || a.status !== 'DONE' || !a.result) return null
  const snap = (a.inputSnapshot ?? {}) as { profile?: CompanyProfile }
  if (!snap.profile) return null
  const pdf = await renderAssessmentPdf({
    createdAt: a.createdAt, programTitle: a.program.title, programRef: a.program.referenceCode, submissionEnd: a.program.submissionEnd,
    usedGuidePdf: a.usedGuidePdf, model: null, profile: snap.profile, result: a.result as unknown as AssessmentResult,
  })
  const safe = snap.profile.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60)
  return { pdf, fileName: `Αξιολόγηση-ένταξης-${safe}.pdf`, companyName: snap.profile.name, programTitle: a.program.title, trdrId: a.trdrId, programId: a.programId }
}

// ── Συνολική ανάλυση πολλών προγραμμάτων ─────────────────────────────────────

export type CombinedPdfInput = { createdAt: Date; profile: CompanyProfile; summary: import('./combine').CombinedSummary }

function CombinedDocument({ d }: { d: CombinedPdfInput }) {
  const { profile: p, summary: sm } = d
  const short = (t: string) => (t.length > 46 ? `${t.slice(0, 44)}…` : t)
  return (
    <Document title={`Συνολική αξιολόγηση ένταξης — ${p.name}`} author="World Wide Associates" language="el">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerTop}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image (όχι <img>), δεν δέχεται alt */}
            <Image src={path.join(process.cwd(), 'public', 'wwa', 'wwa-logo-light-text.png')} style={s.logo} />
            <Text style={s.eyebrow}>ΣΥΝΟΛΙΚΗ ΑΞΙΟΛΟΓΗΣΗ · {dateEl(d.createdAt.toISOString())}</Text>
          </View>
          <Text style={s.h1}>{p.name.toUpperCase()}</Text>
          <Text style={s.hSub}>ΑΦΜ {p.afm ?? '—'} · {p.legalForm ?? '—'} · {[p.region.dimos, p.region.periferia].filter(Boolean).join(', ') || '—'}</Text>
          <Text style={[s.hProgram, { marginTop: 8 }]}>{sm.programs.length} προγράμματα · {sm.counts.total} δικαιολογητικά ({sm.counts.common} κοινά σε περισσότερα από ένα)</Text>
        </View>

        <View style={s.body}>
          <Text style={[s.h2, { marginTop: 0 }]}>ΠΙΘΑΝΟΤΗΤΑ ΕΝΤΑΞΗΣ ΑΝΑ ΠΡΟΓΡΑΜΜΑ</Text>
          <View style={[s.tr, { paddingVertical: 4 }]}>
            <Text style={[s.th, { width: '50%' }]}>ΠΡΟΓΡΑΜΜΑ</Text>
            <Text style={[s.th, { width: '22%' }]}>ΠΙΘΑΝΟΤΗΤΑ</Text>
            <Text style={[s.th, { width: '16%' }]}>ΕΚΤΙΜΗΣΗ</Text>
            <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>ΛΗΞΗ</Text>
          </View>
          {sm.programs.map(pr => (
            <View key={pr.assessmentId} style={s.tr} wrap={false}>
              <Text style={{ width: '50%', fontSize: 8.5, fontWeight: 700, paddingRight: 8 }}>{pr.title}</Text>
              <View style={{ width: '22%', paddingRight: 10 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: C.navy, marginBottom: 2 }}>{pr.probability}%</Text>
                <Bar pct={pr.probability} color={pr.probability >= 60 ? C.ok : pr.probability >= 35 ? C.warn : C.bad} />
              </View>
              <View style={{ width: '16%' }}><Pill label={VERDICT[pr.verdict].label.replace(' ΥΠΟ ΠΡΟΫΠΟΘΕΣΕΙΣ', ' (ΟΡΟΙ)')} fg={VERDICT[pr.verdict].fg} bg={VERDICT[pr.verdict].bg} /></View>
              <Text style={{ width: '12%', fontSize: 8, textAlign: 'right', color: C.fg2 }}>{dateEl(pr.submissionEnd)}</Text>
            </View>
          ))}

          <Text style={s.h2} minPresenceAhead={80}>ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ ΓΙΑ ΟΛΑ ΤΑ ΠΡΟΓΡΑΜΜΑΤΑ</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
            <Fact label="Συνολικά" value={String(sm.counts.total)} sub="μοναδικά δικαιολογητικά" />
            <Fact label="Κοινά" value={String(sm.counts.common)} sub="σε 2+ προγράμματα — μία φορά για όλα" />
            <Fact label="Υπάρχουν ήδη" value={String(sm.counts.ok)} sub="σε ισχύ στην επιχείρηση" />
            <Fact label="Θέλουν ενέργεια" value={String(sm.counts.toDo)} sub="έκδοση, ανανέωση ή σύνταξη" />
          </View>
          <View style={[s.tr, { paddingVertical: 4 }]}>
            <Text style={[s.th, { width: '38%' }]}>ΔΙΚΑΙΟΛΟΓΗΤΙΚΟ</Text>
            <Text style={[s.th, { width: '16%' }]}>ΠΟΥ ΕΚΔΙΔΕΤΑΙ</Text>
            <Text style={[s.th, { width: '32%' }]}>ΓΙΑ ΤΑ ΠΡΟΓΡΑΜΜΑΤΑ</Text>
            <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>ΚΑΤΑΣΤΑΣΗ</Text>
          </View>
          {sm.docs.map((doc, i) => (
            <View key={`${doc.name}-${i}`} style={s.tr} wrap={false}>
              <View style={{ width: '38%', paddingRight: 8 }}>
                <Text style={{ fontSize: 8.5, fontWeight: 700 }}>{doc.name}</Text>
                {doc.notes[0] ? <Text style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>{doc.notes[0].slice(0, 140)}</Text> : null}
              </View>
              <Text style={{ width: '16%', fontSize: 8, color: C.fg2, paddingRight: 6 }}>{doc.issuer ?? '—'}</Text>
              <Text style={{ width: '32%', fontSize: 7.5, color: C.fg2, paddingRight: 6 }}>
                {doc.programs.length > 1 ? `Κοινό σε ${doc.programs.length}: ` : ''}{doc.programs.map(short).join(' · ')}
              </Text>
              <View style={{ width: '14%', alignItems: 'flex-end' }}><Pill {...REQ_DOC[doc.status]} /></View>
            </View>
          ))}

          <View style={[s.card, { marginTop: 18, backgroundColor: C.navy50, borderColor: C.navy50 }]} wrap={false}>
            <Text style={{ fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 9.5, color: C.navy, marginBottom: 4 }}>ΜΕΘΟΔΟΛΟΓΙΑ</Text>
            <Text style={[s.para, { fontSize: 7.5 }]}>
              Κάθε πρόγραμμα αξιολογήθηκε χωριστά βάσει των κριτηρίων επιλεξιμότητας και του επίσημου οδηγού του. Τα δικαιολογητικά που ζητούν
              περισσότερα από ένα προγράμματα εμφανίζονται μία φορά — εκδίδονται μία φορά και χρησιμοποιούνται σε όλα, εφόσον είναι σε ισχύ κατά
              την υποβολή. Οι πιθανότητες είναι εκτιμήσεις και δεν αποτελούν δέσμευση έγκρισης.
            </Text>
          </View>
        </View>
        <Footer company={p.name} />
      </Page>
    </Document>
  )
}

/** PDF συνολικής ανάλυσης (όλες οι αξιολογήσεις πρέπει να είναι ολοκληρωμένες και για την ίδια επιχείρηση). */
export async function combinedPdfByIds(ids: string[]): Promise<{ pdf: Buffer; fileName: string; companyName: string; trdrId: string; programTitles: string[] } | null> {
  const { prisma } = await import('@/lib/prisma')
  const { summarizeCombined } = await import('./combine')
  const rows = await prisma.eligibilityAssessment.findMany({ where: { id: { in: ids.slice(0, 12) } }, include: { program: { select: { title: true, submissionEnd: true } } }, orderBy: { createdAt: 'desc' } })
  if (!rows.length || rows.some(r => r.status !== 'DONE' || !r.result) || new Set(rows.map(r => r.trdrId)).size !== 1) return null
  const profile = ((rows[0].inputSnapshot ?? {}) as { profile?: CompanyProfile }).profile
  if (!profile) return null
  const summary = summarizeCombined(rows.map(r => ({ assessmentId: r.id, title: r.program.title, submissionEnd: r.program.submissionEnd?.toISOString() ?? null, result: r.result as unknown as AssessmentResult })))
  ensureFonts()
  const pdf = await renderToBuffer(<CombinedDocument d={{ createdAt: new Date(), profile, summary }} />)
  const safe = profile.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60)
  return { pdf, fileName: `Συνολική-αξιολόγηση-${safe}.pdf`, companyName: profile.name, trdrId: rows[0].trdrId, programTitles: rows.map(r => r.program.title) }
}
