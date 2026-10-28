export const ONLYFANS_TIME_ZONE = "Australia/Brisbane";
export function displayTime(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return "Time unavailable";
  return new Date(value).toLocaleTimeString("en-AU", { timeZone: ONLYFANS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }) + " AEST";
}
export function displayDay(value: string): string {
  return new Date(value).toLocaleDateString("en-AU", { timeZone: ONLYFANS_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
}
export function displayDateTime(value: string): string { return displayDay(value) + ", " + displayTime(value); }
