import { getIntegration } from '@/lib/settings'

/**
 * Synology DSM — File Station Web API (https://global.download.synology.com/download/Document/Software/DeveloperGuide/Package/FileStation/All/enu/Synology_File_Station_API_Guide.pdf).
 * (Plain module.) Ο server της εφαρμογής φτάνει στο NAS μέσω Tailscale/VPN· σε tailnet
 * η κίνηση είναι ήδη κρυπτογραφημένη (WireGuard), άρα το http://<tailscale-ip>:5000
 * είναι αποδεκτό. Για https με self-signed πιστοποιητικό υπάρχει η επιλογή
 * «allowSelfSigned» (undici dispatcher μόνο για τα αιτήματα προς το NAS).
 *
 * Προτεινόμενα: ξεχωριστός χρήστης DSM ΜΟΝΟ για backup (χωρίς 2FA, δικαίωμα ανάγνωσης/
 * εγγραφής μόνο στον κοινόχρηστο φάκελο του backup).
 */

export type SynologyConfig = {
  baseUrl: string
  username: string
  password: string
  /** απόλυτη διαδρομή File Station, π.χ. «/WWA-Backup» ή «/backup/wwa» */
  rootPath: string
  allowSelfSigned: boolean
  enabled: boolean
}

export class SynologyError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message)
  }
}

// Κωδικοί σφάλματος (κοινοί + Auth + File Station) → ελληνικά.
const ERRORS: Record<number, string> = {
  100: 'Άγνωστο σφάλμα NAS', 101: 'Λάθος παράμετρος', 102: 'Το API δεν υπάρχει', 103: 'Η μέθοδος δεν υπάρχει',
  104: 'Μη υποστηριζόμενη έκδοση API', 105: 'Ο χρήστης δεν έχει δικαίωμα', 106: 'Έληξε η συνεδρία', 107: 'Η συνεδρία διακόπηκε (διπλή σύνδεση)',
  119: 'Μη έγκυρο SID',
  400: 'Λάθος χρήστης ή κωδικός', 401: 'Ο λογαριασμός είναι απενεργοποιημένος', 402: 'Απαγορεύεται η πρόσβαση',
  403: 'Απαιτείται κωδικός 2 βημάτων (2FA) — χρησιμοποίησε χρήστη backup χωρίς 2FA', 404: 'Λάθος κωδικός 2FA',
  406: 'Απαιτείται ενεργοποίηση 2FA', 407: 'Μπλοκαρισμένη IP (auto-block)', 409: 'Έληξε ο κωδικός — αλλαγή στο DSM',
  1100: 'Αδυναμία δημιουργίας φακέλου', 1101: 'Πολλοί φάκελοι ταυτόχρονα',
  1800: 'Λείπει μέγεθος/περιεχόμενο αρχείου', 1801: 'Χρονικό όριο ανεβάσματος', 1802: 'Λείπει όνομα αρχείου',
  1803: 'Ακυρώθηκε η σύνδεση', 1804: 'Το αρχείο είναι πολύ μεγάλο για το σύστημα αρχείων', 1805: 'Δεν επιτρέπεται αντικατάσταση',
  // File Station γενικά
  1000: 'Αδυναμία λήψης πληροφοριών αρχείου', 900: 'Αδυναμία διαγραφής', 1400: 'Αδυναμία εξαγωγής',
  599: 'Δεν βρέθηκε εργασία', 414: 'Το αρχείο υπάρχει ήδη', 415: 'Δεν υπάρχει χώρος στο δίσκο',
  416: 'Υπέρβαση quota', 417: 'Δεν επιτρέπεται ο χαρακτήρας στο όνομα', 418: 'Μη έγκυρο όνομα', 419: 'Μη έγκυρο όνομα αρχείου',
  420: 'Μη έγκυρη διαδρομή', 421: 'Το όνομα είναι πολύ μεγάλο',
}

function describe(code: number | undefined, fallback: string): string {
  return (code != null && ERRORS[code]) || `${fallback}${code != null ? ` (κωδ. ${code})` : ''}`
}

export async function getSynologyConfig(): Promise<SynologyConfig | null> {
  const s = await getIntegration<Record<string, string>>('synology')
  const baseUrl = (s.baseUrl ?? '').trim().replace(/\/+$/, '')
  const username = (s.username ?? '').trim()
  const password = s.password ?? ''
  if (!baseUrl || !username || !password) return null
  const root = (s.rootPath ?? '/WWA-Backup').trim() || '/WWA-Backup'
  return {
    baseUrl,
    username,
    password,
    rootPath: `/${root.replace(/^\/+|\/+$/g, '')}`,
    allowSelfSigned: s.allowSelfSigned === '1' || s.allowSelfSigned === 'true',
    enabled: s.enabled !== '0' && s.enabled !== 'false',
  }
}

