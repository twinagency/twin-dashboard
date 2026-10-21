const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseTeamCommand(fd: FormData, managementAvailable: boolean) {
  try {
    const single = (name: string) => {
      const values = fd.getAll(name);
      if (values.length > 1 || values.some(v => typeof v !== "string")) throw Error("Invalid field");
      return String(values[0] ?? "");
    };
    if ([...fd.keys()].some(k => !["operation","email","user_id","revision","id","access","creator_scope","creator_ids"].includes(k))) return null;
    const operation = single("operation");
    if (operation === "revoke-invite") { const id = single("id"); return uuid.test(id) ? {operation,id} : null; }
    const user_id = single("user_id"), revision = single("revision");
    if (operation === "remove") return uuid.test(user_id) && uuid.test(revision) ? {operation,user_id,revision} : null;
    if (!["invite","update"].includes(operation)) return null;
    const creator_scope = single("creator_scope"), access = single("access");
    const raw = fd.getAll("creator_ids");
    if (!["all","selected"].includes(creator_scope) || !["read","manage"].includes(access) || access === "manage" && !managementAvailable
      || raw.length>1000 || raw.some(id => typeof id !== "string" || !uuid.test(id)) || creator_scope === "all" && raw.length) return null;
    const scope = {creator_scope,creator_ids:[...new Set(raw as string[])],can_manage:access === "manage"};
    if (operation === "update") return uuid.test(user_id) && uuid.test(revision) ? {operation,user_id,revision,...scope} : null;
    const email = single("email").trim().toLowerCase();
    return email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? {operation,email,...scope} : null;
  } catch { return null; }
}
