/**
 * Simplified SM-2-inspired spaced repetition.
 * Returns the next interval in days based on current interval and whether the answer was correct.
 */
export function nextInterval(currentInterval: number, correct: boolean): number {
  if (!correct) return 1;
  if (currentInterval <= 1) return 3;
  if (currentInterval <= 3) return 7;
  if (currentInterval <= 7) return 14;
  return Math.min(Math.round(currentInterval * 1.8), 60);
}

export function nextReviewDate(intervalDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + intervalDays);
  return date.toISOString();
}

/**
 * Returns words due for review, sorted by urgency (overdue first, then by accuracy).
 */
export function sortWordsByPriority<T extends { next_review_at: string; correct_count: number; wrong_count: number }>(
  stats: T[]
): T[] {
  const now = new Date();
  return [...stats].sort((a, b) => {
    const aOverdue = new Date(a.next_review_at) <= now;
    const bOverdue = new Date(b.next_review_at) <= now;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    const aAccuracy = a.correct_count / Math.max(1, a.correct_count + a.wrong_count);
    const bAccuracy = b.correct_count / Math.max(1, b.correct_count + b.wrong_count);
    return aAccuracy - bAccuracy;
  });
}
