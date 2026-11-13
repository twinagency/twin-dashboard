// What scripts/check.sh runs per mode. Row 0 is premerge.sh; then every test:* leaf in package.json that premerge.sh does not
// already run, tagged
//   run    promoted: runs in fast and full
//   full   NEEDS something fast lacks on this box (scrubbed env, loopback-only network, one checkout): full only, with only its env
//   owner  needs live-shaped data: never run, listed every run
// A leaf is a run of consecutive same-tag commands in one script's && chain, so `build && check` stays one step.
// premerge.sh --list is the single source of what premerge covers. plan() throws rather than guess: an unparsed separator,
// an `npm run` it cannot follow, or a NEEDS/OWNER entry that matches no leaf.
// CLI: node --import tsx scripts/check-plan.ts <mode>  ->  one row per line: name, action (run|skip|plan), note, env, cmd, \x1f-separated.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const OWNER = [
  "check-revenue-rollups.ts",
  "check-window-tiles.ts",
  "check-users-tile.ts",
  "check-conversation-funnel.ts",
  "check-buyer-conversion.ts",
];
export const NEEDS: Record<string, [reason: string, env?: string[]]> = {
  "check-commercial-category-http.ts": ["commercial backend on :18787", ["COMMERCIAL_TEST_BACKEND"]],
  "build-engine-journey.mjs": ["ENGINE_BROWSER_OUTPUT + Chromium", ["ENGINE_BROWSER_BASE_CSS", "ENGINE_BROWSER_OUTPUT"]],
  "check-engine-journey.mjs": [
    "ENGINE_BROWSER_OUTPUT + Chromium",
    ["ENGINE_BROWSER_ARTIFACTS", "ENGINE_BROWSER_OUTPUT", "ENGINE_JOURNEY_ARTIFACT", "ENGINE_SEQUENCE_ARTIFACT", "PREVIEW_CHROME"],
  ],
  "check-ai-models.ts": ["../twin-sexbot checkout"],
  "check-mini-app-sell-toggle.ts": ["../twin-bot checkout"],
  "check-sequence-render.ts": ["../twin-bot checkout"],
  "check-sequence-ui.ts": ["../twin-bot checkout"],
  "check-media-repair-db.ts": ["docker rig (scripts/media-repair-db/rig.sh up)", ["MR_PG_NAME", "MR_REST_PORT"]],
  "check-creator-video-upload.cjs": ["/usr/bin/ffmpeg", ["CREATOR_UPLOAD_BOUNDARY_FIXTURE", "DASHBOARD_PUBLIC_ORIGIN"]],
  "check-onlyfans-agency-http.ts": ["PREVIEW_CHROME + OnlyFans backend fixture", ["PREVIEW_CHROME"]],
};
export const MODES = ["fast", "full", "plan"];
export type Leaf = { name: string; kind: "run" | "full" | "owner"; why: string; env: string[]; cmd: string };
export type Row = { name: string; action: "run" | "skip" | "plan"; note: string; env: string[]; cmd: string };
type Tag = Pick<Leaf, "kind" | "why" | "env"> & { files: string[]; entry?: string };
const PREMERGE: Leaf = { name: "premerge", kind: "run", why: "", env: ["PREMERGE_BASE"], cmd: "scripts/premerge.sh" };

/** [script, command] for every leaf command reached from npm script `n`, following `npm run` through `&&` only; any other ;|&\n throws. */
export function leavesOf(scripts: Record<string, string>, n: string): [string, string][] {
  if (!(n in scripts)) throw new Error(`npm run ${n}: no such script in package.json`);
  return scripts[n].split("&&").map((c) => c.trim()).flatMap((c): [string, string][] => {
    if (/[;|&\n]/.test(c)) throw new Error(`${n}: cannot split "${c}" (only && is parsed)`); // a lone & backgrounds: exit 0 on a fail
    const m = /^npm run (?:-s )?(\S+)$/.exec(c);
    if (!m && /^npm /.test(c)) throw new Error(`${n}: cannot follow "${c}"`);
    return m ? leavesOf(scripts, m[1]) : [[n, c]];
  });
}
const key = (c: string) => c.replace(/^node --import tsx /, "tsx ");
export const testScripts = (scripts: Record<string, string>) => Object.keys(scripts).filter((n) => /^test(:|$)/.test(n));
export const premergeSuites = () => execFileSync("bash", ["scripts/premerge.sh", "--list"], { encoding: "utf8" }).split(/\s+/).filter(Boolean);

