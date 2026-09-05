/**
 * Λογότυπο «World Wide Associates» — το επίσημο brand SVG (public/logo.svg,
 * μπλε→magenta «W»). Χρήση μέσω <img> ώστε να μη γίνεται inline (17KB, gradient
 * IDs που θα clash-άριζαν σε πολλαπλά renders).
 */
export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static brand SVG, όχι raster· δεν χρειάζεται next/image optimization
  return <img src="/logo.svg" alt="World Wide Associates" className={className} />
}
