// Throwaway-PostgreSQL helper for the W5 db-migrations lane tests.
// Only ever talks to 127.0.0.1:<W5_MIGRATIONS_PGPORT>; refuses the shared/local-stack ports, and before any write
// proves the cluster is throwaway: its data_directory must resolve under /tmp or os.tmpdir().
// Every database it creates is named w5_dbmig_* and is dropped by the caller's after().
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const HOST = "127.0.0.1";
const REFUSED = new Set([5432, 54321, 54322, 55432]);
const PSQL = existsSync("/opt/homebrew/bin/psql") ? "/opt/homebrew/bin/psql" : "psql";
let raw = process.env.W5_MIGRATIONS_PGPORT;

// W5 close: with W5_MIGRATIONS_PGPORT unset (init.sh's scrubbed env), start an own throwaway cluster when the server
// binaries exist: initdb into a fresh /tmp dir, listen on 127.0.0.1 only, socket inside the data dir, a random port in
// 56100-56899 (never a REFUSED port), stopped and removed on exit. The throwaway proof below still runs before any write.
const PG_BIN = process.env.W5_PG_BIN || "/Library/PostgreSQL/18/bin";
function autoCluster() {
  if (!existsSync(`${PG_BIN}/initdb`) || !existsSync(`${PG_BIN}/pg_ctl`) || !existsSync(`${PG_BIN}/postgres`)) return null;
  const dir = mkdtempSync(`${realpathSync("/tmp")}/w5-dbmig-auto-`), data = `${dir}/data`;
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: "C" };
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; spawnSync(`${PG_BIN}/pg_ctl`, ["-D", data, "-m", "immediate", "-w", "stop"], { env, stdio: "ignore" }); rmSync(dir, { recursive: true, force: true }); };
  const init = spawnSync(`${PG_BIN}/initdb`, ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-instructions"], { env, encoding: "utf8" });
  if (init.status !== 0) { stop(); return null; }
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = 56100 + Math.floor(Math.random() * 800);
    const start = spawnSync(`${PG_BIN}/pg_ctl`, ["-D", data, "-l", `${dir}/log`, "-w", "-t", "30", "-o", `-p ${p} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${data}`, "start"], { env, encoding: "utf8" });
    if (start.status === 0) {
      process.on("exit", stop);
      // An interrupted run (Ctrl-C, test-runner cancel) must not leave the cluster running.
      for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) process.once(signal, () => { stop(); process.exit(code); });
      return String(p);
    }
  }
  stop();
  return null;
}
if (!raw) raw = autoCluster() ?? undefined;
// G30: under CI a missing cluster is a failure, never a skip (a skip there is a silent false green). Set W5_PG_BIN.
if (!raw && process.env.CI) throw new Error(`CI: no throwaway PostgreSQL cluster (W5_MIGRATIONS_PGPORT unset, none started from ${PG_BIN}); set W5_PG_BIN to the server bin dir`);

export const skipReason = raw
  ? false
  : `W5_MIGRATIONS_PGPORT unset and no PostgreSQL server binaries in ${PG_BIN}: needs a throwaway PostgreSQL cluster on 127.0.0.1 (superuser postgres, trust auth)`;

function port() {
  const p = Number(raw);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) throw new Error(`W5_MIGRATIONS_PGPORT invalid: ${raw}`);
  if (REFUSED.has(p)) throw new Error(`W5_MIGRATIONS_PGPORT ${p} refused: shared or local-stack port, throwaway clusters only`);
  return p;
}

// Positive throwaway proof. Pure predicate (unit-checkable): dataDir and roots are already realpath'd.
export function throwawayDataDirVerdict(dataDir, roots) {
  if (!dataDir) return "no data_directory reported";
  const under = roots.find(r => dataDir === r || dataDir.startsWith(r.endsWith(sep) ? r : r + sep));
  return under ? null : `data_directory ${dataDir} is not under ${roots.join(" or ")}`;
}
const tempRoots = () => [...new Set(["/tmp", tmpdir()].map(r => { try { return realpathSync(r); } catch { return null; } }).filter(Boolean))];
let proven = false;
export function assertThrowawayCluster() {
  if (proven) return;
  const reported = psql("postgres", ["-At"], "show data_directory;").trim();
  let real = null;
  try { real = realpathSync(reported); } catch { /* not a local path: refuse below */ }
  const why = real ? throwawayDataDirVerdict(real, tempRoots()) : `data_directory ${JSON.stringify(reported)} does not resolve on this machine`;
  if (why) throw new Error(`refusing 127.0.0.1:${port()}: not provably a throwaway cluster (${why}); W5 tests only run against a temp-dir cluster`);
  proven = true;
}

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
export function migration(name) {
  const path = MIGRATIONS + name;
  if (!existsSync(path)) throw new Error(`migration not found: ${path}`);
  return path;
}

function psql(db, args, input) {
  const r = spawnSync(PSQL, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", HOST, "-p", String(port()), "-U", "postgres", "-d", db, ...args], {
    input, encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PGCONNECT_TIMEOUT: "5", PGAPPNAME: "w5-db-migrations-test" },
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`psql exit ${r.status}: ${r.stderr.trim()}`);
  return r.stdout;
}

const ROLES = ["anon", "authenticated", "service_role"];
const createdRoles = new Set(); // roles this process created; dropped again once no w5_dbmig_ database is left

export function freshDb() {
  assertThrowawayCluster(); // before any role/database write
  const name = `w5_dbmig_${process.pid}_${randomBytes(4).toString("hex")}`;
  const missing = psql("postgres", ["-At"], `select x.n from unnest(array['${ROLES.join("','")}']) x(n) where not exists(select 1 from pg_roles r where r.rolname=x.n);`)
    .split("\n").filter(Boolean);
  for (const role of missing) { psql("postgres", [], `create role ${role}${role === "service_role" ? " bypassrls" : ""};`); createdRoles.add(role); }
  try {
    psql("postgres", [], `create database ${name};`);
    // Supabase-like defaults inside the new database only.
    psql(name, [], `
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
      grant usage on schema public to anon,authenticated,service_role;`);
  } catch (e) { dropDb(name); throw e; } // no leaked database (or roles) if setup fails
  const run = (sqlOrFile) => sqlOrFile.endsWith(".sql") && existsSync(sqlOrFile)
    ? psql(name, ["-f", sqlOrFile])
    : psql(name, [], sqlOrFile);
  // query(sql, {role}) -> array of row objects (via json_agg); sql must be a single SELECT without trailing semicolon.
  const query = (sql, { role } = {}) => {
    const out = psql(name, ["-At"], `${role ? `set role ${role};\n` : ""}select coalesce(json_agg(t),'[]'::json) from (${sql}) t;`);
    return JSON.parse(out.trim());
  };
  return { name, run, query, drop: () => dropDb(name) };
}

function dropDb(name) {
  psql("postgres", [], `drop database if exists ${name} with (force);`);
  // Leave the cluster as found: drop roles this run created, if no other w5_dbmig_ database still uses them.
  const others = psql("postgres", ["-At"], `select count(*) from pg_database where datname like 'w5\\_dbmig\\_%';`).trim();
  if (others === "0") for (const role of [...createdRoles]) {
    try { psql("postgres", [], `drop role if exists ${role};`); createdRoles.delete(role); } catch { /* still referenced elsewhere */ }
  }
}

// SQL literal for a JSON command (fixture values only: uuids, emails, hex).
export const jsonb = (obj) => `'${JSON.stringify(obj).replaceAll("'", "''")}'::jsonb`;
