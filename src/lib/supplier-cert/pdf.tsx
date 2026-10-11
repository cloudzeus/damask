import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { ensureFonts } from '@/lib/assessment/pdf'
import { certParagraphs, fmtDate, type CertData } from './content'

/**
 * (Plain module.) PDF «Βεβαίωσης προμηθευτή» — ουδέτερο, επαγγελματικό επιστολόχαρτο ΤΟΥ ΠΡΟΜΗΘΕΥΤΗ (όχι WWA):
 * λογότυπο του προμηθευτή (αν το ανέβασε) + στοιχεία του επάνω, κείμενο, πίνακας ειδών, δηλώσεις, τόπος/ημερομηνία
 * και περιοχή υπογραφής με την ιδιόχειρη υπογραφή και/ή τη σφραγίδα.
 */

const ink = '#111827'
const muted = '#4B5563'
const rule = '#D1D5DB'
const accent = '#1F2937'

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 48, fontFamily: 'Roboto', fontSize: 10, color: ink, lineHeight: 1.45 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: rule, marginBottom: 18 },
  logo: { maxWidth: 150, maxHeight: 60, objectFit: 'contain' },
  headText: { textAlign: 'right', fontSize: 8.5, color: muted, maxWidth: 300 },
  headName: { fontSize: 11, fontWeight: 700, color: ink, marginBottom: 2 },
  title: { fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 17, textAlign: 'center', letterSpacing: 0.6, color: accent },
  subtitle: { textAlign: 'center', fontSize: 9, color: muted, marginTop: 2, marginBottom: 16 },
  p: { marginBottom: 8, textAlign: 'justify' },
  verb: { textAlign: 'center', fontWeight: 700, letterSpacing: 2, marginVertical: 6 },
  table: { borderWidth: 1, borderColor: rule, marginVertical: 8 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: rule },
  th: { backgroundColor: '#F3F4F6', fontWeight: 700, fontSize: 8.5, padding: 5 },
  td: { fontSize: 9, padding: 5 },
  c1: { width: '7%' }, c2: { width: '17%' }, c3: { width: '42%' }, c4: { width: '12%', textAlign: 'right' }, c5: { width: '22%' },
  note: { fontSize: 8.5, color: muted, marginBottom: 8 },
  decl: { flexDirection: 'row', marginBottom: 5 },
  declNo: { width: 16, fontWeight: 700 },
  declText: { flex: 1, textAlign: 'justify' },
  closing: { marginTop: 8, fontSize: 9.5, color: muted, textAlign: 'justify' },
  sign: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  signBox: { width: 230, alignItems: 'center' },
  signArea: { height: 90, width: 230, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  // Ρητές διαστάσεις: στο react-pdf μια absolute εικόνα μόνο με max-* βγαίνει μηδενικού μεγέθους.
  signImg: { position: 'absolute', top: 5, left: 15, width: 200, height: 80, objectFit: 'contain' },
  stampImg: { position: 'absolute', top: 2, left: 55, width: 120, height: 86, objectFit: 'contain', opacity: 0.9 },
  signLine: { borderTopWidth: 1, borderTopColor: ink, width: 210, marginTop: 2, paddingTop: 4, textAlign: 'center', fontSize: 9 },
  footer: { position: 'absolute', bottom: 22, left: 48, right: 48, fontSize: 7.5, color: '#9CA3AF', textAlign: 'center' },
})

export type CertImages = { logo?: string | null; signature?: string | null; stamp?: string | null }

export function SupplierCertDocument({ data, signer, signedAt, images }: { data: CertData; signer: { name?: string | null; title?: string | null }; signedAt?: string | null; images: CertImages }) {
  const t = certParagraphs(data, signer)
  return (
    <Document title={`Βεβαίωση προμηθευτή — ${data.invoiceNumber}`} author={data.supplier.name}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image (όχι <img>), δεν δέχεται alt */}
          {images.logo ? <Image src={images.logo} style={s.logo} /> : <Text style={s.headName}>{data.supplier.name}</Text>}
          <View style={s.headText}>
            {images.logo && <Text style={s.headName}>{data.supplier.name}</Text>}
            <Text>ΑΦΜ {data.supplier.afm || '—'}{data.supplier.doy ? ` · ΔΟΥ ${data.supplier.doy}` : ''}</Text>
            {data.supplier.address ? <Text>{data.supplier.address}</Text> : null}
          </View>
        </View>

        <Text style={s.title}>{t.title}</Text>
        <Text style={s.subtitle}>({t.subtitle})</Text>

        <Text style={s.p}>{t.intro}</Text>
        <Text style={s.verb}>{t.verb}</Text>
        <Text style={s.p}>{t.sale}</Text>

        <View style={s.table}>
          <View style={s.tr} fixed>
            <Text style={[s.th, s.c1]}>Α/Α</Text>
            <Text style={[s.th, s.c2]}>Κωδικός</Text>
            <Text style={[s.th, s.c3]}>Περιγραφή (μάρκα / μοντέλο)</Text>
            <Text style={[s.th, s.c4]}>Ποσότητα</Text>
            <Text style={[s.th, s.c5]}>Σειριακός αριθμός</Text>
          </View>
          {data.items.map((it, i) => (
            <View key={i} style={[s.tr, i === data.items.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              <Text style={[s.td, s.c1]}>{i + 1}</Text>
              <Text style={[s.td, s.c2]}>{it.code || '—'}</Text>
              <Text style={[s.td, s.c3]}>{it.description}</Text>
              <Text style={[s.td, s.c4]}>{it.quantity}{it.unit ? ` ${it.unit}` : ''}</Text>
              <Text style={[s.td, s.c5]}>{it.serial.trim() || '—'}</Text>
            </View>
          ))}
        </View>
        {t.noSerialNote && <Text style={s.note}>{t.noSerialNote}</Text>}

        <Text style={s.p}>{t.declarationsLead}</Text>
        {t.declarations.map((d, i) => (
          <View key={i} style={s.decl} wrap={false}>
            <Text style={s.declNo}>{i + 1}.</Text>
            <Text style={s.declText}>{d}</Text>
          </View>
        ))}
        <Text style={s.closing}>{t.closing}</Text>

        <View style={s.sign} wrap={false}>
          <Text>{data.place || '……………'}, {signedAt ? fmtDate(signedAt) : '……/……/………'}</Text>
          <View style={s.signBox}>
            <Text style={{ fontWeight: 700, marginBottom: 2 }}>{data.issuerRole === 'manufacturer' ? 'Για τον Οίκο Κατασκευής' : 'Για τον Προμηθευτή'}</Text>
            <View style={s.signArea}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image (όχι <img>), δεν δέχεται alt */}
              {images.stamp ? <Image src={images.stamp} style={s.stampImg} /> : null}
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image (όχι <img>), δεν δέχεται alt */}
              {images.signature ? <Image src={images.signature} style={s.signImg} /> : null}
            </View>
            <Text style={s.signLine}>
              {signer.name?.trim() ? `${signer.name.trim()}${signer.title?.trim() ? ` — ${signer.title.trim()}` : ''}` : '(σφραγίδα & υπογραφή)'}
            </Text>
          </View>
        </View>

        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Σελίδα ${pageNumber} / ${totalPages}` : '')} />
      </Page>
    </Document>
  )
}

export async function renderSupplierCertPdf(input: { data: CertData; signer: { name?: string | null; title?: string | null }; signedAt?: string | null; images: CertImages }): Promise<Buffer> {
  ensureFonts()
  return renderToBuffer(<SupplierCertDocument {...input} />)
}
