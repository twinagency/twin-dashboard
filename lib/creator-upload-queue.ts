/** Shared across content categories: two transfers per browser page. */
export const CREATOR_UPLOAD_CONCURRENCY = 2;
let active = 0;
const waiting: Array<() => void> = [];
export async function inCreatorUploadSlot<T>(upload: () => Promise<T>): Promise<T> {
  await new Promise<void>(resolve => {
    const enter = () => { active += 1; resolve(); };
    if (active < CREATOR_UPLOAD_CONCURRENCY) enter();
    else waiting.push(enter);
  });
  try { return await upload(); }
  finally { active -= 1; waiting.shift()?.(); }
}
