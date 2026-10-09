'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * WWA public motion (GSAP + ScrollTrigger) — ξανατρέχει σε κάθε αλλαγή σελίδας:
 *  • header σκιά μετά από 8px · reveal .r με stagger (μόνο κάτω από το fold — ποτέ κρυμμένο περιεχόμενο χωρίς JS)
 *  • parallax: hero/sub-banner (scrub) + φωτογραφίες ενοτήτων (.photo) — transform-only
 *  • hero: εναλλαγή φωτογραφιών (crossfade + ήπιο zoom) με λειτουργικές τελείες
 *  • μετρητές [data-count] · «Με μια ματιά»: δακτύλιοι/μπάρες γεμίζουν όταν εμφανίζονται · typewriter [data-typewrite]
 * prefers-reduced-motion: καμία κίνηση/parallax/autoplay (οι τελείες αλλάζουν φωτογραφία ακαριαία).
 */
export function WwaMotion() {
  const pathname = usePathname()

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const cleanups: (() => void)[] = []
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // 1) Header σκιά
    const topbar = document.querySelector('.topbar')
    const onScroll = () => topbar?.classList.toggle('scrolled', window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    cleanups.push(() => window.removeEventListener('scroll', onScroll))

    // 2) Hero: εναλλαγή φωτογραφιών
    const slides = [...document.querySelectorAll<HTMLImageElement>('.hero-slides > img')]
    const dots = [...document.querySelectorAll<HTMLButtonElement>('[data-hero-dot]')]
    if (slides.length > 1) {
      let cur = 0
      const show = (n: number) => {
        if (n === cur) return
        const prev = slides[cur]
        const next = slides[n]
        cur = n
        dots.forEach((d, i) => { d.classList.toggle('on', i === n); d.setAttribute('aria-pressed', String(i === n)) })
        if (reduce) { gsap.set(prev, { opacity: 0 }); gsap.set(next, { opacity: 1 }); return }
        gsap.to(prev, { opacity: 0, duration: 1.2, ease: 'power2.inOut' })
        gsap.fromTo(next, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 1.6, ease: 'power2.out' })
      }
      gsap.set(slides, { opacity: 0 })
      gsap.set(slides[0], { opacity: 1 })
      let timer = reduce ? 0 : window.setInterval(() => { if (!document.hidden) show((cur + 1) % slides.length) }, 6500)
      dots.forEach((d, i) => {
        const onClick = () => { show(i); if (timer) { window.clearInterval(timer); timer = window.setInterval(() => { if (!document.hidden) show((cur + 1) % slides.length) }, 6500) } }
        d.addEventListener('click', onClick)
        cleanups.push(() => d.removeEventListener('click', onClick))
      })
      cleanups.push(() => window.clearInterval(timer))
    }

    // 3) Typewriter (διατηρεί nested <span> με το ποσό)
    const tw = document.querySelector<HTMLElement>('[data-typewrite]')
    if (tw && !reduce) {
      type Seg = { text: string; el?: HTMLElement }
      const segs: Seg[] = [...tw.childNodes].map(node => node.nodeType === Node.TEXT_NODE ? { text: node.textContent || '' } : { text: (node as HTMLElement).textContent || '', el: node as HTMLElement })
      const total = segs.reduce((n, s) => n + s.text.length, 0)
      // Το ΥΠΟΛΟΙΠΟ κείμενο μένει στο DOM αόρατο (visibility:hidden) → το hero κρατά από την αρχή το τελικό ύψος.
      const render = (count: number) => {
        const frag = document.createDocumentFragment()
        const hidden = document.createElement('span')
        hidden.className = 'tw-rest'
        hidden.setAttribute('aria-hidden', 'true')
        let left = count
        let caretPlaced = false
        for (const s of segs) {
          const take = Math.max(0, Math.min(left, s.text.length))
          const shown = s.text.slice(0, take)
          const rest = s.text.slice(take)
          left -= take
          const make = (text: string) => { if (s.el) { const c = s.el.cloneNode(false) as HTMLElement; c.textContent = text; return c } return document.createTextNode(text) }
          if (shown) frag.appendChild(make(shown))
          if (rest) {
            if (!caretPlaced) { const caret = document.createElement('span'); caret.className = 'tw-caret'; caret.setAttribute('aria-hidden', 'true'); frag.appendChild(caret); caretPlaced = true; frag.appendChild(hidden) }
            hidden.appendChild(make(rest))
          }
        }
        tw.replaceChildren(frag)
      }
      tw.setAttribute('aria-label', tw.textContent ?? '')
      const state = { n: 0 }
      const tween = gsap.to(state, { n: total, duration: Math.min(4, total * 0.055), ease: 'none', delay: 0.35, onUpdate: () => render(Math.round(state.n)), onComplete: () => render(total) })
      render(0)
      cleanups.push(() => { tween.kill(); render(total) })
    }

    // 4) Scroll animations — μόνο χωρίς reduced motion
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // Hero περιεχόμενο: διαδοχική είσοδος
      gsap.from('.hero .content > .tag, .hero .content > p, .hero .content > .actions', { y: 22, opacity: 0, duration: 0.9, ease: 'power2.out', stagger: 0.12, delay: 0.15 })

      // Parallax hero & sub-banner
      document.querySelectorAll<HTMLElement>('.hero-slides, .sub-banner > img').forEach(el => {
        gsap.fromTo(el, { yPercent: 0, scale: 1.12 }, { yPercent: 12, scale: 1.12, ease: 'none', scrollTrigger: { trigger: el.parentElement ?? el, start: 'top top', end: 'bottom top', scrub: true } })
      })

      // Parallax φωτογραφιών ενοτήτων (ήπιο)
      document.querySelectorAll<HTMLElement>('.photo > img, .feature .photo img, .promo .photo img').forEach(img => {
        gsap.fromTo(img, { yPercent: -6, scale: 1.14 }, { yPercent: 6, scale: 1.14, ease: 'none', scrollTrigger: { trigger: img.parentElement ?? img, start: 'top bottom', end: 'bottom top', scrub: true } })
      })

      // Reveal .r κάτω από το fold, σε παρτίδες με stagger
      const below = gsap.utils.toArray<HTMLElement>('.r').filter(el => el.getBoundingClientRect().top > window.innerHeight * 0.85)
      gsap.set(below, { opacity: 0, y: 26 })
      const revealed = new WeakSet<Element>()
      const reveal = (els: Element[]) => {
        const fresh = els.filter(e => !revealed.has(e))
        fresh.forEach(e => revealed.add(e))
        if (fresh.length) gsap.to(fresh, { opacity: 1, y: 0, duration: 0.75, ease: 'power2.out', stagger: 0.08, overwrite: true })
      }
      ScrollTrigger.batch(below, { start: 'top 92%', once: true, onEnter: batch => reveal(batch) })
      // Στο τέλος της σελίδας κάποια στοιχεία δεν «περνούν» ποτέ το όριο — μετά από κάθε scroll εμφανίζεται ό,τι φαίνεται.
      const sweep = () => reveal(below.filter(e => e.getBoundingClientRect().top < window.innerHeight))
      ScrollTrigger.addEventListener('scrollEnd', sweep)
      return () => ScrollTrigger.removeEventListener('scrollEnd', sweep)

      // Μετρητές
      gsap.utils.toArray<HTMLElement>('[data-count]').forEach(el => {
        const target = Number(el.dataset.count || '0')
        const suffix = el.dataset.suffix || ''
        const o = { v: 0 }
        gsap.to(o, { v: target, duration: 1.4, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true }, onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString('el-GR') + suffix } })
      })

      // «Με μια ματιά»: δακτύλιοι & μπάρες γεμίζουν όταν εμφανίζονται
      gsap.utils.toArray<HTMLElement>('.kf-ring .ring').forEach(ring => {
        const p = Number(getComputedStyle(ring).getPropertyValue('--p')) || 0
        gsap.fromTo(ring, { '--p': 0 }, { '--p': p, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: ring, start: 'top 88%', once: true } })
      })
      gsap.utils.toArray<HTMLElement>('.kf-bar-fill, .kf-bar-min').forEach(bar => {
        gsap.from(bar, { scaleX: 0, transformOrigin: 'left center', duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: bar, start: 'top 92%', once: true } })
      })
    })
    cleanups.push(() => mm.revert())

    // Μετά από αλλαγή σελίδας οι εικόνες φορτώνουν σταδιακά — επανυπολογισμός θέσεων.
    const refresh = () => ScrollTrigger.refresh()
    window.addEventListener('load', refresh)
    const t = window.setTimeout(refresh, 600)
    cleanups.push(() => { window.removeEventListener('load', refresh); window.clearTimeout(t) })

    return () => cleanups.forEach(fn => fn())
  }, [pathname])

  return null
}
