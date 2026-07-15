/**
 * Σχετικός χρόνος στα ελληνικά, π.χ. «πριν 3′», «χθες 18:40».
 * `now` περνιέται ρητά (default: `new Date()`) ώστε η συνάρτηση να είναι
 * ντετερμινιστική στα tests.
 */
export function relativeTime(input: Date | string, now: Date = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input

  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'μόλις τώρα'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `πριν ${diffMin}′`

  const diffHours = Math.floor(diffMin / 60)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayDiff = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000)

  if (dayDiff <= 0) {
    return `πριν ${diffHours} ${diffHours === 1 ? 'ώρα' : 'ώρες'}`
  }
  if (dayDiff === 1) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `χθες ${hh}:${mm}`
  }

  const dd = String(date.getDate()).padStart(2, '0')
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mo}/${yyyy}`
}
