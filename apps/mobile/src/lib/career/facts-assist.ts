/**
 * Achievement assistant (spec section 22; website FactEditor
 * `achievementNeedsNumber`): an achievement with no number in its statement
 * and no metric gets an optional question. FlacronCV never fills in a figure;
 * only what the person types is saved.
 */
export function achievementNeedsNumber(statement: string, metric: string): boolean {
  if (metric.trim().length > 0) return false;
  if (statement.trim().length === 0) return false;
  return !/\d/.test(statement);
}
