/**
 * Reorder an array by moving one element from sourceIndex to destinationIndex.
 * Returns a new array — does not mutate the original.
 */
export function reorderItems<T>(
  items: T[],
  sourceIndex: number,
  destinationIndex: number,
): T[] {
  const result = [...items];
  const [removed] = result.splice(sourceIndex, 1);
  result.splice(destinationIndex, 0, removed);
  return result;
}
