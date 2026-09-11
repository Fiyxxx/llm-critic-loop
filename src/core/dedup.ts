function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

/**
 * Overlap coefficient: |A ∩ B| / min(|A|, |B|). Chosen over Jaccard so a
 * short, reworded restatement of a longer issue still scores as near-1 —
 * duplicates aren't always the same length.
 */
export function wordOverlap(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

export function isDuplicate(
  description: string,
  priorDigests: string[],
  threshold: number,
): boolean {
  return priorDigests.some((digest) => wordOverlap(description, digest) >= threshold);
}
