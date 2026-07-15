import { getIntegration } from '@/lib/settings'

/**
 * ΑΑΔΕ (GSIS) RgWsPublic2 lookup — επίσημο δημόσιο SOAP webservice αναζήτησης
 * στοιχείων επιχείρησης από ΑΦΜ. https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2
 *
 * ⚠️ ΣΗΜΕΙΩΣΗ ΑΞΙΟΠΙΣΤΙΑΣ: το ακριβές namespace/element shape του SOAP envelope
 * παρακάτω είναι βέλτιστη προσπάθεια βασισμένη σε τεκμηρίωση της υπηρεσίας — δεν
 * υπήρχαν διαθέσιμα credentials/sandbox για ζωντανή επαλήθευση σε αυτό το
 * περιβάλλον. Το parsing (parseAadeXml) είναι σκόπιμα ΑΝΕΚΤΙΚΟ (tag-name based,
 * αγνοεί namespace prefix/nesting) ώστε να αντέχει μικρές αποκλίσεις στο
 * request shape. Πριν το πρώτο πραγματικό production lookup, επαλήθευσε το
 * envelope έναντι πραγματικής response από το ΑΑΔΕ.
 *
 * Σημασιολογία AFM: το webservice απαιτεί ΔΥΟ ΑΦΜ σε κάθε κλήση — το ΑΦΜ του
 * λογαριασμού που κάνει την κλήση (registered/authorized, εδώ αποθηκευμένο ως
 * ρύθμιση `afmCalledFor` μαζί με τα credentials — δεν αλλάζει ανά αναζήτηση) και
 * το ΑΦΜ-στόχο για το οποίο ζητάμε στοιχεία (περνάει ως όρισμα σε κάθε κλήση,
 * από το πεδίο ΑΦΜ της καρτέλας Εταιρεία).
 */

const AADE_ENDPOINT = 'https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2'

export type AadeCompanyInfo = {
  afm: string
  onomasia: string | null
  commerTitle: string | null
  postalAddress: string | null
  postalAddressNo: string | null
  postalZipCode: string | null
  postalAreaDescription: string | null
  doy: string | null
  doyDescr: string | null
  firmActDescr: string | null
}

export type AadeLookupResult =
  | { ok: true; data: AadeCompanyInfo }
  | {
      ok: false
      reason: 'missing_credentials' | 'invalid_afm' | 'soap_fault' | 'not_found' | 'http_error' | 'network_error'
      message: string
    }

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Εξάγει το πρώτο `<tagName>...</tagName>` (ανεκτικό σε namespace prefix,
 * π.χ. `<ns1:onomasia>`) — null αν δεν υπάρχει ή είναι κενό. Δεν κάνει πλήρες
 * XML parse (καμία εξάρτηση xml lib) — αρκετό για το επίπεδο (flat-ish) shape
 * της response αυτού του συγκεκριμένου webservice.
 */