type FetchInit = RequestInit & { dispatcher?: unknown }

export class SynologyClient {
  private sid: string | null = null
  private dispatcher: unknown = undefined

  constructor(private readonly cfg: SynologyConfig) {}

  private async init() {
    if (this.cfg.allowSelfSigned && this.dispatcher === undefined) {
      const { Agent } = await import('undici')
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
    }
  }

  private async call<T>(path: string, params: Record<string, string>, init: FetchInit = {}): Promise<T> {
    await this.init()
    const qs = new URLSearchParams(params)
    if (this.sid && !qs.has('_sid')) qs.set('_sid', this.sid)
    const url = `${this.cfg.baseUrl}/webapi/${path}?${qs.toString()}`
    let res: Response
    try {
      res = await fetch(url, { ...init, ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}), cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(120_000) } as RequestInit)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new SynologyError(`Δεν υπάρχει σύνδεση με το NAS (${this.cfg.baseUrl}) — ελέγξτε Tailscale/VPN και διεύθυνση. ${msg}`)
    }
    if (!res.ok) throw new SynologyError(`Το NAS απάντησε HTTP ${res.status}`)
    const data = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code?: number } } | null
    if (!data?.success) throw new SynologyError(describe(data?.error?.code, 'Σφάλμα NAS'), data?.error?.code)
    return data.data as T
  }

  async login(): Promise<void> {
    const d = await this.call<{ sid: string }>('entry.cgi', {
      api: 'SYNO.API.Auth', version: '6', method: 'login',
      account: this.cfg.username, passwd: this.cfg.password, session: 'FileStation', format: 'sid',
    })
    this.sid = d.sid
  }

  async logout(): Promise<void> {
    if (!this.sid) return
    await this.call('entry.cgi', { api: 'SYNO.API.Auth', version: '6', method: 'logout', session: 'FileStation' }).catch(() => {})
    this.sid = null
  }

  /** Δημιουργεί (αναδρομικά) τη διαδρομή φακέλου. */
  async ensureFolder(fullPath: string): Promise<void> {
    const clean = `/${fullPath.replace(/^\/+|\/+$/g, '')}`
    const idx = clean.lastIndexOf('/')
    const parent = clean.slice(0, idx) || '/'
    const name = clean.slice(idx + 1)
    if (!name) return
    await this.call('entry.cgi', {
      api: 'SYNO.FileStation.CreateFolder', version: '2', method: 'create',
      folder_path: JSON.stringify([parent]), name: JSON.stringify([name]), force_parent: 'true',
    })
  }

  /** Ανέβασμα αρχείου στον φάκελο `dirPath` (δημιουργεί γονικούς, αντικαθιστά). */
  async upload(dirPath: string, fileName: string, body: Buffer, mimeType = 'application/octet-stream'): Promise<void> {
    if (!this.sid) await this.login()
    const form = new FormData()
    form.append('api', 'SYNO.FileStation.Upload')
    form.append('version', '2')
    form.append('method', 'upload')
    form.append('path', `/${dirPath.replace(/^\/+|\/+$/g, '')}`)
    form.append('create_parents', 'true')
    form.append('overwrite', 'true')
    form.append('file', new Blob([new Uint8Array(body)], { type: mimeType }), fileName) // το αρχείο ΠΑΝΤΑ τελευταίο
    await this.call('entry.cgi', { api: 'SYNO.FileStation.Upload', version: '2', method: 'upload' }, { method: 'POST', body: form, signal: AbortSignal.timeout(15 * 60_000) })
  }

  async download(fullPath: string): Promise<Buffer> {
    if (!this.sid) await this.login()
    await this.init()
    const qs = new URLSearchParams({ api: 'SYNO.FileStation.Download', version: '2', method: 'download', path: JSON.stringify([fullPath]), mode: 'download', _sid: this.sid! })
    const res = await fetch(`${this.cfg.baseUrl}/webapi/entry.cgi?${qs}`, { ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}), cache: 'no-store' } as RequestInit)
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || type.includes('application/json')) {
      const data = (await res.json().catch(() => null)) as { error?: { code?: number } } | null
      throw new SynologyError(describe(data?.error?.code, 'Αποτυχία λήψης από NAS'), data?.error?.code)
    }
    return Buffer.from(await res.arrayBuffer())
  }

  /** Πληροφορίες φακέλου (ύπαρξη/δικαιώματα) — για τη δοκιμή σύνδεσης. */
  async folderInfo(fullPath: string): Promise<{ exists: boolean; writable: boolean }> {
    const d = await this.call<{ files: { code?: number; isdir?: boolean; additional?: { perm?: { acl?: { write?: boolean } } } }[] }>('entry.cgi', {
      api: 'SYNO.FileStation.List', version: '2', method: 'getinfo', path: JSON.stringify([fullPath]), additional: JSON.stringify(['perm']),
    })
    const f = d.files?.[0]
    if (!f || f.code) return { exists: false, writable: false }
    return { exists: true, writable: f.additional?.perm?.acl?.write !== false }
  }

  /** Κοινόχρηστοι φάκελοι στους οποίους έχει πρόσβαση ο χρήστης. */
  async listShares(): Promise<{ name: string; writable: boolean }[]> {
    const d = await this.call<{ shares: { name: string; additional?: { perm?: { acl?: { write?: boolean }; share_right?: string } } }[] }>('entry.cgi', {
      api: 'SYNO.FileStation.List', version: '2', method: 'list_share', additional: JSON.stringify(['perm']),
    })
    return (d.shares ?? []).map(x => ({ name: x.name, writable: x.additional?.perm?.share_right !== 'RO' && x.additional?.perm?.acl?.write !== false }))
  }

  /** Ελεύθερος χώρος του volume (MB) — από τις πληροφορίες κοινόχρηστων φακέλων. */
  async shareSpace(shareName: string): Promise<{ freeBytes: number | null; totalBytes: number | null }> {
    const d = await this.call<{ shares: { name: string; additional?: { volume_status?: { freespace?: number; totalspace?: number } } }[] }>('entry.cgi', {
      api: 'SYNO.FileStation.List', version: '2', method: 'list_share', additional: JSON.stringify(['volume_status']),
    })
    const s = d.shares?.find(x => x.name === shareName)
    return { freeBytes: s?.additional?.volume_status?.freespace ?? null, totalBytes: s?.additional?.volume_status?.totalspace ?? null }
  }
}

