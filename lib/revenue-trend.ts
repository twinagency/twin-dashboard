/**
 * Compare the average chart-bucket revenue in the latter half of a selected
 * range with the earlier half.
 *
 * This is deliberately an intra-period signal, not a previous-period
 * comparison. Averaging each half matters for odd bucket counts such as a
 * seven-day chart, where summing four latter buckets against three earlier
 * buckets creates a positive trend even when every day earned the same amount.
 */
export function intraPeriodTrendPct(bucketRevenue: readonly number[]): number | null {
  if (bucketRevenue.length < 2) return null;

  const midpoint = Math.floor(bucketRevenue.length / 2);
  const earlier = bucketRevenue.slice(0, midpoint);
  const latter = bucketRevenue.slice(midpoint);
  const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const earlierAverage = average(earlier);
  const latterAverage = average(latter);

  if (earlierAverage === 0) return latterAverage > 0 ? 100 : null;
  return Math.round(((latterAverage - earlierAverage) / earlierAverage) * 100);
}
