import { isLiveAccess } from "../../deployment/flirt-live-twin.cjs";
export function isFlirtOnlyFansOwner(access: unknown, authenticated: boolean, env: { FLIRT_SHARED_ONLYFANS_ENABLED?: string } = process.env): boolean {
  return env.FLIRT_SHARED_ONLYFANS_ENABLED === "true" && authenticated && isLiveAccess(access);
}
