export function successResponse(data: any, meta: any = {}) {
  return {
    success: true,
    data,
    meta: {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      cacheHit: false,
      ...meta,
    },
  }
}

export function paginatedResponse(data: any, pagination: any, meta: any = {}) {
  return {
    success: true,
    data,
    meta: {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      cacheHit: false,
      pagination,
      ...meta,
    },
  }
}

export function errorResponse(code: string, message: string, statusCode: number) {
  return { success: false, error: { code, message, statusCode } }
}

// ── Offset pagination ────────────────────────────────────────────────────────
export function paginate(array: any[], page: number, limit: number) {
  const p = Math.max(1, Number(page) || 1)
  const l = Math.min(100, Math.max(1, Number(limit) || 20))
  const total = array.length
  const totalPages = Math.ceil(total / l)
  return {
    items: array.slice((p - 1) * l, p * l),
    total,
    page: p,
    limit: l,
    totalPages,
    hasNextPage: p < totalPages,
    hasPrevPage: p > 1,
    mode: 'offset' as const,
  }
}

// ── Cursor pagination ────────────────────────────────────────────────────────
// BUG-01 fix: cursor is now the encoded `id` of the last item, not an array
// index. This makes pagination stable across insertions and deletions because
// we search for the item by its natural id rather than relying on its position
// in the array, which shifts whenever items are added or removed.
export function cursorPaginate(array: any[], cursor: string | undefined, limit: number) {
  const l = Math.min(100, Math.max(1, Number(limit) || 20))

  let startIndex = 0
  if (cursor) {
    try {
      // Cursor encodes the `id` of the last item seen, not its index.
      const lastId = Buffer.from(cursor, 'base64').toString('utf-8')
      const idx = array.findIndex((item) => (item.id ?? item._id?.toString()) === lastId)
      startIndex = idx === -1 ? 0 : idx + 1
    } catch {
      startIndex = 0
    }
  }

  const items = array.slice(startIndex, startIndex + l)
  const hasNext = startIndex + l < array.length
  const hasPrev = startIndex > 0

  // Encode the id of the last item in the current page as the next cursor.
  const lastItem = items[items.length - 1]
  const lastItemId = lastItem ? (lastItem.id ?? lastItem._id?.toString() ?? '') : ''
  const nextCursor = hasNext ? Buffer.from(lastItemId).toString('base64') : null

  // Encode the id of the first item in the current page as the prev cursor.
  const firstItem = items[0]
  const firstItemId = firstItem ? (firstItem.id ?? firstItem._id?.toString() ?? '') : ''
  // For the prev cursor we need to point to the item *before* the first one.
  const prevItem = startIndex > 0 ? array[startIndex - 1] : null
  const prevItemId = prevItem ? (prevItem.id ?? prevItem._id?.toString() ?? '') : ''
  const prevCursor = hasPrev ? Buffer.from(prevItemId).toString('base64') : null

  return {
    items,
    total: array.length,
    limit: l,
    nextCursor,
    prevCursor,
    hasNextPage: hasNext,
    hasPrevPage: hasPrev,
    mode: 'cursor' as const,
  }
}

// ── Smart paginate ───────────────────────────────────────────────────────────
export function smartPaginate(
  array: any[],
  params: { page?: number; limit?: number; cursor?: string },
) {
  const { page, limit = 20, cursor } = params
  if (cursor !== undefined && cursor !== null && cursor !== '') {
    return cursorPaginate(array, cursor, limit)
  }
  return paginate(array, page ?? 1, limit)
}
