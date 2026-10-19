/**
 * Run `fn` over `items` with at most `limit` calls in flight at once. Results keep the input order.
 * `fn` should handle its own errors; a rejection ends the whole call.
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  };
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}

export const MAX_CONCURRENCY = 50;

/** Clamp a user-supplied concurrency to a safe range (1 to 50). */
export function clampConcurrency(value: number | undefined, fallback = 10): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_CONCURRENCY, Math.max(1, Math.floor(value)));
}
