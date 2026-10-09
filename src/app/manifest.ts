import type { MetadataRoute } from 'next'

/** Web app manifest — όνομα/εικονίδια/χρώματα για κινητά και αποτελέσματα αναζήτησης. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'World Wide Associates — Σύμβουλοι ΕΣΠΑ',
    short_name: 'WWA ΕΣΠΑ',
    description: 'Σύμβουλοι ΕΣΠΑ & επιδοτήσεων για επιχειρήσεις — ενεργά προγράμματα, προθεσμίες, δωρεάν έλεγχος επιλεξιμότητας.',
    start_url: '/',
    display: 'browser',
    background_color: '#ffffff',
    theme_color: '#001B72',
    lang: 'el',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
