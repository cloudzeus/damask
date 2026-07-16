/** Κοινοί τύποι Media Gallery — χρησιμοποιούνται από /api/media/list, τις server
 * actions του /media, τη σελίδα Media Gallery και το επαναχρησιμοποιήσιμο MediaPicker. */

export type MediaKind = 'IMAGE' | 'VIDEO' | 'MODEL_3D' | 'FILE'

export const MEDIA_KINDS: MediaKind[] = ['IMAGE', 'VIDEO', 'MODEL_3D', 'FILE']

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  IMAGE: 'Εικόνα',
  VIDEO: 'Βίντεο',
  MODEL_3D: '3D μοντέλο',
  FILE: 'Αρχείο',
}

export type MediaAssetDTO = {
  id: string
  name: string
  url: string
  type: MediaKind
  size: number | null
  mimeType: string | null
  folderId: string | null
  alt: string | null
  createdAt: string
}

export type MediaFolderDTO = {
  id: string
  name: string
  parentId: string | null
  /** Πλήθος αρχείων απευθείας μέσα στον φάκελο (όχι σε υποφακέλους). */
  assetCount: number
  /** Πλήθος άμεσων υποφακέλων — μαζί με το assetCount καθορίζει αν είναι "άδειος" για διαγραφή. */
  childCount: number
}

export type MediaListResponse = {
  folders: MediaFolderDTO[]
  assets: MediaAssetDTO[]
}

/** Ό,τι επιστρέφει το MediaPicker στο onSelect — ελάχιστο shape, ίδιο ανεξαρτήτως tab (Gallery/Upload). */
export type PickedAsset = { id: string; url: string; name: string; type: MediaKind }

export function formatMediaBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Ελάχιστο/μέγιστο πλάτος thumbnail (px) — αντιστοιχεί στο εύρος του slider μεγέθους στο /media. */
export const THUMB_SIZE_MIN = 80
export const THUMB_SIZE_MAX = 280

/**
 * Bunny Optimizer `?width=` param για γρήγορα thumbnails — μόνο σε IMAGE (video
 * preview κάνει δικό του πράγμα με `<video preload="metadata">`, τα υπόλοιπα
 * είναι εικονίδια). Το cdnUrl στη DB είναι πάντα καθαρό χωρίς query string (βλ.
 * api/media/upload/route.ts), άρα πάντα ασφαλές να προσθέσουμε `?width=`.
 * ×2 για retina, με ανώτατο όριο ώστε να μη ζητάμε ποτέ ένα τεράστιο resize.
 */
export function mediaThumbUrl(asset: Pick<MediaAssetDTO, 'url' | 'type'>, widthPx: number): string {
  if (asset.type !== 'IMAGE') return asset.url
  const width = Math.round(Math.min(Math.max(widthPx * 2, 160), 640))
  return `${asset.url}?width=${width}`
}

export type MediaFolderNode = MediaFolderDTO & { children: MediaFolderNode[] }

/** Επίπεδη λίστα φακέλων -> δέντρο (root πρώτα, αλφαβητικά — findMany ήδη orderBy name asc). */
export function buildFolderTree(folders: MediaFolderDTO[]): MediaFolderNode[] {
  const byParent = new Map<string | null, MediaFolderDTO[]>()
  for (const folder of folders) {
    const siblings = byParent.get(folder.parentId) ?? []
    siblings.push(folder)
    byParent.set(folder.parentId, siblings)
  }
  function build(parentId: string | null): MediaFolderNode[] {
    return (byParent.get(parentId) ?? []).map(folder => ({ ...folder, children: build(folder.id) }))
  }
  return build(null)
}
