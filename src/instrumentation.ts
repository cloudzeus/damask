export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Νέα δικαιώματα από τον κώδικα → βάση (χωρίς να πειράζει όσα άλλαξαν οι διαχειριστές).
    try {
      const { syncNewPermissions } = await import('@/server/boot-permissions')
      const r = await syncNewPermissions()
      if (r.created.length) console.log(`[boot] νέα δικαιώματα: ${r.created.join(', ')} (+${r.grants} αναθέσεις σε ρόλους)`)
    } catch (err) {
      console.error('[boot] συγχρονισμός δικαιωμάτων απέτυχε', err)
    }
    const { startQueue } = await import('@/server/queue-start')
    await startQueue()
  }
}
