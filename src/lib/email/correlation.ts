import crypto from 'node:crypto'

/**
 * Κωδικοποίηση συσχέτισης email ↔ (πελάτης/πρόγραμμα/έργο/task). Στόχος: όταν
 * αργότερα συνδεθεί το mailbox, οι απαντήσεις των πελατών να αναγνωρίζονται και
 * να καταχωρούνται στο σωστό νήμα. Τρία επίπεδα ανθεκτικότητας:
 *   1. RFC threading — σταθερό Message-Id που θέτουμε· οι απαντήσεις φέρουν
 *      In-Reply-To/References προς αυτό.
 *   2. Reply-To plus-address — `inbox+<token>@<domain>` → το πιο αξιόπιστο όταν
 *      ρυθμιστεί inbound route στο Mailgun.
 *   3. Subject tag `[WWA-<token>]` — fallback αν ο client κόψει τα headers.
 */

export const COMM_TAG_PREFIX = 'WWA'

/** Σύντομος, ευανάγνωστος κωδικός συσχέτισης (10 hex, κεφαλαία). */
export function newCorrelationToken(): string {
  return crypto.randomBytes(5).toString('hex').toUpperCase()
}

export function subjectTag(token: string): string {
  return `[${COMM_TAG_PREFIX}-${token}]`
}

/** Προσθέτει το tag στο subject αν λείπει (idempotent — δεν διπλασιάζεται). */
export function ensureSubjectTag(subject: string, token: string): string {
  const tag = subjectTag(token)
  return subject.includes(tag) ? subject : `${subject} ${tag}`.trim()
}

/** RFC Message-Id (χωρίς <>) — φέρει το token ώστε να ανακτάται και από εκεί. */
export function buildMessageId(token: string, domain: string): string {
  return `${token.toLowerCase()}.${crypto.randomBytes(6).toString('hex')}@${domain}`
}

/** Reply-To plus-address για μελλοντικό inbound matching. */
export function buildReplyTo(token: string, domain: string): string {
  return `inbox+${token.toLowerCase()}@${domain}`
}

const TAG_RE = new RegExp(`\\[${COMM_TAG_PREFIX}-([A-F0-9]{6,})\\]`, 'i')
const PLUS_RE = /inbox\+([a-f0-9]{6,})@/i
const MSGID_RE = /([a-f0-9]{6,})\.[a-f0-9]+@/i

/**
 * Εξαγωγή token από (α) plus-address παραλήπτη, (β) In-Reply-To/References
 * Message-Id, ή (γ) subject tag — με αυτή τη σειρά προτεραιότητας. Επιστρέφει
 * κεφαλαίο token ή null. Για τον μελλοντικό inbound webhook.
 */
export function extractCorrelationToken(input: {
  recipient?: string | null
  inReplyTo?: string | null
  references?: string | null
  subject?: string | null
}): string | null {
  const fromPlus = input.recipient?.match(PLUS_RE)?.[1]
  if (fromPlus) return fromPlus.toUpperCase()
  const fromMsgId = (input.inReplyTo || input.references)?.match(MSGID_RE)?.[1]
  if (fromMsgId) return fromMsgId.toUpperCase()
  const fromSubject = input.subject?.match(TAG_RE)?.[1]
  if (fromSubject) return fromSubject.toUpperCase()
  return null
}
