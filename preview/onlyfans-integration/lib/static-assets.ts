import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The shared shell references files under the real dashboard's public/ folder
 * (/brand/platforms/onlyfans.svg and others). This isolated app has no public/
 * of its own, so those requests answered 404 and the Overview's no-error check
 * failed. Serve exactly those files from ../../public, read-only, through route
 * handlers: no symlink (the paired source archive rejects those) and no copy
 * step that the test runner would have to remember.
 */
const PUBLIC_ROOT = path.resolve(process.cwd(), "../../public");
const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon",
};

export async function servePublic(segments: string[]): Promise<Response> {
  const relative = path.posix.join(...segments);
  const type = TYPES[path.extname(relative).toLowerCase()];
  const absolute = path.resolve(PUBLIC_ROOT, relative);
  if (!type || relative.split("/").includes("..") || !absolute.startsWith(PUBLIC_ROOT + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    return new Response(new Uint8Array(await readFile(absolute)), {
      headers: { "content-type": type, "cache-control": "no-store" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
