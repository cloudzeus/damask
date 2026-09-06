import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/**
 * WWA public Button — pill (nova-like), navy primary. Χρησιμοποιεί τις plain
 * κλάσεις του design system (.btn + variants) από _wwa/components.css. Renders
 * <Link> όταν δοθεί `href`, αλλιώς <button>. ΜΟΝΟ για το public site.
 */
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'inverse' | 'inverse-outline' | 'accent' | 'link'
type Size = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: '',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  inverse: 'btn-inverse',
  'inverse-outline': 'btn-inverse-outline',
  accent: 'btn-accent',
  link: 'btn-link',
}
const SIZE_CLASS: Record<Size, string> = { sm: 'btn-sm', md: '', lg: 'btn-lg' }

function classes(variant: Variant, size: Size, extra?: string) {
  return ['btn', VARIANT_CLASS[variant], SIZE_CLASS[size], extra].filter(Boolean).join(' ')
}

type CommonProps = { variant?: Variant; size?: Size; children: ReactNode; className?: string }

export function Button({
  href, variant = 'primary', size = 'md', children, className, ...rest
}: CommonProps & { href?: string } & Omit<ComponentProps<'a'> & ComponentProps<'button'>, 'className' | 'children'>) {
  const cls = classes(variant, size, className)
  if (href) {
    const external = /^(https?:|mailto:|tel:|#)/.test(href)
    if (external) return <a href={href} className={cls} {...(rest as ComponentProps<'a'>)}>{children}</a>
    return <Link href={href} className={cls} {...(rest as Omit<ComponentProps<'a'>, 'href'>)}>{children}</Link>
  }
  return <button className={cls} {...(rest as ComponentProps<'button'>)}>{children}</button>
}
