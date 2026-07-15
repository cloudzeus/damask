'use client'

import { useRef } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { CustomEase } from 'gsap/CustomEase'

gsap.registerPlugin(CustomEase)
// matches the mockup's cubic-bezier(.2,.7,.3,1) rise curve
const RISE_EASE = CustomEase.create('steel-rise', 'M0,0 C0.2,0.7 0.3,1 1,1')

export function PageTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const targets = ref.current?.children.length ? Array.from(ref.current.children) : ref.current
    gsap.fromTo(
      targets,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.5, ease: RISE_EASE, stagger: 0.06 },
    )
  }, { dependencies: [pathname], scope: ref })
  return <div ref={ref}>{children}</div>
}