function extractTag(xml: string, tagName: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tagName}>`, 'i')
  const match = re.exec(xml)
  if (!match) return null
  const raw = match[1].trim()
  return raw === '' ? null : decodeXmlEntities(raw)
}

/** SOAP Fault detection — ελληνικό μήνυμα βασισμένο στο faultstring όταν υπάρχει. */
function extractSoapFault(xml: string): string | null {
  if (!/<[^>]*:?Fault[ >]/i.test(xml)) return null
  return extractTag(xml, 'faultstring') ?? 'Άγνωστο σφάλμα SOAP.'
}

/**
 * Parse μόνο των πεδίων που χρειάζεται η προσυμπλήρωση της καρτέλας Εταιρεία.
 * Επιστρέφει null αν η response δεν περιέχει ούτε ΑΦΜ ούτε επωνυμία (κενό/μη
 * αναγνωρίσιμο αποτέλεσμα).
 */
export function parseAadeXml(xml: string): AadeCompanyInfo | null {
  const afm = extractTag(xml, 'afm')
  const onomasia = extractTag(xml, 'onomasia')
  if (!afm && !onomasia) return null

  return {
    afm: afm ?? '',
    onomasia,
    commerTitle: extractTag(xml, 'commer_title'),
    postalAddress: extractTag(xml, 'postal_address'),
    postalAddressNo: extractTag(xml, 'postal_address_no'),
    postalZipCode: extractTag(xml, 'postal_zip_code'),
    postalAreaDescription: extractTag(xml, 'postal_area_description'),
    doy: extractTag(xml, 'doy'),
    doyDescr: extractTag(xml, 'doy_descr'),
    firmActDescr: extractTag(xml, 'firm_act_descr'),
  }
}

function buildSoapEnvelope(opts: { username: string; password: string; requesterAfm: string; targetAfm: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://rgwspublic2.gsis.gr/RgWsPublic2Service">
  <soapenv:Header>
    <ns:rgWsPublic2AuthenticateRequest>
      <ns:username>${escapeXml(opts.username)}</ns:username>
      <ns:password>${escapeXml(opts.password)}</ns:password>
    </ns:rgWsPublic2AuthenticateRequest>
  </soapenv:Header>
  <soapenv:Body>
    <ns:rgWsPublic2AfmMethod>
      <ns:INPUT_PARAMETERS>
        <ns:afm_called_by>${escapeXml(opts.requesterAfm)}</ns:afm_called_by>
        <ns:afm_called_for>${escapeXml(opts.targetAfm)}</ns:afm_called_for>
      </ns:INPUT_PARAMETERS>
    </ns:rgWsPublic2AfmMethod>
  </soapenv:Body>
</soapenv:Envelope>`
}

type StoredAadeConfig = { username?: string; password?: string; afmCalledFor?: string }

/** Αναζήτηση στοιχείων επιχείρησης από ΑΦΜ μέσω ΑΑΔΕ. `targetAfm` = το ΑΦΜ που αναζητούμε (πεδίο ΑΦΜ της καρτέλας Εταιρεία). */
export async function lookupAfm(targetAfm: string): Promise<AadeLookupResult> {
  const afm = targetAfm.trim()
  if (!/^\d{9}$/.test(afm)) {
    return { ok: false, reason: 'invalid_afm', message: 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.' }
  }

  const creds = await getIntegration<StoredAadeConfig>('aade')
  if (!creds.username?.trim() || !creds.password?.trim()) {
    return {
      ok: false,
      reason: 'missing_credentials',
      message:
        'Χρειάζεται εγγραφή στις Ηλεκτρονικές Υπηρεσίες του gsis.gr (ειδικοί κωδικοί web service, διαφορετικοί από τους κωδικούς TAXISnet) — κάνε εγγραφή στο https://www.aade.gr και συμπλήρωσε τα στοιχεία πρόσβασης παραπάνω.',
    }
  }

  const envelope = buildSoapEnvelope({
    username: creds.username,
    password: creds.password,
    requesterAfm: creds.afmCalledFor?.trim() || creds.username,
    targetAfm: afm,
  })

  let xml: string
  try {
    const res = await fetch(AADE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: envelope,
      signal: AbortSignal.timeout(20_000),
    })
    xml = await res.text()
    if (!res.ok && !xml.trim()) {
      return { ok: false, reason: 'http_error', message: `Το ΑΑΔΕ επέστρεψε HTTP ${res.status}.` }
    }
  } catch {
    return { ok: false, reason: 'network_error', message: 'Αδυναμία σύνδεσης με το ΑΑΔΕ. Δοκίμασε ξανά σε λίγο.' }
  }

  const fault = extractSoapFault(xml)
  if (fault) {
    return { ok: false, reason: 'soap_fault', message: `Το ΑΑΔΕ επέστρεψε σφάλμα: ${fault}` }
  }

  const data = parseAadeXml(xml)
  if (!data || !data.onomasia) {
    return { ok: false, reason: 'not_found', message: 'Δεν βρέθηκαν στοιχεία για αυτό το ΑΦΜ.' }
  }

  return { ok: true, data }
}
