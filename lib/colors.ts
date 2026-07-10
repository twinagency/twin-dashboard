// Stable per-clone chart colors + avatar initials.
const PALETTE = [
  "#ec4899", "#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b",
  "#ef4444", "#3b82f6", "#14b8a6", "#f97316", "#a855f7",
  "#eab308", "#10b981", "#6366f1", "#f43f5e", "#0ea5e9",
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
