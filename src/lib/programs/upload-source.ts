// CLIENT helper: ανέβασμα PDF προκήρυξης στο /api/programs/source (multipart, έως 60MB).
export async function uploadProgramSource(file: File): Promise<{ key: string; size: number }> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/programs/source', { method: 'POST', body: fd })
  const json = (await res.json().catch(() => ({}))) as { key?: string; size?: number; error?: string }
  if (!res.ok || !json.key) throw new Error(json.error ?? 'Το ανέβασμα του PDF απέτυχε — δοκίμασε ξανά.')
  return { key: json.key, size: json.size ?? file.size }
}
