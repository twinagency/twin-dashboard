import { safeCreatorNext } from "./creator-routing";

/** Carry only an allowed creator destination through public recovery screens. */
export function creatorRecoveryPath(path: string, next: string | null | undefined) {
  return `${path}?next=${encodeURIComponent(safeCreatorNext(next))}`;
}
