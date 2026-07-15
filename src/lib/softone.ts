import iconv from 'iconv-lite'
import { prisma } from '@/lib/prisma'

function baseUrl() {
  return `https://${process.env.S1_SERIAL}.oncloud.gr/s1services`
}
function appId() {
  return process.env.S1_APP_ID!
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

// serialize του auth ώστε παράλληλες κλήσεις να μην κάνουν διπλό login
let authPromise: Promise<string> | null = null

export function __resetForTests() {
  authPromise = null
}

async function s1Fetch(body: object): Promise<any> {
  const res = await fetch(baseUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const buffer = await res.arrayBuffer()
  return JSON.parse(iconv.decode(Buffer.from(buffer), 'win1253'))
}

async function loadSession(): Promise<string | null> {
  const s = await prisma.s1Session.findUnique({ where: { id: 1 } })
  return s && s.date === today() ? s.clientId : null
}

async function saveSession(clientId: string): Promise<void> {
  await prisma.s1Session.upsert({
    where: { id: 1 },
    update: { clientId, date: today() },
    create: { id: 1, clientId, date: today() },
  })
}

async function clearSession(): Promise<void> {
  await prisma.s1Session.deleteMany({ where: { id: 1 } })
}

async function authenticate(): Promise<string> {
  const login = await s1Fetch({
    SERVICE: 'Login',
    USERNAME: process.env.S1_USERNAME,
    PASSWORD: process.env.S1_PASSWORD,
    APPID: appId(),
    VERSION: '2',
  })
  if (!login.success) throw new Error(`S1 Login: ${login.error ?? login.errorcode}`)
  const auth = await s1Fetch({
    service: 'authenticate',
    clientID: login.clientID,
    COMPANY: process.env.S1_COMPANY,
    BRANCH: process.env.S1_BRANCH,
    MODULE: process.env.S1_MODULE,
    REFID: process.env.S1_REFID,
    VERSION: '2',
  })
  if (!auth.success) throw new Error(`S1 Auth: ${auth.error ?? auth.errorcode}`)
  await saveSession(auth.clientID)
  return auth.clientID
}

async function getClientId(): Promise<string> {
  const cached = await loadSession()
  if (cached) return cached
  authPromise ??= authenticate().finally(() => { authPromise = null })
  return authPromise
}

/** Κλήση επίσημου S1 service με αυτόματο session & re-auth σε -100/-101. */
export async function s1(service: string, params: Record<string, unknown> = {}): Promise<any> {
  const clientID = await getClientId()
  const data = await s1Fetch({ service, clientID, appId: appId(), VERSION: '2', ...params })
  if (!data.success && (data.errorcode === -101 || data.errorcode === -100)) {
    await clearSession()
    const fresh = await getClientId()
    return s1Fetch({ service, clientID: fresh, appId: appId(), VERSION: '2', ...params })
  }
  return data
}
