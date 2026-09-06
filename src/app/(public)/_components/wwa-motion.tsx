'use client'

import { useEffect } from 'react'

/**
 * WWA public motion — vanilla (χωρίς GSAP dependency): reveal-on-scroll για .r,
 * header shadow μετά από 8px, counters [data-count], typewriter [data-typewrite]
 * (διατηρεί το nested <span> με το ποσό cyan). Σέβεται prefers-reduced-motion.
 * Mount-once σε client — δεν αγγίζει SSR (τα στοιχεία είναι ορατά χωρίς JS).
 */
export function WwaMotion() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // 1) Header shadow
    const topbar = document.querySelector('.topbar')
    const onScroll = () => { if (topbar) topbar.classList.toggle('scrolled', window.scrollY > 8) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    const cleanups: Array<() => void> = [() => window.removeEventListener('scroll', onScroll)]

    if (!reduce) {
      // 2) Reveal .r
      const revealables = [...document.querySelectorAll<HTMLElement>('.r')]
      const belowFold = revealables.filter(el => el.getBoundingClientRect().top > window.innerHeight * 0.82)
      belowFold.forEach(el => el.classList.add('pre'))
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { (e.target as HTMLElement).classList.remove('pre'); io.unobserve(e.target) }
        }
      }, { rootMargin: '0px 0px -8% 0px' })
      belowFold.forEach(el => io.observe(el))
      cleanups.push(() => io.disconnect())

      // 3) Counters
      const counters = [...document.querySelectorAll<HTMLElement>('[data-count]')]
      const cio = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          cio.unobserve(el)
          const target = Number(el.dataset.count || '0')
          const suffix = el.dataset.suffix || ''
          const start = performance.now(); const dur = 1200
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / dur)
            const val = Math.round(target * (0.5 - Math.cos(Math.PI * p) / 2))
            el.textContent = val.toLocaleString('el-GR') + suffix
            if (p < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      }, { rootMargin: '0px 0px -10% 0px' })
      counters.forEach(el => cio.observe(el))
      cleanups.push(() => cio.disconnect())

      // 4) Typewriter (διατηρεί nested span με το ποσό)
      const tw = document.querySelector<HTMLElement>('[data-typewrite]')
      if (tw) {
        try {
          type Seg = { text: string; el?: HTMLElement }
          const segs: Seg[] = [...tw.childNodes].map(node => {
            if (node.nodeType === Node.TEXT_NODE) return { text: node.textContent || '' }
            const el = node as HTMLElement
            return { text: el.textContent || '', el }
          })
          const total = segs.reduce((n, s) => n + s.text.length, 0)
          const render = (count: number) => {
            const frag = document.createDocumentFragment()
            let left = count
            for (const s of segs) {
              if (left <= 0) break
              const take = Math.min(left, s.text.length)
              const slice = s.text.slice(0, take)
              if (s.el) {
                const clone = s.el.cloneNode(false) as HTMLElement
                clone.textContent = slice
                frag.appendChild(clone)
              } else {
                frag.appendChild(document.createTextNode(slice))
              }
              left -= take
            }
            tw.replaceChildren(frag)
          }
          tw.classList.add('is-typing')
          render(0)
          let i = 0
          const timer = window.setInterval(() => {
            i += 1
            render(i)
            if (i >= total) { window.clearInterval(timer); tw.classList.remove('is-typing') }
          }, 60)
          cleanups.push(() => { window.clearInterval(timer) })
        } catch {
          tw.classList.remove('is-typing')
        }
      }
    }

    return () => cleanups.forEach(fn => fn())
  }, [])

  return null
}
