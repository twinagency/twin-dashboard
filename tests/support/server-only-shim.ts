// W5 close: makes the `server-only` marker resolvable under init.sh's plain `node --import tsx --test` (no
// TSX_TSCONFIG_PATH=scripts/tsconfig.json there). Same trick as tests/helpers/W3-api-onlyfans-plus7-harness.ts: a
// throwaway NODE_PATH dir (os tmpdir, removed on exit) holding an empty `server-only` package. Import before any lib/.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const shim = mkdtempSync(join(tmpdir(), "w5-server-only-"));
mkdirSync(join(shim, "server-only"));
writeFileSync(join(shim, "server-only", "index.js"), "// empty marker (Next maps server-only to an empty module on the server)\n");
process.env.NODE_PATH = [shim, process.env.NODE_PATH].filter(Boolean).join(delimiter);
(Module as unknown as { _initPaths: () => void })._initPaths();
process.on("exit", () => rmSync(shim, { recursive: true, force: true }));
