import { prisma } from '@/lib/prisma'
import { openrouterChat, type ORMessage } from '@/lib/openrouter'
import { toolsFor, type ActionPayload } from './tools'
import type { PageContext, ThanosContext } from './context'
import type { OperationPayload } from './operations'
import { CACHEABLE_TOOLS, getCachedAnswer, putCachedAnswer } from './cache'
import { lessonsFor, recordTurn } from './learning'

/**
 * (Plain module.) Ο βρόχος του Thanos: μήνυμα χρήστη → μοντέλο (OpenRouter) → εργαλεία → απάντηση.
 * Οι ενέργειες (prepare_*) επιστρέφονται ως κάρτες προεπισκόπησης — η αποστολή γίνεται ΜΟΝΟ με «Αποστολή».
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ThanosActionCard =
  | { id: string; kind: 'DOC_REQUEST' | 'ACCOUNTANT_LINK'; status: string; payload: ActionPayload }
  | { id: string; kind: 'OPERATION'; status: string; payload: OperationPayload }
export type ThanosReply = {
  reply: string
  /** Τι ακούγεται (φωνή): σύντομο όταν υπάρχουν ενέργειες/λίστες — το πλήρες μένει στο κείμενο. */
  speech: string
  actions: ThanosActionCard[]
  model: string | null
  cached?: boolean
  /** Για 👍/👎 (μάθηση). */
  turnId?: string | null
}
type LoopResult = Omit<ThanosReply, 'speech' | 'turnId'> & { tools: string[]; programId: string | null }

/**
 * Κείμενο → εκφώνηση. Με ενέργειες: μόνο η εισαγωγική πρόταση (π.χ. «Ετοίμασα το email για τον λογιστή σας…»),
 * όχι η λίστα δικαιολογητικών. Χωρίς ενέργειες: όλο το κείμενο εκτός από γραμμές-λίστας όταν είναι πολλές.
 */
export function speechFor(reply: string, hasActions: boolean): string {
  const lines = reply.split('\n').map(l => l.trim()).filter(Boolean)
  const isItem = (l: string) => /^([-•*–]|\d+[.)])\s+/.test(l)
  const prose = lines.filter(l => !isItem(l)).join(' ').replace(/\s+/g, ' ').trim()
  if (hasActions) {
    // Μόνο η εισαγωγική πρόταση — όχι «Ζητάμε τα εξής:» και ό,τι προαναγγέλλει λίστα.
    const sentences = (prose.match(/[^.!;;:]+[.!;;:]?/g) ?? [prose]).map(x => x.trim()).filter(x => x && !x.endsWith(':'))
    const short = (sentences[0]?.length ?? 0) < 60 ? sentences.slice(0, 2).join(' ') : sentences[0] ?? ''
    return (short.replace(/:\s*$/, '.') || 'Ετοίμασα την ενέργεια — ελέγξτε την κάρτα και πατήστε το κουμπί για να προχωρήσει.')
  }
  const items = lines.filter(isItem)
  return items.length > 3 ? `${prose}${prose ? ' ' : ''}Η πλήρης λίστα είναι γραμμένη στη συνομιλία.` : reply
}

const MAX_STEPS = 6
const HISTORY_TURNS = 12

async function describePage(ctx: ThanosContext, page: PageContext | undefined): Promise<string> {
  if (!page) return ''
  const bits: string[] = []
  if (page.applicationId && (ctx.mode === 'STAFF' || ctx.applicationIds.includes(page.applicationId))) {
    const a = await prisma.programApplication.findUnique({ where: { id: page.applicationId }, select: { id: true, trdr: { select: { NAME: true } }, program: { select: { id: true, title: true } } } })
    if (a) bits.push(`έργο applicationId=${a.id} (πελάτης «${a.trdr.NAME}», πρόγραμμα «${a.program.title}» programId=${a.program.id})`)
  } else if (page.programId) {
    const p = await prisma.program.findUnique({ where: { id: page.programId }, select: { id: true, title: true } })
    if (p) bits.push(`πρόγραμμα «${p.title}» programId=${p.id}`)
  }
  if (ctx.mode === 'STAFF' && page.trdrId && !page.applicationId) {
    const t = await prisma.trdr.findUnique({ where: { id: page.trdrId }, select: { id: true, NAME: true } })
    if (t) bits.push(`καρτέλα πελάτη «${t.NAME}» trdrId=${t.id}`)
  }
  return bits.length ? `Ο χρήστης βλέπει αυτή τη στιγμή: ${bits.join('· ')}. Όταν λέει «αυτό/αυτός/εδώ», εννοεί αυτά.` : ''
}

