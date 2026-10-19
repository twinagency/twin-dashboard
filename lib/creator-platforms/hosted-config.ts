import "server-only";
import { configuredBackendPurpose } from "@/lib/onlyfans/backend-transport";
export function hostedConfigured() {
  return process.env.ONLYFANS_HOSTED_CONNECT_ENABLED === "1"
    && /^[\x21-\x7e]{16,4096}$/.test(process.env.OFAPI_API_KEY || "")
    && (process.env.OFAPI_WEBHOOK_SECRET || "").length >= 32
    && !!configuredBackendPurpose("CONNECTION");
}
