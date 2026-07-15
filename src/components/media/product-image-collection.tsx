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
  /** thumbnail px, default 44 (compact row) — overlap ~30% */
  size?: number
  /** πόσα ορατά πριν το "+N", default 8 */
  max?: number
}

const HOVER_DELAY_MS = 150
const OVERLAP_RATIO = 0.3
const PREVIEW_SIZE = 800

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
              className="flex shrink-0 list-none items-center justify-center rounded-[10px] border border-border bg-muted text-[12px] font-semibold text-muted-foreground ring-2 ring-card"
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
    transform: !prefersReducedMotion && isDragging
      ? `${transformString ?? ''} scale(1.05)`.trim()
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
          'block cursor-grab touch-none overflow-hidden rounded-[10px] border border-border bg-card ring-2 ring-card outline-none focus-visible:ring-2 focus-visible:ring-(--ring) active:cursor-grabbing',
          isDragging && 'shadow-lg',
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

function HoverPreview({
  anchorRef,
  image,
  prefersReducedMotion,
}: {
  anchorRef: RefObject<HTMLElement | null>
  image: CollectionImage
  prefersReducedMotion: boolean
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return

    const GAP = 12
    const CARD_PADDING = 8
    const CAPTION_HEIGHT = image.alt ? 24 : 0
    const cardWidth = PREVIEW_SIZE + CARD_PADDING * 2
    const cardHeight = PREVIEW_SIZE + CARD_PADDING * 2 + CAPTION_HEIGHT

    const rect = anchor.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Προτίμηση: κάτω από το thumb, στοιχισμένο αριστερά με αυτό. Αν δεν χωράει, γύρνα από πάνω.
    let top = rect.bottom + GAP
    if (top + cardHeight > viewportHeight) {
      const above = rect.top - GAP - cardHeight
      top = above >= 8 ? above : Math.max(8, viewportHeight - cardHeight - 8)
    }

    let left = rect.left
    if (left + cardWidth > viewportWidth) left = viewportWidth - cardWidth - 8
    if (left < 8) left = 8
    if (top < 8) top = 8

    setPosition({ top, left })
  }, [anchorRef, image.alt])

  if (!position) return null

  return createPortal(
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none fixed z-50 flex flex-col items-center gap-1.5 rounded-[10px] border border-border bg-card p-2 shadow-lg',
        !prefersReducedMotion && 'animate-in fade-in-0 zoom-in-95 duration-150',
      )}
      style={{ top: position.top, left: position.left }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bunnyPreviewUrl(image.url)}
        alt=""
        width={PREVIEW_SIZE}
        height={PREVIEW_SIZE}
        className="rounded-[6px] object-contain"
        style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
      />
      {image.alt && <span className="text-center text-[12px] text-muted-foreground">{image.alt}</span>}
    </div>,
    document.body,
  )
}
