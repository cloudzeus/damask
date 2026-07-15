import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getMediaList } from '@/lib/media'

export const runtime = 'nodejs'

/**
 * Λίστα φακέλων + αρχείων για το Media Gallery (/media) ΚΑΙ το MediaPicker.
 * Gate: απλό auth() — η ΕΠΙΛΟΓΗ media δεν είναι διαχείριση, τη χρειάζονται και
 * χρήστες χωρίς media.manage (π.χ. για να επισυνάψουν εικόνα σε προϊόν).
 * Διαγραφές/φάκελοι παραμένουν πίσω από media.manage (βλ. (app)/media/actions.ts).
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Μη εξουσιοδοτημένο.' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const body = await getMediaList({
    folderId: searchParams.get('folderId'),
    type: searchParams.get('type'),
    q: searchParams.get('q'),
  })

  return NextResponse.json(body)
}
