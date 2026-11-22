// Latty Gilbert (Flirt Team) quick create: validation only, no I/O.
export const MAX_SOCIALS = 6;
const CONTENT_HOSTS = ["drive.google.com", "docs.google.com", "dropbox.com", "www.dropbox.com", "dl.dropboxusercontent.com"];
const httpsUrl = (raw: string): URL | null => {
  try { const u = new URL(raw.trim()); return u.protocol === "https:" && !u.username && !u.password ? u : null; } catch { return null; }
};
export function parseContentUrl(raw: string): string | null {
  if (raw.length > 500) return null;
  const u = httpsUrl(raw);
  return u && CONTENT_HOSTS.includes(u.hostname.toLowerCase()) ? u.toString() : null;
}
export function parseSocials(raw: string): string[] | null {
  const lines = raw.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
  if (lines.length > MAX_SOCIALS) return null;
  const out: string[] = [];
  for (const line of lines) {
    if (line.length > 300) return null;
    const u = httpsUrl(/^https?:\/\//i.test(line) ? line : "https://" + line);
    if (!u || !u.hostname.includes(".")) return null;
    out.push(u.toString());
  }
  return out;
}
export function parseFullName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 2 && name.length <= 80 && !/[<>{}–—]/.test(name) ? name : null;
}
// Optional fields. null = left blank, undefined = present but invalid.
export function parseBirthDate(raw: string): string | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(v + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return undefined;
  const age = (Date.now() - d.getTime()) / 31_557_600_000;
  return age >= 18 && age < 80 ? v : undefined;
}
export function parseCity(raw: string): string | null | undefined {
  const v = raw.replace(/\s+/g, " ").trim();
  if (!v) return null;
  return v.length <= 80 && !/[<>{}–—]/.test(v) ? v : undefined;
}
export function parseSampleTexts(raw: string): string | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  return v.length <= 2000 ? v.replace(/[–—]/g, "-") : undefined;
}
