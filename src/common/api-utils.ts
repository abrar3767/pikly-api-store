export function successResponse(data: any, meta: any = {}) {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      cacheHit: false,
      ...meta,
    },
  };
}

export function paginatedResponse(data: any, pagination: any, meta: any = {}) {
  return {
    success: true,
    data,
    meta: {
      pagination,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      cacheHit: false,
      ...meta,
    },
  };
}

export function errorResponse(
  code: string,
  message: string,
  statusCode: number,
) {
  return {
    success: false,
    error: { code, message, statusCode },
  };
}

// ── OFFSET PAGINATION ──────────────────────────────────────────────────────
export function paginate(array: any[], page: number, limit: number) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const total = array.length;
  const totalPages = Math.ceil(total / l);
  const items = array.slice((p - 1) * l, p * l);
  return {
    items,
    total,
    page: p,
    limit: l,
    totalPages,
    hasNextPage: p < totalPages,
    hasPrevPage: p > 1,
    mode: "offset" as const,
  };
}

// ── CURSOR PAGINATION ──────────────────────────────────────────────────────
// Cursor is base64 encoded index of the item in the array
// e.g. cursor = btoa('20') means "start after item at index 20"

export function cursorPaginate(
  array: any[],
  cursor: string | undefined,
  limit: number,
) {
  const l = Math.min(100, Math.max(1, Number(limit) || 20));

  // Decode cursor → starting index
  let startIndex = 0;
  if (cursor) {
    try {
      const decoded = parseInt(
        Buffer.from(cursor, "base64").toString("utf-8"),
        10,
      );
      startIndex = isNaN(decoded) ? 0 : Math.max(0, decoded);
    } catch {
      startIndex = 0;
    }
  }

  const items = array.slice(startIndex, startIndex + l);
  const hasNext = startIndex + l < array.length;
  const hasPrev = startIndex > 0;

  // Encode next/prev cursors
  const nextCursor = hasNext
    ? Buffer.from(String(startIndex + l)).toString("base64")
    : null;

  const prevStart = Math.max(0, startIndex - l);
  const prevCursor = hasPrev
    ? Buffer.from(String(prevStart)).toString("base64")
    : null;

  return {
    items,
    total: array.length,
    limit: l,
    nextCursor,
    prevCursor,
    hasNextPage: hasNext,
    hasPrevPage: hasPrev,
    mode: "cursor" as const,
  };
}

// ── SMART PAGINATE — auto detects which mode to use ───────────────────────
// If cursor param is provided → cursor mode
// If page param is provided   → offset mode
export function smartPaginate(
  array: any[],
  params: { page?: number; limit?: number; cursor?: string },
) {
  const { page, limit = 20, cursor } = params;

  if (cursor !== undefined && cursor !== null && cursor !== "") {
    return cursorPaginate(array, cursor, limit);
  }
  return paginate(array, page ?? 1, limit);
}
