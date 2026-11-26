/**
 * Run `fn` over `items` with at most `limit` running at once; results keep the
 * input order. Report queries fan out over id chunks — one after another they
 * took seconds each, all at once they would flood the API — so a few at a time.
 * Rejects on the first failure: a partial list reads as a complete one.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