/** Tag one command by the script files it names. OWNER wins over NEEDS; anything else is promoted. `entry` = the list entry used. */
export function classify(cmd: string, needs = NEEDS, owner = OWNER): Tag {
  const files = (cmd.match(/[\w./-]+\.[cm]?[jt]sx?\b/g) ?? []).map((f) => f.split("/").pop()!);
  const own = files.find((f) => owner.includes(f));
  if (own) return { files, entry: own, kind: "owner", why: "needs live-shaped data; owner-run only", env: [] };
  const need = files.find((f) => f in needs);
  if (need) return { files, entry: need, kind: "full", why: needs[need][0], env: needs[need][1] ?? [] };
  return { files, kind: "run", why: "", env: [] };
}

/** `base`, or `base#2`, `base#3`... the first time each is asked for. */
function uniqueName(taken: Map<string, number>, base: string): string {
  const k = (taken.get(base) ?? 0) + 1;
  taken.set(base, k);
  return k > 1 ? `${base}#${k}` : base;
}

/** Append the next command of the same && chain, with the same tag, to `leaf`. */
function extend(leaf: Leaf, cmd: string, tag: Tag) {
  leaf.cmd += ` && ${cmd}`;
  leaf.env = [...new Set([...leaf.env, ...tag.env])];
  if (!leaf.why.split(", ").includes(tag.why)) leaf.why += `, ${tag.why}`;
}

export function plan(scripts: Record<string, string>, covered: string[], needs = NEEDS, owner = OWNER): Leaf[] {
  const seen = new Set(covered.flatMap((n) => leavesOf(scripts, n)).map(([, c]) => key(c)));
  const used = new Set<string>();
  const names = new Map<string, number>();
  const out: Leaf[] = [];
  for (const n of testScripts(scripts)) {
    let prev: { origin: string; leaf: Leaf } | undefined;
    for (const [origin, cmd] of leavesOf(scripts, n)) {
      if (seen.has(key(cmd))) {
        prev = undefined;
        continue;
      }
      seen.add(key(cmd));
      const tag = classify(cmd, needs, owner);
      if (tag.entry) used.add(tag.entry);
      if (prev && prev.origin === origin && prev.leaf.kind === tag.kind) {
        extend(prev.leaf, cmd, tag);
        continue;
      }
      const stem = (tag.files[0] ?? "cmd").replace(/\.[^.]+$/, "");
      const leaf: Leaf = { name: uniqueName(names, `${origin}/${stem}`), kind: tag.kind, why: tag.why, env: tag.env, cmd };
      out.push(leaf);
      prev = { origin, leaf };
    }
  }
  const dead = [...Object.keys(needs), ...owner].filter((f) => !used.has(f));
  if (dead.length) throw new Error(`NEEDS/OWNER entries match no leaf the harness would run: ${dead.join(", ")}`);
  return out;
}

/** What check.sh does with one leaf in `mode`: fast runs `run` leaves, full adds `full` ones, plan runs nothing. */
function row(mode: string, { name, kind, why, env, cmd }: Leaf): Row {
  const runs = kind === "run" || (kind === "full" && mode === "full");
  if (runs) return { name, action: mode === "plan" ? "plan" : "run", note: "", env, cmd };
  const note = kind === "full" ? `full only, needs ${why}` : `never run by this harness: ${why}`;
  return { name, action: "skip", note, env, cmd };
}

export function rows(mode: string, leaves: Leaf[]): Row[] {
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}" (${MODES.join("|")})`);
  return [PREMERGE, ...leaves].map((leaf) => row(mode, leaf));
}

if (process.argv[1]?.endsWith("check-plan.ts")) {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  for (const r of rows(process.argv[2], plan(scripts, premergeSuites()))) {
    console.log([r.name, r.action, r.note, r.env.join(" "), r.cmd].join("\x1f"));
  }
}
