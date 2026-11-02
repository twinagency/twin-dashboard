export type RecoverableUpload = { id: string; name: string; size: number; lastModified: number; state: string; percent: number; error?: string };
export function recoverableUploadQueue(value: unknown): RecoverableUpload[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).filter(item => item && typeof item === "object"
    && typeof item.id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.id)
    && typeof item.name === "string" && item.name.length <= 512 && Number.isSafeInteger(item.size)
    && item.size >= 0 && Number.isSafeInteger(item.lastModified)).map(item => ({
      id: item.id, name: item.name, size: item.size, lastModified: item.lastModified,
      state: item.state === "saved" ? "saved" : "reselect", percent: item.state === "saved" ? 100 : 0,
      ...(item.state !== "saved" ? { error: "Reselect this original file to reconcile or retry. Files cannot continue uploading automatically after leaving this page." } : {}),
    }));
}
