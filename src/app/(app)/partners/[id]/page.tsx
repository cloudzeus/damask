import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { getMapsClientConfig } from '../actions'
import { getPartnerFormOptions } from '@/lib/s1-options'
import { PartnerHeader } from './partner-header'
import { PartnerInfoCard } from './partner-info-card'
import { PartnerMapCard } from './partner-map-card'
import { ContactsPanel, type ContactRow } from './contacts-panel'

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('customer.view')
  const { id } = await params

  const [trdr, mapsConfig, formOptions] = await Promise.all([
    prisma.trdr.findUnique({
      where: { id },
      include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
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

  const canEdit = can(session, 'customer.edit')

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
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
          phone: trdr.PHONE01,
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
          notes: trdr.appNotes,
        }}
        logoUrl={trdr.appLogoUrl}
        mapsConfig={mapsConfig}
        formOptions={formOptions}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PartnerInfoCard
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
          email={trdr.EMAIL}
          website={trdr.WEBPAGE}
        />
        <PartnerMapCard
          id={trdr.id}
          lat={trdr.appLat}
          lng={trdr.appLng}
          maptilerApiKey={mapsConfig.maptilerApiKey}
          editable={canEdit}
        />
      </div>

      <div className="mt-3">
        <ContactsPanel trdrId={trdr.id} contacts={contactRows} />
      </div>
    </div>
  )
}
