import { certParagraphs, fmtDate, type CertData } from '@/lib/supplier-cert/content'

/**
 * Προεπισκόπηση της «Βεβαίωσης προμηθευτή» σε HTML — ίδιο κείμενο/διάταξη με το PDF (src/lib/supplier-cert/pdf.tsx),
 * σε «χαρτί» A4. Ουδέτερο επιστολόχαρτο του προμηθευτή (όχι WWA). Χρησιμοποιείται στη σελίδα υπογραφής και στο γραφείο.
 */
export function CertPreview({ data, logo, signature, stamp, signer, signedAt }: {
  data: CertData
  logo?: string | null
  signature?: string | null
  stamp?: string | null
  signer?: { name?: string | null; title?: string | null }
  signedAt?: string | null
}) {
  const t = certParagraphs(data, signer ?? {})
  return (
    <article className="mx-auto w-full max-w-[760px] rounded-md bg-white p-5 text-[13px] leading-relaxed text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_28px_rgba(0,0,0,.08)] ring-1 ring-slate-200 sm:p-10" lang="el">
      <header className="mb-5 flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- token-gated/blob εικόνα, όχι στατική */}
        {logo ? <img src={logo} alt={`Λογότυπο ${data.supplier.name}`} className="max-h-14 max-w-[150px] object-contain" /> : <b className="text-[14px]">{data.supplier.name}</b>}
        <div className="text-right text-[11px] text-slate-600">
          {logo && <b className="block text-[13px] text-slate-900">{data.supplier.name}</b>}
          <div>ΑΦΜ {data.supplier.afm || '—'}{data.supplier.doy ? ` · ΔΟΥ ${data.supplier.doy}` : ''}</div>
          {data.supplier.address && <div>{data.supplier.address}</div>}
        </div>
      </header>

      <h2 className="text-center font-[family-name:var(--font-display)] text-[19px] font-black tracking-wide">{t.title}</h2>
      <p className="mb-4 text-center text-[11.5px] text-slate-500">({t.subtitle})</p>

      <p className="mb-2 text-justify">{t.intro}</p>
      <p className="my-2 text-center font-bold tracking-[0.2em]">{t.verb}</p>
      <p className="mb-3 text-justify">{t.sale}</p>

      <div className="mb-2 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12px]">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="border border-slate-200 px-2 py-1.5">Α/Α</th>
              <th className="border border-slate-200 px-2 py-1.5">Κωδικός</th>
              <th className="border border-slate-200 px-2 py-1.5">Περιγραφή (μάρκα / μοντέλο)</th>
              <th className="border border-slate-200 px-2 py-1.5 text-right">Ποσότητα</th>
              <th className="border border-slate-200 px-2 py-1.5">Σειριακός αριθμός</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i}>
                <td className="border border-slate-200 px-2 py-1.5 tabular-nums">{i + 1}</td>
                <td className="border border-slate-200 px-2 py-1.5">{it.code || '—'}</td>
                <td className="border border-slate-200 px-2 py-1.5">{it.description}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{it.quantity}{it.unit ? ` ${it.unit}` : ''}</td>
                <td className="border border-slate-200 px-2 py-1.5 break-all">{it.serial.trim() || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.noSerialNote && <p className="mb-3 text-[11.5px] text-slate-500">{t.noSerialNote}</p>}

      <p className="mb-1.5">{t.declarationsLead}</p>
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-justify">
        {t.declarations.map((d, i) => <li key={i}>{d}</li>)}
      </ol>
      <p className="text-justify text-[12px] text-slate-600">{t.closing}</p>

      <footer className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <span>{data.place || '……………'}, {signedAt ? fmtDate(signedAt) : '……/……/………'}</span>
        <div className="w-[240px] text-center">
          <b className="block">{data.issuerRole === 'manufacturer' ? 'Για τον Οίκο Κατασκευής' : 'Για τον Προμηθευτή'}</b>
          <div className="relative grid h-24 place-items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL από τον καμβά/αρχείο */}
            {stamp && <img src={stamp} alt="Σφραγίδα" className="absolute max-h-24 max-w-[130px] object-contain opacity-90" />}
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL από τον καμβά */}
            {signature && <img src={signature} alt="Υπογραφή" className="absolute max-h-20 max-w-[210px] object-contain" />}
          </div>
          <div className="border-t border-slate-900 pt-1 text-[12px]">
            {signer?.name?.trim() ? `${signer.name.trim()}${signer.title?.trim() ? ` — ${signer.title.trim()}` : ''}` : '(σφραγίδα & υπογραφή)'}
          </div>
        </div>
      </footer>
    </article>
  )
}
