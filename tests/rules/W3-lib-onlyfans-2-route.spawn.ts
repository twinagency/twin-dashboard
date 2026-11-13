/**
 * Spawns tests/rules/W3-lib-onlyfans-2-route.child.ts for one scenario (W3 lane lib-onlyfans-2). Shared by the
 * G06 route tests (control-refusal-copy; upstream-401 later); the `*.test.*` glob does not run this file.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { RouteRun, Scenario } from "./W3-lib-onlyfans-2-route.child";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CHILD = fileURLToPath(new URL("./W3-lib-onlyfans-2-route.child.ts", import.meta.url));

/** One JSON line from the child. A child that crashes fails here, not on a domain assertion. */
export function runRoute(scenario: Scenario): RouteRun {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--experimental-test-module-mocks", "--no-warnings", CHILD, scenario],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test" } });
  const line = child.stdout.trim().split("\n").at(-1) ?? "";
  if (!line.startsWith("{")) throw new Error(`child ${scenario} did not report (exit ${child.status}, ${String(child.error ?? "")}): ${child.stderr.slice(0, 800)}`);
  return JSON.parse(line) as RouteRun;
}
