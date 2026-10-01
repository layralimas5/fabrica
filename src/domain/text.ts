export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim().replace(/^[-•*]\s*|^\d+[.)]\s*/, ''))
    .filter((sentence) => sentence.length > 1);
}

/** Shortens to a word limit, preferring a sentence boundary so the slide still reads as a full thought. */
export function limitWords(text: string, limit: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (wordCount(clean) <= limit) return clean;

  let kept = '';
  for (const sentence of splitSentences(clean)) {
    const candidate = kept ? `${kept} ${sentence}` : sentence;
    if (wordCount(candidate) > limit) break;
    kept = candidate;
  }
  if (kept) return kept;

  return `${clean.split(' ').slice(0, limit).join(' ').replace(/[,;:]$/, '')}…`;
}

export function stripTrailingPeriod(text: string): string {
  return text.trim().replace(/\.$/, '');
}
