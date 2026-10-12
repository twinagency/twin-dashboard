// Optional additive column: older databases retain their existing model routing.
// Only a confirmed missing-column error can use the old projection. Outages and
// permission failures must fail rather than silently select the wrong model.
export async function withPhotoVisionColumn<T extends { error: { code?: string; message: string } | null }>(
  read: (includePhotoModel: boolean) => PromiseLike<T>,
): Promise<T> {
  const result = await read(true);
  const e = result.error;
  if (e && ["42703", "PGRST204"].includes(e.code ?? "") && /photo_vision_model/.test(e.message)) return await read(false);
  return result;
}
