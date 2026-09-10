import type { CachedRevenue } from './revenue-cache';
import type { Period } from './dashboard-data';

/** Browser-safe contract. Never widen this to the internal rollup type. */
export type CreatorReportIdentity = {
  accountId: string;
  userId: string;
  displayName: string;
  accountStatus: string;
  cloneId: string | null;
  cloneName: string | null;
  revenueSharePercent: number | null;
  onboardingComplete: boolean;
};
export type CreatorReportQuery = {
  period: Period;
  startDate?: string;
  endDate?: string;
  format: 'json' | 'csv';
};
export type CreatorReport = {
  period: Period;
  cachedAt: number;
  ageSeconds: number;
  stale: boolean;
  metrics: {
    revenueStars: number;
    estimatedEarningsStars: number | null;
    revenueSharePercent: number | null;
    sales: number;
    buyers: number;
    averageOrderStars: number | null;
    activeUsers: number;
    messages: number;
    newFans: number;
    totalFans: number;
    reachable24h: number;
    repeatPct: number;
  };
  series: { label: string; stars: number }[];
  byFeature: { key: string; label: string; stars: number; sales: number; averageStars: number | null }[];
  byDayOfWeek: { label: string; stars: number }[];
  byHour: { label: string; stars: number }[];
  conversion: {
    activeChatters: number;
    activeChatBuyers: number;
    activeChatBuyerRate: number | null;
    lifetimeFanProfiles: number;
    lifetimeBuyerProfiles: number;
    lifetimeBuyerRate: number | null;
  };
  transactions: { buyerName: string; kind: string; stars: number; paidAt: string }[];
};
export type CreatorReportResponse =
  | { state: 'awaiting_connection'; report: null }
  | { state: 'ready'; report: CreatorReport };

export class CreatorReportError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validCreatorId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
export function readableCreatorAccount(value: unknown): boolean {
  // Migrated, linked accounts can still be applicants. Pausing a clone must
  // not erase access to its historical reports. Rejected/archived are denied.
  return typeof value === 'string' && ['applicant', 'approved', 'active', 'paused'].includes(value);
}
export function validRevenueShare(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
export function creatorReportingScope(identity: CreatorReportIdentity) {
  if (!validCreatorId(identity.accountId) || !validCreatorId(identity.userId) || !validCreatorId(identity.cloneId)) {
    throw new CreatorReportError(403, 'Creator access is unavailable.');
  }
  if (!readableCreatorAccount(identity.accountStatus)) throw new CreatorReportError(403, 'Creator access is unavailable.');
  // Request-local reporting scope only, NOT an agency login or membership.
  // The prefix cannot collide with a real agency UUID or an admin cache key.
  return { id: `creator:${identity.accountId}`, name: 'Creator reporting', cloneIds: [identity.cloneId] };
}

const PERIODS = new Set<Period>(['ALL', '1Y', '6M', '3M', '1M', '2W', '1W', '1D']);
const ALLOWED_PARAMS = new Set(['period', 'startDate', 'endDate', 'format']);
function dateValue(value: string | null): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CreatorReportError(400, 'Choose valid start and end dates.');
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new CreatorReportError(400, 'Choose valid start and end dates.');
  }
  return ms;
}
export function parseCreatorReportQuery(params: URLSearchParams): CreatorReportQuery {
  for (const key of params.keys()) {
    // Scope is never taken from a URL, a submitted account ID, or a selector.
    if (!ALLOWED_PARAMS.has(key)) throw new CreatorReportError(400, 'Unsupported report parameter.');
    if (params.getAll(key).length !== 1) throw new CreatorReportError(400, 'Duplicate report parameter.');
  }
  const format = params.get('format') || 'json';
  if (format !== 'json' && format !== 'csv') throw new CreatorReportError(400, 'Unsupported report format.');
  const period = (params.get('period') || '1M').toUpperCase() as Period;
  const startDate = params.get('startDate');
  const endDate = params.get('endDate');
  if (startDate !== null || endDate !== null) {
    const start = dateValue(startDate), end = dateValue(endDate);
    if (end < start || end - start > 365 * 86_400_000) {
      throw new CreatorReportError(400, 'Choose an ordered date range of no more than 366 days.');
    }
    if (params.has('period') && period !== 'CUSTOM') throw new CreatorReportError(400, 'Choose a preset or custom dates, not both.');
    return { period: 'CUSTOM', startDate: startDate!, endDate: endDate!, format };
  }
  if (!PERIODS.has(period)) throw new CreatorReportError(400, 'Unsupported reporting period.');
  return { period, format };
}

