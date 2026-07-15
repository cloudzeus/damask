export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startQueue } = await import('@/server/queue-start')
    await startQueue()
  }
}