function systemPrompt(ctx: ThanosContext, pageNote: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const common = [
    'Είσαι ο Thanos, ο ψηφιακός σύμβουλος της World Wide Associates (WWA) για προγράμματα ΕΣΠΑ και επιδοτήσεις.',
    `Σήμερα: ${today}. Μιλάς ελληνικά, σαν έμπειρος και ζεστός σύμβουλος που εξηγεί σε άνθρωπο — ΟΧΙ σαν δημόσιο έγγραφο.`,
    'ΥΦΟΣ: φυσικές, απλές προτάσεις όπως θα τα έλεγες στο τηλέφωνο. Ξεκίνα από την ουσία («Ναι, μπορείτε…», «Δυστυχώς όχι, γιατί…»), εξήγησε το «γιατί» με απλά λόγια και, όπου βοηθά, δώσε ένα μικρό παράδειγμα ή το επόμενο βήμα. Απόφυγε τη γραφειοκρατική/ξύλινη γλώσσα («δύναται», «εν λόγω», «καθίσταται», «εφόσον πληρούνται οι προϋποθέσεις»), τις απρόσωπες συντάξεις και τις μακριές λίστες. ΣΥΝΤΟΜΑ: 2-4 προτάσεις — μόνο η ουσία· λεπτομέρειες ΜΟΝΟ αν τις ζητήσει (μπορείς να ρωτήσεις «Θέλετε να σας πω περισσότερα;»). Λίστα μόνο αν είναι πραγματικά βήματα (έως 4). Χωρίς markdown πινάκων.',
    'ΠΑΡΑΔΕΙΓΜΑ ΥΦΟΥΣ (μόνο για το ύφος — όχι για το περιεχόμενο):',
    '  ✗ ΞΥΛΙΝΟ: «Σύμφωνα με την Ενότητα 6.2 του Οδηγού, οι δαπάνες της κατηγορίας Β δύνανται να καταστούν επιλέξιμες εφόσον πληρούνται σωρευτικά οι προϋποθέσεις του άρθρου 4.»',
    '  ✓ ΦΙΛΙΚΟ: «Ναι, μπορεί να μπει στο πρόγραμμα — με μια προϋπόθεση: να το χρησιμοποιεί η ίδια η επιχείρηση και όχι να το νοικιάζει σε τρίτους. Δηλαδή αν το βάλετε στην έδρα σας για τη δουλειά σας, είστε εντάξει. Θέλετε να δούμε και πόσο από το κόστος θα σας επιστραφεί;»',
    'Γράφε όπως στο ✓: σύντομες προτάσεις, καθημερινές λέξεις, «εσείς» στον πελάτη / φιλικό «εσύ» στους συναδέλφους, και κλείσε με μια χρήσιμη ερώτηση ή το επόμενο βήμα όταν ταιριάζει.',
    'Είσαι ΕΡΓΑΛΕΙΟ δουλειάς, όχι σεμινάριο: ευχάριστος και ανθρώπινος λόγος, αλλά ακριβής και στο ψητό — ό,τι χρειάζεται για να προχωρήσει ο χρήστης, τίποτα παραπάνω.',
    'Τα αποτελέσματα των εργαλείων είναι ΥΛΙΚΟ — μην τα αντιγράφεις αυτούσια· ξαναπές τα με δικά σου, ανθρώπινα λόγια.',
    'ΑΚΡΩΝΥΜΙΑ: γράφε τα ΟΛΟΚΛΗΡΑ — την πρώτη φορά το πλήρες όνομα με το ακρωνύμιο σε παρένθεση, π.χ. «Ετήσιες Μονάδες Εργασίας (ΕΜΕ)», «Κωδικός Αριθμός Δραστηριότητας (ΚΑΔ)», «Γενικό Εμπορικό Μητρώο (ΓΕΜΗ)», «Ανεξάρτητη Αρχή Δημοσίων Εσόδων (ΑΑΔΕ)»· μετά μπορείς να γράφεις το ακρωνύμιο.',
    'ΠΟΤΕ μην επινοείς κανόνες προγράμματος: για επιλεξιμότητα/δαπάνες/προθεσμίες ΧΡΗΣΙΜΟΠΟΙΗΣΕ τα εργαλεία program_question / check_expense, και πες από πού προκύπτει (οδηγός/ενότητα). Αν δεν ξέρεις το programId, βρες το πρώτα (list_open_programs).',
    'Τα εργαλεία prepare_* ΔΕΝ στέλνουν: ετοιμάζουν προεπισκόπηση. ΜΗΝ λες ποτέ ότι κάτι στάλθηκε.',
    'Όταν ετοιμάζεις ενέργεια: η ΠΡΩΤΗ πρόταση λέει σύντομα τι ετοίμασες και τι να κάνει ο χρήστης (π.χ. «Ετοίμασα το email για τον λογιστή σας — ελέγξτε το και πατήστε «Αποστολή».») — ΜΟΝΟ αυτή ακούγεται στη φωνή. Μετά, στο κείμενο, γράψε ΟΛΟΚΛΗΡΩΜΕΝΗ τη λίστα (π.χ. όλα τα έγγραφα, ένα ανά γραμμή με «- »).',
    'Μην εμφανίζεις εσωτερικά IDs στον χρήστη — μόνο ονόματα.',
    'ΘΕΜΑΤΙΚΟ ΠΕΔΙΟ (αυστηρό): απαντάς ΜΟΝΟ για (α) ευρωπαϊκά/εθνικά προγράμματα χρηματοδότησης (ΕΣΠΑ, επιδοτήσεις, επιλεξιμότητα, δαπάνες, δικαιολογητικά), (β) την εφαρμογή WWA και τα δεδομένα της, (γ) τα έργα/πελάτες, και (δ) ΣΧΕΤΙΚΕΣ πρακτικές ερωτήσεις που εξυπηρετούν τα παραπάνω — π.χ. από πού βγαίνει το Ε3/Ε1/ΕΜΕ/φορολογική-ασφαλιστική ενημερότητα/πιστοποιητικό ΓΕΜΗ (TaxisNet/myAADE, e-ΕΦΚΑ, ΓΕΜΗ, λογιστής), τι είναι ένας ΚΑΔ, de minimis κ.λπ.',
    'Για ΟΤΙΔΗΠΟΤΕ άσχετο (γενικές γνώσεις, κώδικας, συνταγές, πολιτική, αθλητικά, μεταφράσεις, ψυχαγωγία κ.λπ.) απάντα ΜΟΝΟ με μία πρόταση: «Μπορώ να βοηθήσω μόνο με προγράμματα χρηματοδότησης και την εφαρμογή της WWA.» — χωρίς εργαλεία, χωρίς επιπλέον κείμενο.',
    'Τηλέφωνα και μεγάλοι αριθμοί-κωδικοί (ΑΦΜ, ΓΕΜΗ) γράφονται σε ομάδες των 3 ψηφίων (π.χ. «694 096 0701», «210 721 8758»· ο ΑΦΜ γράφεται ενιαίος, π.χ. «094183948») — ποτέ ως ένας ενιαίος αριθμός.',
  ]
  const role = ctx.mode === 'CUSTOMER'
    ? [
        `Μιλάς με ${ctx.name}, εκπρόσωπο της επιχείρησης «${ctx.companyName}» (πελάτης μας, μέσω του portal).`,
        'Βοηθάς με: την πορεία των έργων της (my_programs), τα ενεργά προγράμματα και αν ταιριάζουν, αν μια δαπάνη που σκέφτεται είναι επιλέξιμη, και αποστολή ασφαλούς συνδέσμου στον λογιστή της για να ανεβάσει δικαιολογητικά (prepare_accountant_link).',
        'ΓΙΑ ΤΟΝ ΠΕΛΑΤΗ: δεν είναι ειδικός — μην υποθέτεις ότι ξέρει όρους ή διαδικασίες. Εξήγησε πολύ πιο αναλυτικά και κατανοητά: τι σημαίνει κάθε έννοια με απλά λόγια (π.χ. «επιλέξιμη δαπάνη = έξοδο που το πρόγραμμα σας επιστρέφει μέρος του»), τι σημαίνει αυτό για τη δική του επιχείρηση, και ποιο είναι το επόμενο πρακτικό βήμα (τι να κάνει, από πού να το βρει, ποιος μπορεί να βοηθήσει — π.χ. ο λογιστής του). Μίλα στον πληθυντικό ευγενείας, ζεστά και ενθαρρυντικά. Απλό ΔΕΝ σημαίνει μακρύ: 3-5 σύντομες προτάσεις, όχι ανάλυση.',
        'Δεν βλέπεις και δεν συζητάς άλλους πελάτες. Για ζητήματα σύμβασης/αμοιβών παραπέμπεις στον σύμβουλό τους στη WWA. Μην υπόσχεσαι έγκριση — μιλάς για πιθανότητες και προϋποθέσεις.',
      ]
    : [
        `Μιλάς με ${ctx.name}, σύμβουλο/χρήστη της WWA. Μπορείς να είσαι τεχνικός και αναλυτικός.`,
        'Βοηθάς με: ερωτήσεις πάνω στους οδηγούς των προγραμμάτων, επιλεξιμότητα δαπανών, εικόνα πελάτη (customer_overview / application_details), ελλείψεις πελατών ανά πρόγραμμα (program_gaps) και αιτήματα δικαιολογητικών με email προς πελάτες (prepare_document_request — μία κλήση ανά έργο, ακόμα και για πολλούς πελάτες).',
        'Για «πώς κάνω… / πού βρίσκεται… / τι σημαίνει…» στην εφαρμογή, ψάξε ΠΡΩΤΑ στον Οδηγό χρήσης (app_help) και απάντα με βάση αυτόν, με σύντομα βήματα.',
        'ΕΝΕΡΓΕΙΕΣ ΓΙΑ ΛΟΓΑΡΙΑΣΜΟ ΤΟΥ ΧΡΗΣΤΗ: όταν ζητά να γίνει κάτι (αλλαγή σταδίου, νέο δικαιολογητικό/εργασία, ενημέρωση κατάστασης/προθεσμίας, ανάθεση, δυνητικοί σε πρόγραμμα, καταγραφή επικοινωνίας/κατάσταση lead), χρησιμοποίησε τα prepare_op_* — ετοιμάζουν κάρτα και ο χρήστης πατά «Εκτέλεση». ΠΟΤΕ μη λες ότι έγινε. Αν ζητά κάτι για το οποίο δεν υπάρχει εργαλείο, εξήγησε πώς γίνεται από την οθόνη (app_help) και δώσε σύνδεσμο.',
        'Σύνδεσμοι σελίδων: γράψε τους ως [κείμενο](/διαδρομή) — π.χ. καρτέλα πελάτη /partners/<trdrId>, πρόγραμμα /programs/<programId>, έργο /programs/<programId>/applications/<applicationId>, leads /leads, αναθέσεις /assignments. (Μόνο εδώ επιτρέπονται IDs, μέσα στον σύνδεσμο.)',
      ]
  return [...common, ...role, pageNote].filter(Boolean).join('\n')
}

