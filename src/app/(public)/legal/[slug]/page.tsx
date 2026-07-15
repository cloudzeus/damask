import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { prisma } from '@/lib/prisma'

type LegalPageParams = { slug: string }
type LegalPageSearchParams = { lang?: string }

async function loadPublishedLegalPage(slug: string) {
  const page = await prisma.legalPage.findUnique({ where: { slug }, include: { translations: true } })
  if (!page || !page.published) return null
  return page
}

function pickTranslation(page: NonNullable<Awaited<ReturnType<typeof loadPublishedLegalPage>>>, lang: string | undefined) {
  const wantEn = lang === 'en'
  const en = page.translations.find(t => t.locale === 'en')
  const el = page.translations.find(t => t.locale === 'el')
  if (wantEn && en) return { translation: en, locale: 'en' as const, hasEn: Boolean(en) }
  return { translation: el ?? en ?? null, locale: 'el' as const, hasEn: Boolean(en) }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LegalPageParams>
}): Promise<Metadata> {
  const { slug } = await params
  const page = await loadPublishedLegalPage(slug)
  if (!page) return {}
  const { translation } = pickTranslation(page, undefined)
  return { title: translation ? `${translation.title} — DAMASK` : 'DAMASK' }
}

export default async function LegalPageRoute({
  params, searchParams,
}: {
  params: Promise<LegalPageParams>
  searchParams: Promise<LegalPageSearchParams>
}) {
  const { slug } = await params
  const { lang } = await searchParams

  const page = await loadPublishedLegalPage(slug)
  if (!page) notFound()

  const { translation, locale, hasEn } = pickTranslation(page, lang)
  if (!translation) notFound()

  return (
    <div className="mx-auto max-w-[820px] px-4 py-12 sm:py-16">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/" className="text-[12.5px] font-semibold hover:underline" style={{ color: 'var(--hero-muted)' }}>
          ← Αρχική
        </Link>
        {hasEn && (
          <div className="flex gap-1.5">
            <Link href={`/legal/${slug}`} className={`pill${locale === 'el' ? ' on' : ''}`}>EL</Link>
            <Link href={`/legal/${slug}?lang=en`} className={`pill${locale === 'en' ? ' on' : ''}`}>EN</Link>
          </div>
        )}
      </div>

      <article className="glass stagger p-6 sm:p-10">
        <h1 className="mb-6 text-[24px] sm:text-[28px]">{translation.title}</h1>
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{translation.body}</ReactMarkdown>
        </div>
      </article>
    </div>
  )
}
