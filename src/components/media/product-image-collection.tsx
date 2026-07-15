'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

export type CollectionImage = { id: string; url: string; alt?: string }

type ProductImageCollectionProps = {
  images: CollectionImage[]
  onReorder?: (images: CollectionImage[]) => void
  /** thumbnail px, default 44 (compact row) — overlap ~35% */
  size?: number
  /** πόσα ορατά πριν το "+N", default 8 */
  max?: number
}

const HOVER_DELAY_MS = 150
const OVERLAP_RATIO = 0.35
const PREVIEW_SIZE = 800
/** Κενό ανάμεσα στο preview card και το thumbnail. */
const PREVIEW_GAP = 10
/** Ελάχιστο πλάτος/ύψος εικόνας στο preview όταν σμικραίνει για να χωρέσει από πάνω. */
const PREVIEW_MIN_IMAGE_SIZE = 320
/** Αφαιρείται από τον διαθέσιμο χώρο πάνω από το thumbnail όταν υπολογίζουμε το μέγιστο ύψος του preview. */
const PREVIEW_SHRINK_MARGIN = 16
/** Ελάχιστη απόσταση του preview από τα άκρα του viewport. */
const VIEWPORT_MARGIN = 8

function bunnyPreviewUrl(url: string): string {
  if (!url.startsWith('http')) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}width=${PREVIEW_SIZE}&height=${PREVIEW_SIZE}`
}

function subscribeToReducedMotion(callback: () => void): () => void {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

export function ProductImageCollection({ images, onReorder, size = 44, max = 8 }: ProductImageCollectionProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const showOverflowChip = images.length > max
  const visibleCount = showOverflowChip ? Math.max(max - 1, 1) : images.length
  const visible = images.slice(0, visibleCount)
  const overflowCount = images.length - visible.length

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = images.findIndex(img => img.id === active.id)
    const newIndex = images.findIndex(img => img.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder?.(arrayMove(images, oldIndex, newIndex))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={visible.map(img => img.id)} strategy={horizontalListSortingStrategy}>
        <ul className="flex items-center py-1 pl-1" style={{ paddingRight: showOverflowChip ? size * OVERLAP_RATIO : 0 }}>
          {visible.map((img, index) => (
            <ImageThumb
              key={img.id}
              image={img}
              index={index}
              total={visible.length}
              size={size}
              isDragActive={activeId !== null}
            />
          ))}
          {showOverflowChip && (
            <li
              className="thumb-ring flex shrink-0 list-none items-center justify-center rounded-full bg-muted text-[12px] font-semibold text-muted-foreground"
              style={{ width: size, height: size, marginLeft: -Math.round(size * OVERLAP_RATIO), zIndex: 0 }}
            >
              +{overflowCount}
            </li>
          )}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function ImageThumb({
  image,
  index,
  total,
  size,
  isDragActive,
}: {
  image: CollectionImage
  index: number
  total: number
  size: number
  isDragActive: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id })
  const [showPreview, setShowPreview] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thumbRef = useRef<HTMLButtonElement | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  function clearHoverTimeout() {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }

  function scheduleShow() {
    if (isDragActive) return
    clearHoverTimeout()
    hoverTimeoutRef.current = setTimeout(() => setShowPreview(true), HOVER_DELAY_MS)
  }

  function hidePreview() {
    clearHoverTimeout()
    setShowPreview(false)
  }

  // Το drag ενεργό αγνοεί απευθείας το preview κατά το render (βλ. παρακάτω) — δεν χρειάζεται
  // effect συγχρονισμού· τυχόν προγραμματισμένο timeout που πυροδοτηθεί ενώ σέρνουμε είναι αβλαβές.
  useEffect(() => () => clearHoverTimeout(), [])

  const liStyle: CSSProperties = {
    marginLeft: index === 0 ? 0 : -Math.round(size * OVERLAP_RATIO),
    zIndex: isDragging ? total + 10 : total - index,
  }

  const transformString = transform ? CSS.Transform.toString(transform) : undefined
  const buttonStyle: CSSProperties = {
    width: size,
    height: size,
    // Η μετάφραση (drag-follow) ΠΡΕΠΕΙ να προηγείται του scale — αλλιώς το dnd-kit
    // offset υπολογίζεται σε ήδη-μεγεθυσμένο σύστημα συντεταγμένων και το thumbnail
    // "πηδάει" μακριά από τον κέρσορα.
    transform: !prefersReducedMotion && isDragging
      ? `${transformString ?? ''} scale(1.08)`.trim()
      : transformString,
    transition,
  }

  return (
    <li className="relative shrink-0 list-none" style={liStyle}>
      <button
        ref={node => {
          setNodeRef(node)
          thumbRef.current = node
        }}
        type="button"
        {...attributes}
        {...listeners}
        style={buttonStyle}
        onMouseEnter={scheduleShow}
        onMouseLeave={hidePreview}
        onFocus={scheduleShow}
        onBlur={hidePreview}
        aria-label={`Εικόνα ${index + 1}${image.alt ? ': ' + image.alt : ''} — σύρε ή χρησιμοποίησε βέλη για αναδιάταξη`}
        className={cn(
          'thumb-ring block cursor-grab touch-none overflow-hidden rounded-full bg-card outline-none active:cursor-grabbing',
          // Σκόπιμα outline (όχι Tailwind ring/box-shadow) για το focus indicator: το .thumb-ring
          // είναι unlayered CSS (globals.css, εκτός @layer) οπότε νικάει ΠΑΝΤΑ οποιοδήποτε Tailwind
          // utility πάνω στο ίδιο property (τα utilities ζουν σε @layer utilities) — ένα focus-visible
          // ring/shadow θα ήταν αόρατο πίσω από το ring του avatar. Το outline είναι διαφορετικό
          // property, άρα συνυπάρχει καθαρά. Χρειάζεται ρητά `outline-solid` (όχι bare `outline`) γιατί
          // το `outline-none` καρφώνει το --tw-outline-style σε "none" σε επίπεδο στοιχείου· το bare
          // `outline` απλά διαβάζει ξανά την ίδια (ήδη "none") μεταβλητή, ενώ το `outline-solid` την
          // ξαναδηλώνει "solid" μέσα στο :focus-visible.
          'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring)',
          isDragging && 'is-dragging',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={image.alt ?? ''} className="size-full object-cover" draggable={false} />
      </button>

      {showPreview && !isDragActive && (
        <HoverPreview anchorRef={thumbRef} image={image} prefersReducedMotion={prefersReducedMotion} />
      )}
    </li>
  )
}

type PreviewLayout = {
  top: number
  left: number
  /** Πλευρά της εικόνας preview σε px (τετράγωνη) — 800 εκτός αν σμίκρυνε για να χωρέσει από πάνω. */
  imageSize: number
  /** true = το preview ανοίγει πάνω από το thumbnail (προτεραιότητα)· false = fallback από κάτω. */
  openAbove: boolean
  /** Οριζόντια θέση της άκρης (caret), σε px σχετικά με το αριστερό άκρο της κάρτας. */
  caretLeft: number
}

/**
 * Θέση/μέγεθος του preview tooltip. Προτεραιότητα ΠΑΝΤΑ από πάνω από το thumbnail,
 * οριζόντια κεντραρισμένο πάνω του. Αν το πλήρες 800px preview δεν χωράει από πάνω,
 * σμικραίνει αναλογικά (ελάχιστο 320px) ώστε να συνεχίσει να ανοίγει από πάνω· μόνο
 * όταν ούτε το ελάχιστο μέγεθος χωράει από πάνω, πέφτει σε fallback από κάτω (πλήρες
 * μέγεθος εκεί, με το ίδιο viewport-clamping ως δίχτυ ασφαλείας).
 */
function computePreviewLayout(
  rect: DOMRect,
  hasCaption: boolean,
  viewportWidth: number,
  viewportHeight: number,
): PreviewLayout {
  const CARD_PADDING = 8
  const CARET_MARGIN = 14
  const captionHeight = hasCaption ? 24 : 0
  const chrome = CARD_PADDING * 2 + captionHeight
  const anchorCenterX = rect.left + rect.width / 2

  const fullCardHeight = PREVIEW_SIZE + chrome
  const maxCardHeightAbove = rect.top - PREVIEW_GAP - PREVIEW_SHRINK_MARGIN

  let imageSize = PREVIEW_SIZE
  let openAbove = true
  if (maxCardHeightAbove < fullCardHeight) {
    const candidate = Math.floor(maxCardHeightAbove - chrome)
    if (candidate >= PREVIEW_MIN_IMAGE_SIZE) {
      imageSize = candidate
    } else {
      openAbove = false
    }
  }

  const cardWidth = imageSize + CARD_PADDING * 2
  const cardHeight = imageSize + chrome

  let left = anchorCenterX - cardWidth / 2
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - cardWidth - VIEWPORT_MARGIN)
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft)

  let top: number
  if (openAbove) {
    top = Math.max(VIEWPORT_MARGIN, rect.top - PREVIEW_GAP - cardHeight)
  } else {
    const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - cardHeight)
    top = Math.min(rect.bottom + PREVIEW_GAP, maxTop)
  }

  // Η άκρη ακολουθεί το πραγματικό κέντρο του thumbnail (όχι απαραίτητα το κέντρο της
  // κάρτας) — έτσι δείχνει σωστά ακόμα κι όταν η κάρτα έχει σπρωχτεί από το viewport clamp.
  const caretLeft = Math.min(Math.max(anchorCenterX - left, CARET_MARGIN), Math.max(CARET_MARGIN, cardWidth - CARET_MARGIN))

  return { top, left, imageSize, openAbove, caretLeft }
}

function HoverPreview({
  anchorRef,
  image,
  prefersReducedMotion,
}: {
  anchorRef: RefObject<HTMLElement | null>
  image: CollectionImage
  prefersReducedMotion: boolean
}) {
  const [layout, setLayout] = useState<PreviewLayout | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setLayout(computePreviewLayout(rect, Boolean(image.alt), window.innerWidth, window.innerHeight))
  }, [anchorRef, image.alt])

  if (!layout) return null
  const { top, left, imageSize, openAbove, caretLeft } = layout

  return createPortal(
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none fixed z-50 flex flex-col items-center gap-1.5 rounded-[10px] border border-border bg-card p-2 shadow-lg',
        !prefersReducedMotion && 'animate-in fade-in-0 zoom-in-95 duration-150',
      )}
      style={{ top, left }}
    >
      {/* Caret: μισό τετράγωνο 45° — γεμίζει με bg-card ίδιο με την κάρτα, με border
          μόνο στις 2 ακμές που "κοιτούν" προς το thumbnail, ώστε το περίγραμμα της
          κάρτας να συνεχίζεται οπτικά πάνω στην άκρη. */}
      <span
        aria-hidden
        className={cn(
          'absolute size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border-border bg-card',
          openAbove ? 'border-r border-b' : 'border-l border-t',
        )}
        style={openAbove ? { left: caretLeft, bottom: -5 } : { left: caretLeft, top: -5 }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bunnyPreviewUrl(image.url)}
        alt=""
        width={imageSize}
        height={imageSize}
        className="rounded-[6px] object-contain"
        style={{ width: imageSize, height: imageSize }}
      />
      {image.alt && <span className="text-center text-[12px] text-muted-foreground">{image.alt}</span>}
    </div>,
    document.body,
  )
}
