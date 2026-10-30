// Creator-scoped delivery preferences. Other creators retain the existing path.
export const KATIE_CLONE_ID = "dfcab3fc-a30b-44ad-868f-3cf20a877b90";
export const isKatie = (id: string | undefined) => id === KATIE_CLONE_ID;
export const CONVERSATION_COLUMNS = ["response_wait_min", "response_wait_max", "bubble_delay_min_ms", "bubble_delay_max_ms", "double_texts", "double_text_level"];
export type ConversationSettings = { waitMinMs: number; waitMaxMs: number; bubbleMinMs: number; bubbleMaxMs: number; splitChance: number };
export function conversationSettings(row: { id: string; [key: string]: unknown }): ConversationSettings | undefined {
  if (!isKatie(row.id)) return undefined;
  const number = (key: string, fallback: number, ceiling: number) => typeof row[key] === "number" && Number.isFinite(row[key]) && (row[key] as number) >= 0 && (row[key] as number) <= ceiling ? row[key] as number : fallback;
  const min = number("response_wait_min", 25, 300), max = number("response_wait_max", 90, 300);
  const bubbleMin = number("bubble_delay_min_ms", 2000, 10000), bubbleMax = number("bubble_delay_max_ms", 5000, 10000);
  return { waitMinMs: Math.min(min, max) * 1000, waitMaxMs: Math.max(min, max) * 1000,
    bubbleMinMs: Math.min(bubbleMin, bubbleMax), bubbleMaxMs: Math.max(bubbleMin, bubbleMax),
    splitChance: row.double_texts === false || row.double_text_level === "never" ? 0 : 0.35 };
}
export function randomDelay(min: number, max: number, random = Math.random): number {
  return min + Math.floor(Math.max(0, Math.min(1, random())) * (max - min));
}
/** Preserve complete sentences and wording; never manufacture an extra thought. */
export function conversationBubbles(text: string, settings: ConversationSettings | undefined, random = Math.random): string[] {
  if (!settings || random() >= settings.splitChance || text.trim().split(/\s+/).length < 8) return [text];
  const segments = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)];
  const cuts = segments.slice(1).map(s => s.index).filter(i => {
    const a = text.slice(0, i).trim(), b = text.slice(i).trim();
    return a.split(/\s+/).length >= 3 && b.split(/\s+/).length >= 3 && !/^(?:x|xx)[.!?]*$/i.test(b);
  });
  if (!cuts.length) return [text];
  const cut = cuts.reduce((best, i) => Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2) ? i : best);
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}
/** The same injected wait owner as delivery retries; reset/stop checks stay responsive. */
export async function waitWhileCurrent(ms: number, wait: (ms: number) => Promise<void>, current: () => boolean): Promise<boolean> {
  for (let left = Math.max(0, ms); left > 0; left -= Math.min(250, left)) {
    if (!current()) return false;
    await wait(Math.min(250, left));
  }
  return current();
}
