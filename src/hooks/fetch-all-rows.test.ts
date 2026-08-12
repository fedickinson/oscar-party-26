import { describe, expect, it, vi } from 'vitest'
import { fetchAllRows } from './fetch-all-rows'

describe('fetchAllRows', () => {
  it('returns an empty complete ledger from an empty first page', async () => {
    const loadPage = vi.fn(async () => ({ data: [], error: null }))

    await expect(fetchAllRows(loadPage)).resolves.toEqual({ data: [], error: null })
    expect(loadPage).toHaveBeenCalledOnce()
  })

  it('collects the row after PostgREST\'s first 1,000-row page', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1 }))
    const loadPage = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }))

    const result = await fetchAllRows(loadPage)

    expect(result).toEqual({ data: rows, error: null })
    expect(loadPage).toHaveBeenCalledTimes(2)
    expect(loadPage).toHaveBeenNthCalledWith(1, 0, 999)
    expect(loadPage).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('requests an empty sentinel page when the last full page is exact', async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 }))
    const loadPage = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }))

    const result = await fetchAllRows(loadPage)

    expect(result.data).toHaveLength(1000)
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('returns no partial ledger when a later page fails', async () => {
    const error = new Error('page failed')
    const loadPage = vi.fn(async (from: number) => from === 0
      ? { data: [{ id: 1 }], error: null }
      : { data: null, error })

    const result = await fetchAllRows(loadPage, 1)

    expect(result).toEqual({ data: null, error })
  })

  it('rejects an invalid page size', async () => {
    await expect(fetchAllRows(async () => ({ data: [], error: null }), 0))
      .rejects.toThrow('page size must be a positive integer')
  })
})
