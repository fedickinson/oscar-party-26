/**
 * Exhausts a deterministically ordered PostgREST query instead of accepting
 * the server's 1,000-row default page as the complete record.
 *
 * The caller owns the query and its unique ordering. Injecting one page loader
 * keeps this helper usable by every Supabase table without weakening its row
 * types or importing browser configuration into tests and operator scripts.
 */

export const POSTGREST_PAGE_SIZE = 1000

export interface RowPage<T, E = unknown> {
  data: T[] | null
  error: E | null
}

export async function fetchAllRows<T, E = unknown>(
  loadPage: (from: number, to: number) => PromiseLike<RowPage<T, E>>,
  pageSize = POSTGREST_PAGE_SIZE,
): Promise<RowPage<T, E>> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('page size must be a positive integer')
  }

  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const page = await loadPage(from, from + pageSize - 1)
    if (page.error) return { data: null, error: page.error }

    const pageRows = page.data ?? []
    rows.push(...pageRows)
    if (pageRows.length < pageSize) return { data: rows, error: null }
  }
}
