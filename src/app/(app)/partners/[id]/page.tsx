import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { getMapsClientConfig } from '../actions'
import { PartnerHeader } from './partner-header'
import { PartnerInfoCard } from './partner-info-card'
import { PartnerMapCard } from './partner-map-card'
import { ContactsPanel, type ContactRow } from './contacts-panel'

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('customer.view')
  const { id } = await params

  const [customer, mapsConfig] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
    }),
    getMapsClientConfig(),
  ])

  if (!customer) notFound()

  const contactIds = customer.contacts.map(c => c.id)
  const pendingRequests = contactIds.length > 0
    ? await prisma.accessRequest.findMany({ where: { contactId: { in: contactIds }, status: 'PENDING' }, select: { contactId: true } })
    : []
  const pendingContactIds = new Set(pendingRequests.map(r => r.contactId))

  const contactRows: ContactRow[] = customer.contacts.map(c => ({
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
        <b className="text-foreground">{customer.name}</b>
      </div>

      <PartnerHeader
        partner={{
          id: customer.id,
          sodtype: customer.sodtype,
          status: customer.status,
          name: customer.name,
          afm: customer.afm,
          doy: customer.doy,
          legalForm: customer.legalForm,
          profession: customer.profession,
          email: customer.email,
          phone: customer.phone,
          website: customer.website,
          address: customer.address,
          city: customer.city,
          zip: customer.zip,
          lat: customer.lat,
          lng: customer.lng,
          notes: customer.notes,
        }}
        logoUrl={customer.logoUrl}
        mapsConfig={mapsConfig}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PartnerInfoCard
          afm={customer.afm}
          doy={customer.doy}
          legalForm={customer.legalForm}
          profession={customer.profession}
          address={customer.address}
          city={customer.city}
          zip={customer.zip}
          phone={customer.phone}
          email={customer.email}
          website={customer.website}
        />
        <PartnerMapCard
          id={customer.id}
          lat={customer.lat}
          lng={customer.lng}
          maptilerApiKey={mapsConfig.maptilerApiKey}
          editable={canEdit}
        />
      </div>

      <div className="mt-3">
        <ContactsPanel customerId={customer.id} contacts={contactRows} />
      </div>
    </div>
  )
}
