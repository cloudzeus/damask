import 'dotenv/config'
import { Client } from 'pg'

/** Splits an array into fixed-size chunks (last chunk may be smaller). */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk: size πρέπει να είναι > 0')
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const BATCH_SIZE = 500

type Row = Record<string, unknown>

/** Builds a parameterized `INSERT ... VALUES (...),(...) ON CONFLICT ("pk") DO UPDATE SET ...`
 *  statement for one batch of rows, quoting every identifier. */
function buildUpsertQuery(table: string, columns: string[], pkColumn: string, rows: Row[]) {
  const updateCols = columns.filter(c => c !== pkColumn)
  const valuesSql: string[] = []
  const params: unknown[] = []
  for (const row of rows) {
    const placeholders = columns.map(col => {
      params.push(row[col])
      return `$${params.length}`
    })
    valuesSql.push(`(${placeholders.join(', ')})`)
  }
  const colsSql = columns.map(c => `"${c}"`).join(', ')
  const setSql = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')
  const sql = `INSERT INTO "${table}" (${colsSql}) VALUES ${valuesSql.join(', ')}
    ON CONFLICT ("${pkColumn}") DO UPDATE SET ${setSql}`
  return { sql, params }
}

/** Copies a table via batched upsert (ON CONFLICT on `pkColumn`). Rows must already be
 *  in an order that satisfies self-referencing FK constraints (parents before children). */
async function copyUpsertTable(
  source: Client,
  target: Client,
  table: string,
  columns: string[],
  pkColumn: string,
  orderBySql: string,
): Promise<{ source: number; target: number }> {
  const { rows } = await source.query<Row>(`SELECT * FROM "${table}" ORDER BY ${orderBySql}`)
  for (const batch of chunk(rows, BATCH_SIZE)) {
    const { sql, params } = buildUpsertQuery(table, columns, pkColumn, batch)
    await target.query(sql, params)
  }
  const { rows: countRows } = await target.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "${table}"`)
  return { source: rows.length, target: Number(countRows[0].count) }
}

/** Copies a small table by DELETE + plain INSERT (preserving explicit ids) inside a
 *  transaction, then resyncs the id sequence. Used for tables with a non-PK unique
 *  constraint (or where a full replace is simplest for small row counts). */
async function copyDeleteInsertTable(
  source: Client,
  target: Client,
  table: string,
  columns: string[],
  idColumn: string,
  orderBySql: string,
): Promise<{ source: number; target: number }> {
  const { rows } = await source.query<Row>(`SELECT * FROM "${table}" ORDER BY ${orderBySql}`)
  await target.query('BEGIN')
  try {
    await target.query(`DELETE FROM "${table}"`)
    for (const batch of chunk(rows, BATCH_SIZE)) {
      const colsSql = columns.map(c => `"${c}"`).join(', ')
      const valuesSql: string[] = []
      const params: unknown[] = []
      for (const row of batch) {
        const placeholders = columns.map(col => {
          params.push(row[col])
          return `$${params.length}`
        })
        valuesSql.push(`(${placeholders.join(', ')})`)
      }
      await target.query(`INSERT INTO "${table}" (${colsSql}) VALUES ${valuesSql.join(', ')}`, params)
    }
    await target.query(
      `SELECT setval(pg_get_serial_sequence('"${table}"', '${idColumn}'), COALESCE((SELECT MAX("${idColumn}") FROM "${table}"), 1))`,
    )
    await target.query('COMMIT')
  } catch (e) {
    await target.query('ROLLBACK')
    throw e
  }
  const { rows: countRows } = await target.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "${table}"`)
  return { source: rows.length, target: Number(countRows[0].count) }
}

async function main() {
  if (!process.env.REGISTRY_SOURCE_DATABASE_URL) {
    throw new Error('Λείπει το REGISTRY_SOURCE_DATABASE_URL.')
  }
  const source = new Client({ connectionString: process.env.REGISTRY_SOURCE_DATABASE_URL })
  const target = new Client({ connectionString: process.env.DATABASE_URL })
  await source.connect()
  await target.connect()

  const results: Record<string, { source: number; target: number }> = {}

  try {
    // 1. Region — parents-first via level ordering (3 < 4 < 5)
    results.Region = await copyUpsertTable(
      source,
      target,
      'Region',
      ['code', 'nameEL', 'nameEN', 'level', 'parentCode', 'path', 'latitude', 'longitude', 'isActive', 'createdAt', 'updatedAt'],
      'code',
      'level, code',
    )

    // 2. KadCode — parents-first via level ordering, NULLs (top-level) first
    results.KadCode = await copyUpsertTable(
      source,
      target,
      'KadCode',
      [
        'code', 'codeWithoutDots', 'description', 'title', 'level', 'sector', 'sectorLetter',
        'parentCode', 'path', 'category', 'isActive', 'createdAt', 'updatedAt',
      ],
      'code',
      'level NULLS FIRST, code',
    )

    // 3. KadLicenseRequirement — unique key is ("code","licenseType"), not the PK; small
    //    table (~6k rows) so delete+insert preserving ids is simplest and idempotent.
    results.KadLicenseRequirement = await copyDeleteInsertTable(
      source,
      target,
      'KadLicenseRequirement',
      ['id', 'code', 'licenseType', 'inherited', 'sourceParentCode', 'source', 'notes', 'createdAt', 'updatedAt'],
      'id',
      'id',
    )

    // 4. KadImportLog — tiny table, delete+insert preserving ids
    results.KadImportLog = await copyDeleteInsertTable(
      source,
      target,
      'KadImportLog',
      ['id', 'totalCodes', 'importedAt', 'sourceVersion', 'status', 'notes'],
      'id',
      'id',
    )
  } finally {
    await source.end()
    await target.end()
  }

  let mismatch = false
  for (const [table, counts] of Object.entries(results)) {
    console.log(`${table}: ${counts.source} → ${counts.target}`)
    if (counts.source !== counts.target) mismatch = true
  }

  if (mismatch) {
    console.error('Αναντιστοιχία μεταξύ πηγής και προορισμού σε τουλάχιστον έναν πίνακα.')
    process.exit(1)
  }
}

// Only run when executed directly (`tsx scripts/copy-registries.ts`), not when
// imported for its `chunk` helper (e.g. by tests/registries-copy.test.ts).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch(e => {
    console.error('copy-registries απέτυχε:', e)
    process.exit(1)
  })
}
