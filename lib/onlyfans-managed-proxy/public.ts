/** An explicit public projection. Never return a proxy URL or its credentials. */
export type PublicProxy = { host: string; countryCode: string | null; status: string; verifiedAt: string | null };
export function publicProxy(url: string | null, countryCode: string | null = null, status = 'assigned', verifiedAt: string | null = null): PublicProxy | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'socks5:'].includes(parsed.protocol) || !/^[a-zA-Z0-9.:[\]-]{1,253}$/.test(parsed.hostname)) return null;
    return {host: parsed.hostname, countryCode: countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : null, status, verifiedAt};
  } catch { return null; }
}
export function parsePublicProxy(value: unknown): PublicProxy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as PublicProxy;
  if (Object.keys(v).sort().join(',') !== 'countryCode,host,status,verifiedAt' || typeof v.host !== 'string' || !/^[a-zA-Z0-9.:[\]-]{1,253}$/.test(v.host)
    || !(v.countryCode === null || typeof v.countryCode === 'string' && /^[A-Z]{2}$/.test(v.countryCode))
    || !['assigned','unconfigured','pending','verified','failed','expired','paused'].includes(v.status)
    || !(v.verifiedAt === null || typeof v.verifiedAt === 'string' && Number.isFinite(Date.parse(v.verifiedAt)))) return null;
  return {host:v.host,countryCode:v.countryCode,status:v.status,verifiedAt:v.verifiedAt};
}