export async function runThanos(ctx: ThanosContext, history: ChatTurn[], message: string, page?: PageContext, conversationId?: string | null): Promise<ThanosReply> {
  const r = await runLoop(ctx, history, message, page)
  const turnId = await recordTurn(ctx, { conversationId, question: message, reply: r.reply, toolsUsed: r.tools, programId: r.programId, model: r.model, cached: r.cached })
  return { reply: r.reply, speech: speechFor(r.reply, r.actions.length > 0), actions: r.actions, model: r.model, cached: r.cached, turnId }
}

async function runLoop(ctx: ThanosContext, history: ChatTurn[], message: string, page?: PageContext): Promise<LoopResult> {
  // Συνηθισμένη ερώτηση στην αρχή συζήτησης → από την cache (χωρίς κλήση AI).
  const fresh = history.length === 0
  if (fresh) {
    const hit = await getCachedAnswer(ctx, page, message)
    if (hit) return { reply: hit.reply, actions: [], model: hit.model, cached: true, tools: [], programId: page?.programId ?? null }
  }
  const usedTools = new Set<string>()
  let programId: string | null = page?.programId ?? null
  const tools = toolsFor(ctx)
  const byName = new Map(tools.map(t => [t.tool.function.name, t]))
  // Σελίδα + σχετικά «μαθήματα» από προηγούμενες συζητήσεις (σημασιολογική ανάκτηση) — παράλληλα.
  const [pageNote, lessons] = await Promise.all([describePage(ctx, page), lessonsFor(message, page?.programId)])
  const messages: ORMessage[] = [
    { role: 'system', content: [systemPrompt(ctx, pageNote), lessons].filter(Boolean).join('\n\n') },
    ...history.slice(-HISTORY_TURNS).map(h => ({ role: h.role, content: h.content.slice(0, 4000) }) as ORMessage),
    { role: 'user', content: message.slice(0, 4000) },
  ]
  const actionIds: string[] = []
  let model: string | null = null

  for (let step = 0; step < MAX_STEPS; step++) {
    const last = step === MAX_STEPS - 1
    const res = await openrouterChat(messages, { tools: last ? undefined : tools.map(t => t.tool), userId: ctx.userId, refType: 'thanos' })
    model = res.model
    const calls = res.message.tool_calls ?? []
    if (!calls.length) {
      const reply = (res.message.content ?? '').trim()
      if (!reply) return { reply: 'Δεν έχω απάντηση γι’ αυτό — δοκίμασε να το διατυπώσεις αλλιώς.', actions: await loadCards(actionIds), model, tools: [...usedTools], programId }
      if (fresh && !actionIds.length && [...usedTools].every(t => CACHEABLE_TOOLS.has(t))) await putCachedAnswer(ctx, page, message, reply, model)
      return { reply, actions: await loadCards(actionIds), model, tools: [...usedTools], programId }
    }
    // Το DeepSeek (thinking) θέλει πίσω το reasoning_content του ίδιου γύρου μαζί με τα tool_calls.
    messages.push({ role: 'assistant', content: res.message.content ?? null, tool_calls: calls, ...(res.message.reasoning_content ? { reasoning_content: res.message.reasoning_content } : {}) })
    for (const c of calls) {
      usedTools.add(c.function.name)
      const def = byName.get(c.function.name)
      let out: Record<string, unknown>
      if (!def) out = { error: `Άγνωστο εργαλείο ${c.function.name}` }
      else {
        try {
          const args = c.function.arguments ? JSON.parse(c.function.arguments) as Record<string, unknown> : {}
          if (typeof args.programId === 'string' && args.programId) programId = args.programId
          out = await def.run(ctx, args)
        } catch (err) {
          out = { error: err instanceof Error ? err.message : String(err) }
        }
      }
      if (typeof out.actionId === 'string') actionIds.push(out.actionId)
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 24_000) })
    }
  }
  return { reply: 'Η ερώτηση χρειάστηκε πολλά βήματα — δες τις κάρτες παρακάτω ή ρώτα πιο συγκεκριμένα.', actions: await loadCards(actionIds), model, tools: [...usedTools], programId }
}

async function loadCards(ids: string[]): Promise<ThanosActionCard[]> {
  if (!ids.length) return []
  const rows = await prisma.thanosAction.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, status: true, payload: true } })
  return rows.map(r => ({ id: r.id, kind: r.kind, status: r.status, payload: r.payload }) as unknown as ThanosActionCard)
}
