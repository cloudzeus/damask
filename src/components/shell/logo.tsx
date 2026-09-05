/**
 * Λογότυπο «World Wide Associates». Assets στο public/:
 *  - full        → logo-full.svg        (W + κείμενο, μαύρο — για ανοιχτό φόντο)
 *  - full-white  → logo-full-white.svg  (W + κείμενο, λευκό — για σκούρο φόντο)
 *  - mark        → logo-mark.svg        (τετράγωνο σήμα W, χωρίς κείμενο — mini/collapsed)
 * Χρήση μέσω <img> (αποφυγή inline gradient-id clashes).
 */
export function Logo({
  className,
  variant = 'full',
}: {
  className?: string
  variant?: 'full' | 'full-white' | 'mark'
}) {
  const src = variant === 'mark' ? '/logo.svg' : variant === 'full-white' ? '/logo-full-white.svg' : '/logo-full.svg'
  // eslint-disable-next-line @next/next/no-img-element -- static brand SVG, δεν χρειάζεται next/image
  return <img src={src} alt="World Wide Associates" className={className} />
}