/** Δοκιμή σύνδεσης: login → δημιουργία/έλεγχος φακέλου backup → test upload → χώρος. */
export async function testSynology(cfg: SynologyConfig): Promise<{ ok: boolean; message: string }> {
  const c = new SynologyClient(cfg)
  try {
    await c.login()
    const segs = cfg.rootPath.split('/').filter(Boolean)
    const share = segs[0]
    const shares = await c.listShares().catch(() => [])
    if (shares.length && !shares.some(s => s.name === share)) {
      const avail = shares.map(s => `/${s.name}`).join(', ')
      return { ok: false, message: `Ο κοινόχρηστος φάκελος «/${share}» δεν υπάρχει. Διαθέσιμοι: ${avail}. Όρισε π.χ. «/${shares.find(s => s.writable)?.name ?? shares[0].name}/WWA-Backup» — ο υποφάκελος δημιουργείται αυτόματα.` }
    }
    if (segs.length < 2) {
      return { ok: false, message: `Όρισε υποφάκελο μέσα στον κοινόχρηστο, π.χ. «/${share}/WWA-Backup» — δημιουργείται αυτόματα.` }
    }
    // Δημιουργία του φακέλου backup (αναδρομικά) μέσα στον κοινόχρηστο.
    await c.ensureFolder(cfg.rootPath)
    const info = await c.folderInfo(cfg.rootPath)
    if (!info.exists) return { ok: false, message: `Δεν ήταν δυνατή η δημιουργία του φακέλου ${cfg.rootPath} (έλεγξε δικαιώματα εγγραφής στον «/${share}»).` }
    await c.upload(cfg.rootPath, '.wwa-backup-test', Buffer.from(`WWA backup test ${new Date().toISOString()}`), 'text/plain')
    const space = await c.shareSpace(share).catch(() => ({ freeBytes: null, totalBytes: null }))
    const gb = (b: number | null) => (b == null ? '—' : `${(b / 1024 ** 3).toLocaleString('el-GR', { maximumFractionDigits: 1 })} GB`)
    return { ok: true, message: `Επιτυχής σύνδεση· ο φάκελος ${cfg.rootPath} είναι έτοιμος και εγγράψιμος. Ελεύθερος χώρος: ${gb(space.freeBytes)} από ${gb(space.totalBytes)}.` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Αποτυχία σύνδεσης με το NAS.' }
  } finally {
    await c.logout()
  }
}
