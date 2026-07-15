import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const integrationStore = new Map<string, Record<string, unknown>>()
vi.mock('@/lib/settings', () => ({
  getIntegration: vi.fn(async (name: string) => integrationStore.get(name) ?? {}),
}))

import { bunnyUploadPrivate, bunnyDownload, bunnyDeleteOne, bunnyDeleteMany, bunnyList } from '@/lib/bunny-storage'

const CFG = { storageZone: 'damask', storagePassword: 'secret', storageApi: 'https://storage.bunnycdn.com' }

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  integrationStore.clear()
  integrationStore.set('bunny', CFG)
})
afterEach(() => vi.unstubAllGlobals())

describe('bunnyUploadPrivate', () => {
  it('PUT στη σωστή URL με AccessKey header, χωρίς public-read ACL', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 201 }))
    await bunnyUploadPrivate({ key: 'backups/x.dump', body: Buffer.from('data') })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://storage.bunnycdn.com/damask/backups/x.dump')
    expect(init.method).toBe('PUT')
    expect(init.headers.AccessKey).toBe('secret')
  })

  it('πετάει σφάλμα όταν το Bunny δεν απαντά 201', async () => {
    fetchMock.mockResolvedValueOnce(new Response('quota exceeded', { status: 507 }))
    await expect(bunnyUploadPrivate({ key: 'backups/x.dump', body: Buffer.from('d') })).rejects.toThrow(/507/)
  })

  it('πετάει καθαρό ελληνικό μήνυμα όταν λείπουν τα credentials BunnyCDN', async () => {
    integrationStore.set('bunny', {})
    await expect(bunnyUploadPrivate({ key: 'backups/x.dump', body: Buffer.from('d') })).rejects.toThrow(/Λείπουν ρυθμίσεις BunnyCDN/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('bunnyDownload', () => {
  it('GET με AccessKey, επιστρέφει Buffer', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    const buf = await bunnyDownload('backups/x.dump')
    expect(buf).toBeInstanceOf(Buffer)
    expect([...buf]).toEqual([1, 2, 3])
  })

  it('404 → σφάλμα "δεν βρέθηκε"', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(bunnyDownload('backups/missing.dump')).rejects.toThrow(/δεν βρέθηκε/)
  })
})

describe('bunnyDeleteOne / bunnyDeleteMany', () => {
  it('DELETE με AccessKey header', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))
    await bunnyDeleteOne('backups/x.dump')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://storage.bunnycdn.com/damask/backups/x.dump')
    expect(init.method).toBe('DELETE')
  })

  it('404 σε delete = ήδη διαγραμμένο, ΔΕΝ πετάει σφάλμα', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(bunnyDeleteOne('backups/gone.dump')).resolves.toBeUndefined()
  })

  it('bunnyDeleteMany συνεχίζει στα υπόλοιπα keys ακόμα κι αν ένα αποτύχει', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 500 })) // key1 αποτυγχάνει
      .mockResolvedValueOnce(new Response('', { status: 200 })) // key2 πετυχαίνει
    await bunnyDeleteMany(['backups/key1.dump', 'backups/key2.dump'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('άδεια λίστα keys — δεν καλεί καθόλου fetch', async () => {
    await bunnyDeleteMany([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('bunnyList', () => {
  it('παραθέτει αντικείμενα ενός φακέλου (trailing slash) ως JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      { ObjectName: 'a.dump', Path: '/damask/backups/', Length: 123, IsDirectory: false, LastChanged: '2026-01-01T00:00:00' },
    ]), { status: 200 }))
    const list = await bunnyList('backups')
    expect(fetchMock.mock.calls[0][0]).toBe('https://storage.bunnycdn.com/damask/backups/')
    expect(list).toEqual([{ objectName: 'a.dump', path: '/damask/backups/', length: 123, isDirectory: false, lastChanged: '2026-01-01T00:00:00' }])
  })

  it('404 (ο φάκελος δεν υπάρχει ακόμα) → άδειος πίνακας, όχι σφάλμα', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    expect(await bunnyList('backups')).toEqual([])
  })
})
