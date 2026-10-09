/* eslint-disable @next/next/no-img-element -- σκόπιμα <img> (object-fit cover στα .photo/.media) με srcset από τον optimizer */
import type { ImgHTMLAttributes } from 'react'

const OPTIMIZABLE = /^https:\/\/damask-1\.b-cdn\.net\//

/** URL του optimizer του Next για συγκεκριμένο πλάτος (μόνο για εικόνες του CDN μας· αλλιώς όπως είναι). */
export function optimized(src: string, w: number, q = 72): string {
  return OPTIMIZABLE.test(src) ? `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}` : src
}

/**
 * Φωτογραφία με srcset (480/768/1080/1440/1920) — ο browser κατεβάζει μόνο όσο χρειάζεται η οθόνη.
 * `sizes` = πόσο φαρδιά εμφανίζεται (π.χ. κάρτα 3 στηλών: "(min-width: 1024px) 400px, 100vw").
 */
export function Pic({ src, sizes = '100vw', widths = [480, 768, 1080, 1440, 1920], alt = '', ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & { src: string; widths?: number[] }) {
  if (!OPTIMIZABLE.test(src)) return <img src={src} alt={alt} {...rest} />
  const max = widths[widths.length - 1]
  return <img src={optimized(src, Math.min(1080, max))} srcSet={widths.map(w => `${optimized(src, w)} ${w}w`).join(', ')} sizes={sizes} alt={alt} decoding="async" {...rest} />
}
