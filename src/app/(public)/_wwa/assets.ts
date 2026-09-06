/**
 * CDN URLs για τα assets του δημόσιου site — φιλοξενούνται στο BunnyCDN και είναι
 * καταχωρημένα στο Media Gallery (folder «WWA — Δημόσιο site»). Οι σελίδες
 * αναφέρονται ΠΑΝΤΑ σε CDN URLs (όχι σε /public), ώστε τα εικαστικά να διαχειρίζονται
 * από τη gallery.
 */
const CDN = 'https://damask-1.b-cdn.net/wwa/site'

export const wwaLogoDark = `${CDN}/wwa-logo-dark-text.svg` // navy κείμενο για λευκό φόντο
export const wwaLogoLight = `${CDN}/wwa-logo-light-text.svg` // λευκό κείμενο για navy φόντο
export const wwaMark = `${CDN}/wwa-mark.svg`

export type WwaPhoto = 'consulting' | 'cosmetics' | 'ecommerce' | 'hotel' | 'manufacturing' | 'startup' | 'team'
export const wwaPhoto = (name: WwaPhoto): string => `${CDN}/photo-${name}.webp`
