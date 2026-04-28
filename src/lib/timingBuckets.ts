export interface TimingBucket {
  label: string;
  value: number | null;
}

export const PRE_BUCKETS: TimingBucket[] = [
  { label: 'No due date', value: null },
  { label: '1 month before opening', value: -30 },
  { label: '2 weeks before opening', value: -14 },
  { label: '1 week before opening', value: -7 },
  { label: '3 days before opening', value: -3 },
  { label: 'Opening day', value: 0 },
];

export const POST_BUCKETS: TimingBucket[] = [
  { label: 'No due date', value: null },
  { label: 'Closing day', value: 0 },
  { label: '3 days after closing', value: 3 },
  { label: '1 week after closing', value: 7 },
  { label: '2 weeks after closing', value: 14 },
  { label: '1 month after closing', value: 30 },
];

export function getBuckets(phase: 'pre' | 'post'): TimingBucket[] {
  return phase === 'pre' ? PRE_BUCKETS : POST_BUCKETS;
}

export function getBucketLabel(phase: 'pre' | 'post', days: number | null): string {
  const buckets = getBuckets(phase);
  return buckets.find((b) => b.value === days)?.label ?? 'Custom';
}

export function bucketValueToString(value: number | null): string {
  return value === null ? '' : String(value);
}

export function stringToBucketValue(s: string): number | null {
  return s === '' ? null : Number(s);
}
