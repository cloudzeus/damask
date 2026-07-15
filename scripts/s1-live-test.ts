import 'dotenv/config'
import { s1 } from '../src/lib/softone'

async function main() {
  if (!process.env.S1_SERIAL || !process.env.S1_USERNAME) {
    console.error('Λείπουν S1_* μεταβλητές από το .env — συμπλήρωσέ τες πρώτα.')
    process.exit(1)
  }
  const res = await s1('GetTable', { TABLE: 'MTRL', FIELDS: 'MTRL,CODE,NAME', FILTER: '' })
  console.log('success:', res.success)
  console.log('πρώτες 3 γραμμές:', JSON.stringify(res.rows?.slice(0, 3) ?? res, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
