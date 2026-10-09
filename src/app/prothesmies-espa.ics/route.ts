import { listDeadlines } from '@/lib/seo-content/hubs'
import { absoluteUrl, SITE_NAME } from '@/lib/site-url'

export const revalidate = 3600

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

/** Ημερολόγιο (iCalendar) με τις προθεσμίες των ενεργών προγραμμάτων — συνδρομή από Google/Outlook/Apple. */
export async function GET() {
  const rows = (await listDeadlines()).filter(r => r.deadline)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${esc(SITE_NAME)}//Prothesmies ESPA//EL`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Προθεσμίες ΕΣΠΑ', 'X-WR-TIMEZONE:Europe/Athens', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H']
  for (const r of rows) {
    const end = new Date(r.deadline!.getTime() + 86_400_000)
    lines.push('BEGIN:VEVENT', `UID:${r.slug}-deadline@wwa-espa.com`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(r.deadline!)}`, `DTEND;VALUE=DATE:${day(end)}`,
      `SUMMARY:${esc(`Λήξη ΕΣΠΑ: ${r.title}`)}`, `DESCRIPTION:${esc(`Τελευταία ημέρα υποβολής (επιδότηση ${r.rate}). ${absoluteUrl(`/programmata/${r.slug}`)}`)}`,
      `URL:${absoluteUrl(`/programmata/${r.slug}`)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P7D', `DESCRIPTION:${esc(`Σε 7 ημέρες λήγει: ${r.title}`)}`, 'END:VALARM', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="prothesmies-espa.ics"' } })
}
