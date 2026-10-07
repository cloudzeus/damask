import { startBoss } from '@/lib/queue'

export const QUEUE_SEARCH_INDEX = 'search-index'

export type StorageChange = { key: string; size?: number; op: 'put' | 'del' }

/**
 * Ειδοποίηση «άλλαξε αρχείο» → το ευρετήριο αναζήτησης ενημερώνεται σε λίγα δευτερόλεπτα.
 * Καθυστέρηση ώστε να έχει γραφτεί πρώτα η εγγραφή της βάσης (τύπος, πρόγραμμα, πελάτης)
 * που δίνει τις ετικέτες. Fire-and-forget: ποτέ δεν αποτυγχάνει το upload εξαιτίας του.
 */
export function notifyStorageChange(change: StorageChange): void {
  startBoss()
    .then(boss => boss.send(QUEUE_SEARCH_INDEX, change, { startAfter: 8, retryLimit: 2 }))
    .catch(err => console.error('[search-index] enqueue απέτυχε', err))
}
