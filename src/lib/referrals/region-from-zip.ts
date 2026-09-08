/**
 * Best-effort αντιστοίχιση ΤΚ (5ψήφιος) → Περιφέρεια (Καλλικράτης), βάσει των 2
 * πρώτων ψηφίων. Χρησιμοποιείται στο batch χαρτογράφησης παραπομπών όπου η ΑΑΔΕ
 * δίνει διεύθυνση/ΤΚ αλλά ΟΧΙ Περιφέρεια. Τα ονόματα ταιριάζουν με τα
 * Program.regions μέσω του normalized region matching (regionNameMatches).
 */

// 2-digit prefix → Περιφέρεια. confident=false σε ασαφή/μεικτά prefixes.
const PREFIX: Record<string, { name: string; confident: boolean }> = {
  '10': { name: 'Αττικής', confident: true }, '11': { name: 'Αττικής', confident: true },
  '12': { name: 'Αττικής', confident: true }, '13': { name: 'Αττικής', confident: true },
  '14': { name: 'Αττικής', confident: true }, '15': { name: 'Αττικής', confident: true },
  '16': { name: 'Αττικής', confident: true }, '17': { name: 'Αττικής', confident: true },
  '18': { name: 'Αττικής', confident: true }, '19': { name: 'Αττικής', confident: true },
  '20': { name: 'Πελοποννήσου', confident: true }, '21': { name: 'Πελοποννήσου', confident: true },
  '22': { name: 'Πελοποννήσου', confident: true }, '23': { name: 'Πελοποννήσου', confident: true },
  '24': { name: 'Πελοποννήσου', confident: false },
  '25': { name: 'Δυτικής Ελλάδας', confident: true }, '26': { name: 'Δυτικής Ελλάδας', confident: true },
  '27': { name: 'Δυτικής Ελλάδας', confident: true },
  '28': { name: 'Ιονίων Νήσων', confident: false },
  '30': { name: 'Δυτικής Ελλάδας', confident: true },
  '31': { name: 'Ιονίων Νήσων', confident: false },
  '32': { name: 'Στερεάς Ελλάδας', confident: true }, '33': { name: 'Στερεάς Ελλάδας', confident: false },
  '34': { name: 'Στερεάς Ελλάδας', confident: true }, '35': { name: 'Στερεάς Ελλάδας', confident: true },
  '36': { name: 'Στερεάς Ελλάδας', confident: true },
  '37': { name: 'Θεσσαλίας', confident: true }, '38': { name: 'Θεσσαλίας', confident: true },
  '40': { name: 'Θεσσαλίας', confident: true }, '41': { name: 'Θεσσαλίας', confident: true },
  '42': { name: 'Θεσσαλίας', confident: true }, '43': { name: 'Θεσσαλίας', confident: true },
  '44': { name: 'Ηπείρου', confident: false }, '45': { name: 'Ηπείρου', confident: true },
  '46': { name: 'Ηπείρου', confident: true }, '47': { name: 'Ηπείρου', confident: true },
  '48': { name: 'Ηπείρου', confident: true },
  '49': { name: 'Ιονίων Νήσων', confident: true },
  '50': { name: 'Δυτικής Μακεδονίας', confident: true }, '51': { name: 'Δυτικής Μακεδονίας', confident: true },
  '52': { name: 'Δυτικής Μακεδονίας', confident: true }, '53': { name: 'Δυτικής Μακεδονίας', confident: true },
  '54': { name: 'Κεντρικής Μακεδονίας', confident: true }, '55': { name: 'Κεντρικής Μακεδονίας', confident: true },
  '56': { name: 'Κεντρικής Μακεδονίας', confident: true }, '57': { name: 'Κεντρικής Μακεδονίας', confident: true },
  '58': { name: 'Κεντρικής Μακεδονίας', confident: true }, '59': { name: 'Κεντρικής Μακεδονίας', confident: true },
  '60': { name: 'Κεντρικής Μακεδονίας', confident: true }, '61': { name: 'Κεντρικής Μακεδονίας', confident: true },
  '62': { name: 'Κεντρικής Μακεδονίας', confident: true }, '63': { name: 'Κεντρικής Μακεδονίας', confident: true },
  '64': { name: 'Ανατολικής Μακεδονίας και Θράκης', confident: true }, '65': { name: 'Ανατολικής Μακεδονίας και Θράκης', confident: true },
  '66': { name: 'Ανατολικής Μακεδονίας και Θράκης', confident: true }, '67': { name: 'Ανατολικής Μακεδονίας και Θράκης', confident: true },
  '68': { name: 'Ανατολικής Μακεδονίας και Θράκης', confident: true }, '69': { name: 'Ανατολικής Μακεδονίας και Θράκης', confident: true },
  '70': { name: 'Κρήτης', confident: true }, '71': { name: 'Κρήτης', confident: true },
  '72': { name: 'Κρήτης', confident: true }, '73': { name: 'Κρήτης', confident: true },
  '74': { name: 'Κρήτης', confident: true },
  '81': { name: 'Βορείου Αιγαίου', confident: true }, '82': { name: 'Βορείου Αιγαίου', confident: true },
  '83': { name: 'Βορείου Αιγαίου', confident: true },
  '84': { name: 'Νοτίου Αιγαίου', confident: true }, '85': { name: 'Νοτίου Αιγαίου', confident: true },
}

export function regionFromZip(zip: string | null | undefined): { name: string | null; confident: boolean } {
  const digits = (zip ?? '').replace(/\D/g, '')
  if (digits.length < 3) return { name: null, confident: false }
  const hit = PREFIX[digits.slice(0, 2)]
  return hit ? { name: hit.name, confident: hit.confident } : { name: null, confident: false }
}
