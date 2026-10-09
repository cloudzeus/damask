/**
 * 301 από το παλιό WordPress του wwa-espa.com (70 URLs, Οκτ. 2026) στις νέες σελίδες — κρατά τις θέσεις στο Google
 * μετά την αντικατάσταση του site. Κάθε παλιό URL ζητείται είτε ως ελληνικό είτε κωδικοποιημένο (percent-encoded).
 */
const STEP = '/programmata/enischysi-mme-se-tomeis-stratigikon-technologion-gia-tin-eyropi-step-k'

const MAP: Record<string, string> = {
  // σελίδες
  '/πολιτική-απορρήτου': '/legal/privacy', '/όροι-χρήσης': '/legal/terms', '/πολιτική-cookies': '/legal/cookies',
  '/επικοινωνία': '/epikoinonia', '/blog': '/nea', '/category/blog': '/nea',
  '/προγράμματα-έσπα': '/programmata', '/ενεργά-προγράμματα': '/programmata', '/αναμενόμενα-προγράμματα': '/programmata',
  '/προγράμματα-σε-υλοποίηση': '/programmata', '/ολοκληρωμένα-προγράμματα': '/programmata',
  '/category/προγράμματα': '/programmata', '/category/προγράμματα/ενεργά': '/programmata', '/category/προγράμματα/υλοποίηση': '/programmata', '/category/προγράμματα/ολοκληρωμένα': '/programmata',
  '/πελάτες': '/pelates', '/portfolio': '/pelates',
  '/υπηρεσιεσ': '/ypiresies', '/our-services': '/ypiresies', '/custom-software': '/ypiresies', '/ai-chatbots': '/ypiresies',
  '/υλοποίηση-λύσεων-iot': '/ypiresies', '/σύγχρονες-λύσεις-system-integration': '/ypiresies',
  '/our-company': '/etaireia', '/εταιρεία': '/etaireia', '/ευκαιριες-καριερας': '/etaireia',
  // ενεργό πρόγραμμα
  '/step-defence': STEP,
  // δελτία Τύπου → το ίδιο άρθρο (1:1, κρατά τις θέσεις)
  '/με-λένε-λυσιστράτη': '/nea/wwa-xorigos-me-lene-lysistrati', '/webinar-hacihub-για-δράση-παράγουμε-στην-ελλάδα': '/nea/webinar-hacihub-paragoume-stin-ellada',
  '/παράγουμε-στην-ελλάδα-bni-poseidon': '/nea/paragoume-stin-ellada-bni-poseidon', '/wwa-espa-alpha-radio-98-9': '/nea/wwa-alpha-radio-paragoume-stin-ellada',
  '/ομιλία-στον-πσβακ': '/nea/omilia-ston-psvak', '/η-wwa-συμμετείχε-σε-εκδήλωση-του-σεδε': '/nea/wwa-ekdilosi-sede',
}
/** Παλιές σελίδες προγραμμάτων (κλειστές προσκλήσεις) → λίστα ενεργών προγραμμάτων. */
const OLD_PROGRAMS = [
  '/ξεκινώ-επιχειρηματικά-2026', '/ιόνιο', '/παράγουμε-στην-ελλάδα', '/ενίσχυση-της-ίδρυσης-και-λειτουργίας', '/νέεσ-μικρομεσαίεσ-επιχειρήσεισ-τουρ',
  '/πράσινη-παραγωγική-επένδυση-μμε', '/ψηφιακός-μετασχηματισμός-αιχμής-μμε', '/ψηφιακός-μετασχηματισμός-μμε', '/βασικός-ψηφιακός-μετασχηματισμό-μμε',
  '/ψηφιακα-προϊοντα-και-υπηρεσιες', '/δυτικη-μακεδονια', '/επιχειρώ-καινοτομώ-στην-ήπειρο', '/κεντρικής-μακεδονίας', '/εξωστρέφεια-μικρομεσαίων-επιχειρήσε',
  '/ψηφιακός-μετασχηματισμός', '/περιφέρεια-θεσσαλίας', '/ενίσχυση-της-αυτοαπασχόλησης-πτυχιο', '/αναβάθμιση-πολύ-μικρών-επιχειρήσεων',
  '/νέων-τουριστικών-μικρομεσαίων-επιχε', '/εργαλειοθήκη-επιχειρηματικότητα', '/eργαλειοθήκη-ανταγωνιστικότητα', '/e-λιανικό-ανάπτυξη-αναβάθμιση-eshop',
  '/επιδότηση-για-προμήθεια-πρώτων-υλών', '/επιχορήγηση-γυμναστηρίων-παιδότοπων', '/επιχορήγηση-αυτοαπασχολούμενων-δικη', '/κεφάλαιο-τουρισμος-πανδημία',
  '/ενίσχυση-απο-covid', '/ενίσχυση-covid-δήμο-πειραιά', '/λογιστικές-και-φοροτεχνικές-υπηρεσί', '/ενίσχυση-πμμε-νοτίου-αιγαίου',
  '/κλάδοι-που-πλήττονται-σημαντικά', '/ψηφιακά-εργαλεία-mme', '/ψηφιακεσ-συναλλαγεσ',
]
for (const p of OLD_PROGRAMS) MAP[p] = '/programmata'

type Redirect = { source: string; destination: string; permanent: true }

export function legacyRedirects(): Redirect[] {
  const out: Redirect[] = []
  const seen = new Set<string>()
  const add = (source: string, destination: string) => {
    for (const s of [source, `${source}/`]) {
      if (seen.has(s)) continue
      seen.add(s)
      out.push({ source: s, destination, permanent: true })
    }
  }
  for (const [from, to] of Object.entries(MAP)) {
    add(from, to)
    const enc = encodeURI(from)
    if (enc !== from) { add(enc, to); add(enc.toLowerCase(), to) }
  }
  // Παλιό portfolio (demo σελίδες του θέματος) → Πελάτες.
  out.push({ source: '/portfolio/:path*', destination: '/pelates', permanent: true })
  return out
}
