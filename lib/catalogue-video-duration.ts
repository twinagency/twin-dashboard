export type VideoSourceMetadata = { version: 1; durationSeconds: number };

export function validVideoDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function parseVideoSourceMetadata(value: unknown): VideoSourceMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const metadata = value as Partial<VideoSourceMetadata>;
  return metadata.version === 1 && validVideoDuration(metadata.durationSeconds)
    ? { version: 1, durationSeconds: metadata.durationSeconds } : null;
}

export function formatVideoDuration(value: unknown): string | null {
  if (!validVideoDuration(value)) return null;
  const total = Math.max(1, Math.round(value));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
