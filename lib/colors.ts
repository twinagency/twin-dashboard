// Stable per-clone chart colors + avatar initials.
const PALETTE = [
  "#ec4899", "#a855f7", "#20c5d8", "#ff6b61", "#ffbe55",
  "#635bff", "#16b87a", "#3b82f6", "#f472b6", "#8b5cf6",
  "#2dd4bf", "#fb7185", "#fbbf24", "#818cf8", "#22d3ee",
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

export type CloneAppearance = {
  chart_color?: string | null;
  profile_image_path?: string | null;
};

function appearanceFromIntake(intake: unknown): CloneAppearance {
  if (!intake || typeof intake !== "object") return {};
  const appearance = (intake as { appearance?: unknown }).appearance;
  return appearance && typeof appearance === "object" ? (appearance as CloneAppearance) : {};
}

export function chartColorForClone(intake: unknown, fallbackIndex: number): string {
  const value = appearanceFromIntake(intake).chart_color;
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : colorForIndex(fallbackIndex);
}

export function profileImagePathForClone(intake: unknown): string | null {
  const value = appearanceFromIntake(intake).profile_image_path;
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
