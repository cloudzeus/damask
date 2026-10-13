/** (Isomorphic.) Κανόνες μαζικής εισαγωγής — ίδιοι σε browser και server. */

/** Αρχεία που δεν είναι έγγραφα (βίντεο/ήχος/αρχειοθήκες) → κατευθείαν στα αρχεία πελάτη, χωρίς αναγνώριση. */
export const NOT_A_DOC = /\.(mp4|mov|avi|mkv|webm|mp3|wav|m4a|zip|rar|7z|gz|tar|dmg|exe|iso|psd|ai|indd)$/i

/** Ξεκαθάρισμα: αρχεία που δεν χρειάζεται να ανέβουν (με την αιτία) — ή null. */
export function junkOf(name: string, size: number): string | null {
  if (size === 0) return 'Κενό αρχείο (0 bytes).'
  if (/^~\$/.test(name) || /^\.~lock\./.test(name)) return 'Προσωρινό αρχείο Office (ανοιχτό έγγραφο).'
  if (/^\./.test(name)) return 'Κρυφό αρχείο συστήματος.'
  if (/\.(lnk|url|webloc|alias)$/i.test(name)) return 'Συντόμευση — όχι πραγματικό αρχείο.'
  if (/\.(tmp|temp|bak|old|crdownload|part|partial|download)$/i.test(name)) return 'Προσωρινό ή μισοκατεβασμένο αρχείο.'
  if (/\.(ini|db|log|ds_store|sys|dll|exe|msi|bat|cmd)$/i.test(name)) return 'Αρχείο συστήματος/εφαρμογής.'
  return null
}

/** Αναμονές πριν από κάθε νέα προσπάθεια όταν το AI απαντά «όριο»/διακοπή· μετά → ΑΠΕΤΥΧΕ («Ξανά»). */
export const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000, 3_600_000]

/** Ελάχιστη βεβαιότητα για αυτόματη αποθήκευση δικαιολογητικού (ή αναγνώριση από τη μνήμη). */
export const AUTO_SAVE_MIN_CONFIDENCE = 0.9
