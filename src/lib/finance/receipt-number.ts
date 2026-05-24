export function formatReceiptNumber(yearName: string, sequence: number): string {
  return `${yearName}/${String(sequence).padStart(5, "0")}`;
}

export function parseMaxSequence(existing: string[], yearName: string): number {
  const prefix = `${yearName}/`;
  let max = 0;
  for (const number of existing) {
    if (!number.startsWith(prefix)) continue;
    const seq = Number.parseInt(number.slice(prefix.length), 10);
    if (Number.isFinite(seq)) max = Math.max(max, seq);
  }
  return max;
}
