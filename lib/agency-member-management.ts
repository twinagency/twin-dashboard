/** Owner-managed agency membership commands; no new authority or member role system. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type AgencyMemberCommand =
  { agencyId: string; email: string; operation: "create"; password: string; canManage: boolean } |
  { agencyId: string; email: string; operation: "revoke"; userId?: string; expectedActive?: boolean; expectedCanManage?: boolean } |
  { agencyId: string; email: string; operation: "set-access" | "restore"; userId: string; expectedActive: boolean; expectedCanManage: boolean; canManage: boolean };
export function parseAgencyMemberCommand(fd: FormData): AgencyMemberCommand | null {
  const field = (key: string) => {
    const values = fd.getAll(key);
    if (values.length > 1 || values.some(value => typeof value !== "string")) throw new Error("Invalid form");
    return values[0] as string | undefined;
  };
  try {
    const agencyId = field("agency") ?? "", email = (field("email") ?? "").trim().toLowerCase(), operation = field("operation");
    if (!UUID.test(agencyId) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    const allowed = operation === "create" ? ["agency","email","operation","password","access"]
      : ["agency","email","operation","user_id","expected_active","expected_can_manage","access", ...(operation === "revoke" ? ["password"] : [])];
    if ([...fd.keys()].some(key => !allowed.includes(key))) return null;
    const access = field("access") ?? "read";
    if (!["read","manage"].includes(access)) return null;
    if (operation === "create") {
      const password = field("password") ?? "";
      return password.length >= 16 && password.length <= 256 ? {agencyId,email,operation,password,canManage:access === "manage"} : null;
    }
    const userId = field("user_id"), active = field("expected_active"), manage = field("expected_can_manage");
    if (operation === "revoke" && userId === undefined && active === undefined && manage === undefined) return {agencyId,email,operation};
    if (!userId || !UUID.test(userId) || !["true","false"].includes(active ?? "") || !["true","false"].includes(manage ?? "")) return null;
    const expectedActive = active === "true", expectedCanManage = manage === "true";
    if (operation === "revoke") return {agencyId,email,operation,userId,expectedActive,expectedCanManage};
    if (operation !== "set-access" && operation !== "restore" || operation === "restore" && expectedActive || operation === "set-access" && !expectedActive) return null;
    return {agencyId,email,operation,userId,expectedActive,expectedCanManage,canManage:access === "manage"};
  } catch { return null; }
}
