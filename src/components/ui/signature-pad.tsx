'use client'

import * as React from 'react'
import { Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SignaturePadHandle = { toPng: () => string | null; clear: () => void; isEmpty: () => boolean }

/**
 * Καμβάς ιδιόχειρης υπογραφής (δάχτυλο σε κινητό/tablet, γραφίδα ή ποντίκι). Pointer Events + `touch-action: none`
 * ώστε η σελίδα να μη σκρολάρει όσο υπογράφει κανείς. Ομαλές γραμμές (quadratic curves), ανάλυση οθόνης (DPR).
 * `toPng()` → data URL με διαφανές φόντο, κομμένο στα όρια της υπογραφής.
 */
export const SignaturePad = React.forwardRef<SignaturePadHandle, { className?: string; onChange?: (empty: boolean) => void; label?: string }>(
  function SignaturePad({ className, onChange, label = 'Υπογράψτε εδώ' }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const drawing = React.useRef(false)
    const points = React.useRef<{ x: number; y: number }[]>([])
    const [empty, setEmpty] = React.useState(true)

    const ctx = () => canvasRef.current?.getContext('2d') ?? null

    React.useEffect(() => {
      const c = canvasRef.current
      if (!c) return
      const resize = () => {
        const r = c.getBoundingClientRect()
        const dpr = Math.max(1, window.devicePixelRatio || 1)
        c.width = Math.round(r.width * dpr)
        c.height = Math.round(r.height * dpr)
        const g = c.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.lineCap = 'round'
        g.lineJoin = 'round'
        g.lineWidth = 2.4
        g.strokeStyle = '#0B1F66'
        setEmpty(true)
        onChange?.(true)
      }
      resize()
      const ro = new ResizeObserver(resize)
      ro.observe(c)
      return () => ro.disconnect()
    }, [onChange])

    function pos(e: React.PointerEvent) {
      const r = canvasRef.current!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function down(e: React.PointerEvent) {
      e.preventDefault()
      canvasRef.current?.setPointerCapture(e.pointerId)
      drawing.current = true
      const p = pos(e)
      points.current = [p]
      const g = ctx()
      if (g) { g.beginPath(); g.arc(p.x, p.y, 1.1, 0, Math.PI * 2); g.fillStyle = '#0B1F66'; g.fill() }
    }
    function move(e: React.PointerEvent) {
      if (!drawing.current) return
      const g = ctx()
      if (!g) return
      const p = pos(e)
      const pts = points.current
      pts.push(p)
      if (pts.length >= 3) {
        const [a, b] = [pts[pts.length - 3], pts[pts.length - 2]]
        const mid1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const mid2 = { x: (b.x + p.x) / 2, y: (b.y + p.y) / 2 }
        g.beginPath(); g.moveTo(mid1.x, mid1.y); g.quadraticCurveTo(b.x, b.y, mid2.x, mid2.y); g.stroke()
      }
      if (empty) { setEmpty(false); onChange?.(false) }
    }
    function up() { drawing.current = false; points.current = [] }

    const clear = React.useCallback(() => {
      const c = canvasRef.current
      const g = ctx()
      if (!c || !g) return
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.restore()
      setEmpty(true)
      onChange?.(true)
    }, [onChange])

    React.useImperativeHandle(ref, () => ({
      isEmpty: () => empty,
      clear,
      toPng: () => {
        const c = canvasRef.current
        if (!c || empty) return null
        // Κόψιμο στα όρια του μελανιού (μικρότερο αρχείο, σωστή κλίμακα στο PDF).
        const g = c.getContext('2d')!
        const { width: w, height: h } = c
        const px = g.getImageData(0, 0, w, h).data
        let x0 = w, y0 = h, x1 = 0, y1 = 0
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
          if (px[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
        }
        if (x1 <= x0 || y1 <= y0) return null
        const pad = 8
        const out = document.createElement('canvas')
        out.width = Math.min(w, x1 - x0 + pad * 2)
        out.height = Math.min(h, y1 - y0 + pad * 2)
        out.getContext('2d')!.drawImage(c, Math.max(0, x0 - pad), Math.max(0, y0 - pad), out.width, out.height, 0, 0, out.width, out.height)
        return out.toDataURL('image/png')
      },
    }), [empty, clear])

    return (
      <div className={cn('relative rounded-xl border-2 border-dashed border-border bg-white', className)}>
        <canvas
          ref={canvasRef}
          aria-label={label}
          role="img"
          className="block h-44 w-full cursor-crosshair touch-none select-none rounded-xl sm:h-52"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[length:var(--fs-14)] text-slate-400">{label}</span>
        )}
        <span className="pointer-events-none absolute right-4 bottom-10 left-4 border-b border-slate-300" aria-hidden />
        <button
          type="button"
          onClick={clear}
          disabled={empty}
          className="absolute top-2 right-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-[length:var(--fs-12-5)] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
        >
          <Eraser className="size-4" aria-hidden /> Καθαρισμός
        </button>
      </div>
    )
  },
)