const featureLabels: Record<string, string> = {
  credits: 'Paid messages', photo: 'Photos', video: 'Videos', bundle: 'Bundles',
  media: 'Media (untagged)', tip: 'Tips', subscription: 'Subscriptions',
  refund: 'Refunds / adjustments', other: 'Other',
};
function finite(value: number): number {
  if (!Number.isFinite(value)) throw new CreatorReportError(503, 'Report data is temporarily unavailable.');
  return value;
}
function nullable(value: number | null): number | null { return value === null ? null : finite(value); }

export function projectCreatorReport(raw: CachedRevenue, identity: CreatorReportIdentity): CreatorReport {
  const scope = creatorReportingScope(identity);
  const cloneId = scope.cloneIds[0];
  const d = raw.dashboard, a = raw.analytics;
  // Defense in depth. Even a regression in an upstream query/cache must not
  // serialize a fleet snapshot as a creator report. Deny, do not hide columns.
  const wrongClone = (id: string) => id !== cloneId;
  if (d.clones.some(c => wrongClone(c.id)) || a.clones.some(c => wrongClone(c.id)) ||
      Object.keys(d.perClone).some(wrongClone) || d.recent.some(t => wrongClone(t.cloneId)) ||
      d.series.some(row => Object.keys(row).some(key => key !== 'bucket' && key !== cloneId))) {
    throw new CreatorReportError(503, 'Report data is temporarily unavailable.');
  }
  const stats = d.perClone[cloneId];
  if (!stats || !d.clones.some(c => c.id === cloneId)) throw new CreatorReportError(503, 'Report data is temporarily unavailable.');
  const share = validRevenueShare(identity.revenueSharePercent);
  const revenueStars = finite(stats.stars);
  return {
    period: d.period, cachedAt: finite(raw.cachedAt), ageSeconds: finite(raw.ageSeconds), stale: raw.stale,
    metrics: {
      revenueStars,
      // An estimate on recorded net receipts, NOT a Telegram balance or paid settlement.
      estimatedEarningsStars: share === null ? null : revenueStars * share / 100,
      revenueSharePercent: share,
      sales: finite(stats.sales), buyers: finite(stats.buyers),
      averageOrderStars: stats.sales > 0 ? finite(stats.grossPaymentStars) / stats.sales : null,
      activeUsers: finite(stats.activeUsers), messages: finite(stats.messages), newFans: finite(stats.newFans),
      totalFans: finite(stats.totalFans), reachable24h: finite(stats.reachable24h), repeatPct: finite(stats.repeatPct),
    },
    series: d.series.map((row, index) => ({ label: d.bucketLabels[index] || String(row.bucket || ''), stars: finite(Number(row[cloneId] ?? 0)) })),
    byFeature: a.byFeature.map(row => ({
      key: row.key, label: featureLabels[row.key] || 'Other', stars: finite(row.stars), sales: finite(row.sales),
      averageStars: row.sales > 0 && row.key !== 'refund' ? finite(row.avgStars) : null,
    })),
    byDayOfWeek: a.byDow.map(row => ({ label: row.label, stars: finite(row.stars) })),
    byHour: a.byHour.map(row => ({ label: row.label, stars: finite(row.stars) })),
    conversion: {
      activeChatters: finite(a.buyerConversion.activeChatters), activeChatBuyers: finite(a.buyerConversion.activeChatBuyers),
      activeChatBuyerRate: nullable(a.buyerConversion.activeChatBuyerRate),
      lifetimeFanProfiles: finite(a.buyerConversion.lifetimeFanProfiles), lifetimeBuyerProfiles: finite(a.buyerConversion.lifetimeBuyerProfiles),
      lifetimeBuyerRate: nullable(a.buyerConversion.lifetimeBuyerRate),
    },
    // No Telegram IDs, media signing URLs, tokens, costs, margin, prompts or
    // unselected future fields. This export is explicitly the latest 100, not all history.
    transactions: d.recent.slice(0, 100).map(t => ({
      buyerName: t.buyerName || 'Fan', kind: featureLabels[t.kind] || 'Other',
      stars: finite(t.stars), paidAt: t.paidAt,
    })),
  };
}

export function creatorTransactionsCsv(report: CreatorReport): string {
  const cell = (value: string | number) => {
    let text = String(value);
    // Prevent spreadsheet formula injection in fan-supplied names.
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows: (string | number)[][] = [
    ['Paid at (ISO)', 'Fan', 'Transaction type', 'Stars (signed)'],
    ...report.transactions.map(t => [t.paidAt, t.buyerName, t.kind, t.stars]),
  ];
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
