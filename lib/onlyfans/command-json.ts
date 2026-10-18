/** Bounded command JSON with duplicate object keys refused before normalization. */
export class CommandBodyTooLarge extends Error {}
export function parseCommandJson(raw: string): unknown {
  let at = 0;
  const space = () => { while (/\s/.test(raw[at] ?? "") && at < raw.length) at++; };
  function string(): string {
    const start = at++;
    while (at < raw.length) {
      const ch = raw[at++];
      if (ch === "\\") { at++; continue; }
      if (ch === '"') return JSON.parse(raw.slice(start, at));
    }
    throw new Error("Invalid JSON string");
  }
  function value(depth: number): void {
    if (depth > 16) throw new Error("Command JSON is too deep");
    space();
    if (raw[at] === '"') { string(); return; }
    if (raw[at] === "{") {
      at++; space(); const keys = new Set<string>();
      if (raw[at] === "}") { at++; return; }
      while (at < raw.length) {
        space(); if (raw[at] !== '"') throw new Error("Invalid object key");
        const key = string(); if (keys.has(key)) throw new Error("Duplicate object key"); keys.add(key);
        space(); if (raw[at++] !== ":") throw new Error("Invalid object"); value(depth + 1); space();
        const ch = raw[at++]; if (ch === "}") return; if (ch !== ",") throw new Error("Invalid object");
      }
      throw new Error("Incomplete object");
    }
    if (raw[at] === "[") {
      at++; space(); if (raw[at] === "]") { at++; return; }
      while (at < raw.length) { value(depth + 1); space(); const ch = raw[at++]; if (ch === "]") return; if (ch !== ",") throw new Error("Invalid array"); }
      throw new Error("Incomplete array");
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(at));
    if (!token) throw new Error("Invalid JSON value"); at += token[0].length;
  }
  value(0); space(); if (at !== raw.length) throw new Error("Trailing JSON data");
  const parsed: unknown = JSON.parse(raw);
  const finite = (item: unknown): boolean => typeof item === "number" ? Number.isFinite(item) :
    item !== null && typeof item === "object" ? Object.values(item).every(finite) : true;
  if (!finite(parsed)) throw new Error("Nonfinite number");
  return parsed;
}
export async function readCommandJson(request: Request, maxBytes = 65_536): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) throw new Error("Missing command body");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > maxBytes) { await reader.cancel(); throw new CommandBodyTooLarge("Command is too large"); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parseCommandJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
