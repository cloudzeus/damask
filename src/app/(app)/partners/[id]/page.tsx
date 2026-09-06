import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { assertObjectEnabled } from '@/lib/objects-server'
import { prisma } from '@/lib/prisma'
import { getMapsClientConfig } from '../actions'
import { getPartnerFormOptions } from '@/lib/s1-options'
import { PartnerHeader } from './partner-header'
import { PartnerDetailTabs } from './partner-detail-tabs'
import { PartnerInfoCard } from './partner-info-card'
import { PartnerMapCard } from './partner-map-card'
import { ContactsPanel, type ContactRow } from './contacts-panel'
import { FinancialsTab } from '@/components/tax/financials-tab'
import { TrdrProgramsPanel } from '@/components/pm/trdr-programs-panel'
import { CommunicationTimeline } from '@/components/communications/communication-timeline'
import { FileBrowser } from '@/components/trdr/file-browser'
import {
  GemiAadeCard, TrdrKadCard, TrdrDocumentsCard, type TrdrKadRow, type TrdrDocumentRow,
} from '@/components/trdr/trdr-enrich-cards'

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('customer.view')
  await assertObjectEnabled('partners')
  const { id } = await params

  const [trdr, mapsConfig, formOptions] = await Promise.all([
    prisma.trdr.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
        kads: { orderBy: [{ kind: 'asc' }, { order: 'asc' }] },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    }),
    getMapsClientConfig(),
    getPartnerFormOptions(),
  ])

  if (!trdr) notFound()

  // Display-only lookups των S1 combo κωδικών σε ονόματα (info card) — soft
  // reference, όχι Prisma relation (βλ. σχόλιο Trdr στο schema.prisma).
  const [country, irsdata, trdCategory, payment, shipment] = await Promise.all([
    trdr.COUNTRY != null ? prisma.country.findUnique({ where: { COUNTRY: trdr.COUNTRY } }) : null,
    trdr.IRSDATA ? prisma.irsdata.findFirst({ where: { CODE: trdr.IRSDATA } }) : null,
    trdr.TRDCATEGORY != null ? prisma.trdCategory.findUnique({ where: { TRDCATEGORY: trdr.TRDCATEGORY } }) : null,
    trdr.PAYMENT != null ? prisma.s1Payment.findUnique({ where: { PAYMENT: trdr.PAYMENT } }) : null,
    trdr.SHIPMENT != null ? prisma.shipment.findUnique({ where: { SHIPMENT: trdr.SHIPMENT } }) : null,
  ])

  const contactIds = trdr.contacts.map(c => c.id)
  const pendingRequests = contactIds.length > 0
    ? await prisma.accessRequest.findMany({ where: { contactId: { in: contactIds }, status: 'PENDING' }, select: { contactId: true } })
    : []
  const pendingContactIds = new Set(pendingRequests.map(r => r.contactId))

  const contactRows: ContactRow[] = trdr.contacts.map(c => ({
    id: c.id,
    name: c.name,
    position: c.position,
    email: c.email,
    phone: c.phone,
    mobile: c.mobile,
    isPrimary: c.isPrimary,
    hasUser: c.userId !== null,
    hasPendingRequest: pendingContactIds.has(c.id),
  }))

  // «Άδεια λειτουργίας» flag ανά ΚΑΔ (W1 KadLicenseRequirement) — join server-side.
  const kadCodes = trdr.kads.map(k => k.code)
  const licenseRows = kadCodes.length > 0
    ? await prisma.kadLicenseRequirement.findMany({ where: { code: { in: kadCodes } }, select: { code: true } })
    : []
  const licensedCodes = new Set(licenseRows.map(r => r.code))

  const kadRows: TrdrKadRow[] = trdr.kads.map(k => ({
    id: k.id,
    code: k.code,
    description: k.description,
    kind: k.kind,
    licensed: licensedCodes.has(k.code),
  }))

  const documentRows: TrdrDocumentRow[] = trdr.documents.map(d => ({
    id: d.id,
    title: d.title,
    docKind: d.docKind,
    createdAtLabel: d.createdAt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    downloadable: d.storageKey !== null,
  }))

  const dateLabel = (d: Date | null) => d ? d.toLocaleDateString('el-GR') : null
  const dateTimeLabel = (d: Date | null) => d ? d.toLocaleString('el-GR', { dateStyle: 'medium', timeStyle: 'short' }) : null

  const canEdit = can(session, 'customer.edit')
  const canManagePrograms = can(session, 'programs.manage')

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-[0.71875rem] font-semibold text-muted-foreground">
        <Link href="/partners" className="hover:underline">Συναλλασσόμενοι</Link>
        <span aria-hidden>›</span>
        <b className="text-foreground">{trdr.NAME}</b>
      </div>

      <PartnerHeader
        partner={{
          id: trdr.id,
          sodtype: trdr.SODTYPE,
          isProsp: trdr.ISPROSP === 1,
          name: trdr.NAME,
          afm: trdr.AFM,
          irsdata: trdr.IRSDATA,
          jobtypetrd: trdr.JOBTYPETRD,
          legalForm: trdr.appLegalForm,
          email: trdr.EMAIL,
          emailAcc: trdr.EMAILACC,
          phone: trdr.PHONE01,
          phone2: trdr.PHONE02,
          website: trdr.WEBPAGE,
          address: trdr.ADDRESS,
          city: trdr.CITY,
          zip: trdr.ZIP,
          country: trdr.COUNTRY,
          trdCategory: trdr.TRDCATEGORY,
          payment: trdr.PAYMENT,
          shipment: trdr.SHIPMENT,
          lat: trdr.appLat,
          lng: trdr.appLng,
          employees: trdr.appEmployees,
          annualRevenue: trdr.appAnnualRevenue != null ? Number(trdr.appAnnualRevenue) : null,
          notes: trdr.appNotes,
          referrerId: trdr.referrerId,
        }}
        logoUrl={trdr.appLogoUrl}
        mapsConfig={mapsConfig}
        formOptions={formOptions}
      />

      <div className="mt-3">
        <PartnerDetailTabs
          info={
            <PartnerInfoCard
              trdrId={trdr.id}
              afm={trdr.AFM}
              irsdataName={irsdata?.NAME ?? trdr.IRSDATA}
              legalForm={trdr.appLegalForm}
              jobtypetrd={trdr.JOBTYPETRD}
              address={trdr.ADDRESS}
              city={trdr.CITY}
              zip={trdr.ZIP}
              countryName={country?.NAME ?? null}
              trdCategoryName={trdCategory?.NAME ?? null}
              paymentName={payment?.NAME ?? null}
              shipmentName={shipment?.NAME ?? null}
              phone={trdr.PHONE01}
              phone2={trdr.PHONE02}
              emailAcc={trdr.EMAILACC}
              employees={trdr.appEmployees}
              annualRevenue={trdr.appAnnualRevenue != null ? Number(trdr.appAnnualRevenue) : null}
              email={trdr.EMAIL}
              website={trdr.WEBPAGE}
            />
          }
          gemi={
            <GemiAadeCard
              trdrId={trdr.id}
              name={trdr.NAME}
              afm={trdr.AFM}
              arGemi={trdr.arGemi}
              gemiOffice={trdr.gemiOffice}
              gemiStatus={trdr.gemiStatus}
              foundingDate={dateLabel(trdr.foundingDate)}
              aadeStatus={trdr.aadeStatus}
              aadeFirmKind={trdr.aadeFirmKind}
              gemiSyncedAt={dateTimeLabel(trdr.gemiSyncedAt)}
              aadeSyncedAt={dateTimeLabel(trdr.aadeSyncedAt)}
            />
          }
          kad={<TrdrKadCard kads={kadRows} trdrId={trdr.id} afm={trdr.AFM} canEdit={canEdit} />}
          docs={<TrdrDocumentsCard trdrId={trdr.id} arGemi={trdr.arGemi} documents={documentRows} />}
          files={<FileBrowser trdrId={trdr.id} canEdit={can(session, 'customer.edit')} />}
          map={
            <PartnerMapCard
              id={trdr.id}
              lat={trdr.appLat}
              lng={trdr.appLng}
              maptilerApiKey={mapsConfig.maptilerApiKey}
              editable={canEdit}
            />
          }
          contacts={<ContactsPanel trdrId={trdr.id} contacts={contactRows} />}
          comm={
            <CommunicationTimeline
              trdrId={trdr.id}
              defaultTo={trdr.EMAIL ?? undefined}
              canSend={canEdit}
            />
          }
        />
      </div>

      <div className="mt-3">
        <FinancialsTab trdrId={trdr.id} trdrName={trdr.NAME} />
      </div>

      <div className="mt-3">
        <TrdrProgramsPanel trdrId={trdr.id} canManage={canManagePrograms} />
      </div>
    </div>
  )
}
