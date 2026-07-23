/**
 * Pure ΓΕΜΗ (opendata-api.businessportal.gr) → Trdr mapper. NO fetch/prisma/
 * clock imports here — unit-testable in isolation (tests/trdr-gemi-map.test.ts).
 * The network client (src/lib/trdr/gemi.ts) re-exports mapGemiCompany.
 *
 * Ported + adapted from ref pb-ref lib/gemi.ts `mapGemiCompany` (Company →
 * Company shape) to our Trdr shape (prisma/schema.prisma): SoftOne-mirrored
 * fields keep their SoftOne casing (NAME/ADDRESS/ZIP/CITY/EMAIL/ISACTIVE) —
 * app-only ΓΕΜΗ extras stay camelCase (arGemi/gemiOffice/gemiStatus/…).
 */

import { ensurePrimaryActivity } from '@/lib/registries/kad-pure'

/** Subset of the raw /companies/{arGemi} response — see the ΓΕΜΗ swagger spec for the full schema. */
export type GemiCompanyRaw = {
  arGemi?: string | number | null
  afm?: string | null
  coNameEl?: string | null
  coTitlesEl?: string[] | null
  status?: { id?: number; descr?: string; isActive?: boolean } | null
  city?: string | null
  street?: string | null
  streetNumber?: string | null
  zipCode?: string | null
  email?: string | null
  isBranch?: boolean | null
  objective?: string | null
  legalType?: { id?: number; descr?: string } | null
  gemiOffice?: { id?: number; descr?: string } | null
  prefecture?: { id?: string; descr?: string } | null
  municipality?: { id?: string; descr?: string } | null
  incorporationDate?: string | null
  lastStatusChange?: string | null
  autoRegistered?: boolean | null
  activities?: Array<{
    activity?: { id?: string; descr?: string } | null
    type?: string | null
    dtFrom?: string | null
    dtTo?: string | null
  }> | null
}

export type GemiTrdrActivity = {
  code: string
  description: string
  kind: 'PRIMARY' | 'SECONDARY'
  order: number
}

export type GemiTrdrPatch = {
  NAME: string
  ADDRESS: string | null
  ZIP: string | null
  CITY: string | null
  /** Μόνο όταν το ΓΕΜΗ επιστρέφει email — απουσία key (ΟΧΙ null) ώστε μια
   * μεταγενέστερη merge/spread να ΜΗΝ σβήσει ένα ήδη υπάρχον EMAIL του Trdr. */
  EMAIL?: string | null
  arGemi: string | null
  gemiOffice: string | null
  gemiStatus: string | null
  gemiObjective: string | null
  gemiIsBranch: boolean | null
  gemiAutoRegistered: boolean | null
  gemiLastStatusChange: Date | null
  foundingDate: Date | null
  appLegalForm: string | null
  ISACTIVE: number
  activities: GemiTrdrActivity[]
}

function toDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Maps a raw ΓΕΜΗ Company payload into a Trdr-shaped patch (+ resolved activities). */
export function mapGemiCompany(c: GemiCompanyRaw): GemiTrdrPatch {
  const addr = [c.street, c.streetNumber].filter(Boolean).join(' ').trim()
  const arGemiStr = c.arGemi != null ? String(c.arGemi) : null

  const activities = ensurePrimaryActivity(
    (c.activities ?? [])
      .filter((a): a is { activity: { id: string; descr?: string }; type?: string | null } => Boolean(a?.activity?.id))
      .map((a, i) => ({
        code: String(a.activity.id),
        description: a.activity.descr ?? '',
        // ΓΕΜΗ activity.type: "1" κύρια, οτιδήποτε άλλο δευτερεύουσα (ίδια σύμβαση με ΑΑΔΕ firm_act_kind).
        kind: (a.type === '1' ? 'PRIMARY' : 'SECONDARY') as 'PRIMARY' | 'SECONDARY',
        order: i,
      })),
  )

  const patch: GemiTrdrPatch = {
    NAME: c.coNameEl ?? '',
    ADDRESS: addr || null,
    ZIP: c.zipCode || null,
    CITY: c.city || c.municipality?.descr || null,
    arGemi: arGemiStr,
    gemiOffice: c.gemiOffice?.descr ?? null,
    gemiStatus: c.status?.descr ?? null,
    gemiObjective: c.objective ?? null,
    gemiIsBranch: c.isBranch ?? null,
    gemiAutoRegistered: c.autoRegistered ?? null,
    gemiLastStatusChange: toDate(c.lastStatusChange),
    foundingDate: toDate(c.incorporationDate),
    appLegalForm: c.legalType?.descr ?? null,
    ISACTIVE: c.status?.isActive === false ? 0 : 1,
    activities,
  }
  if (c.email) patch.EMAIL = c.email

  return patch
}
