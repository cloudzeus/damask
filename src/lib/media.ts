import { prisma } from '@/lib/prisma'
import type { Prisma, MediaType } from '@prisma/client'
import { MEDIA_KINDS, type MediaListResponse } from '@/components/media/media-types'

export type MediaListFilters = {
  folderId?: string | null
  type?: string | null
  q?: string | null
}

/**
 * Λίστα φακέλων (πάντα όλο το δέντρο, ανεξάρτητα από τα φίλτρα — είναι μικρό
 * σύνολο) + αρχεία φιλτραρισμένα κατά folderId/type/q. Κοινή πηγή αλήθειας
 * για τη σελίδα /media (server-rendered πρώτο render) ΚΑΙ το /api/media/list
 * route (client-side re-fetch σε κάθε αλλαγή φίλτρου/mutation, καθώς και το
 * MediaPicker από οπουδήποτε στην εφαρμογή).
 */
export async function getMediaList(filters: MediaListFilters = {}): Promise<MediaListResponse> {
  const where: Prisma.MediaAssetWhereInput = {}
  if (filters.folderId) where.folderId = filters.folderId
  if (filters.type && MEDIA_KINDS.includes(filters.type as MediaType)) where.type = filters.type as MediaType
  const q = filters.q?.trim()
  if (q) where.name = { contains: q, mode: 'insensitive' }

  const [folders, assets] = await Promise.all([
    prisma.mediaFolder.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true, children: true } } },
    }),
    prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ])

  return {
    folders: folders.map(f => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      assetCount: f._count.assets,
      childCount: f._count.children,
    })),
    assets: assets.map(a => ({
      id: a.id,
      name: a.name,
      url: a.cdnUrl,
      type: a.type,
      size: a.size,
      mimeType: a.mimeType,
      folderId: a.folderId,
      alt: a.alt,
      createdAt: a.createdAt.toISOString(),
    })),
  }
}
