# Local Runbook for Claude

Workspace: `C:/Users/conta/Documents/ChatGPT/TWIN CLONE CREATION`.

These commands are PowerShell. Execute each command in its stated checkout and inspect its exit code. They do not authorize a live integration. Read CLAUDE_HANDOVER.md first.

## 1. Inspect the Worktrees

```powershell
Set-Location 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\twin-dashboard-of-d0'
git status --short --branch
git rev-parse HEAD
git worktree list

Set-Location 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\inflowwkiller-of-b1'
git status --short --branch
git rev-parse HEAD
git worktree list
```

Compare current output with SOURCE_STATE.json. The expected base HEADs are dashboard `fb6b345692a735d131b875e7b69ce8f955ba9a03` and backend `e72316fd9c34092f767bc6e425ca9faea340da27`. The work is in modified/untracked files. Do not reset, clean or checkout those changes away. The accepted-source folder is a copy of those changes, not the full repo and not a merge instruction.

## 2. Open the Existing Fixture Preview

```powershell
Set-Location 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\twin-dashboard-of-d0'
Get-NetTCPConnection -LocalPort 3017 -State Listen -ErrorAction SilentlyContinue
```

If a listener exists, identify it and check whether it is this preview. Do not kill it blindly. If no listener exists, run:

```powershell
node node_modules/next/dist/bin/next dev preview/onlyfans -H 127.0.0.1 -p 3017
```

Keep that process alive in a dedicated terminal. This is the isolated Next project, not the root `npm run dev`. On Windows, a tool that starts background processes should use a hidden window unless the owner requested a visible terminal. If the port belongs to something else, choose another free local port and set PREVIEW_URL for browser scripts.

Check from another terminal:

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:3017/onlyfans/inbox' -UseBasicParsing
```

Preview URLs:

- http://localhost:3017/
- http://localhost:3017/onlyfans/inbox
- http://localhost:3017/onlyfans/accounts
- http://localhost:3017/overview
- http://localhost:3017/telegram
- Synthetic scoped example: http://localhost:3017/onlyfans/accounts?creator=creator-ava-0001

`ERR_CONNECTION_REFUSED` usually means the server is not running, not missing application work. Verify before claiming availability. Next compilation and hydration must complete before browser interactions/screenshots. No actual provider account, private conversation or live database is needed for this preview.

## 3. Frontend Checks

From `twin-dashboard-of-d0`, using installed dependencies:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p preview/onlyfans/tsconfig.json
npm run test:onlyfans-read
npm run test:onlyfans-unconfigured
npm run test:onlyfans-preview
npm run test:channel-integration
node node_modules/tsx/dist/cli.mjs scripts/check-sidebar-layout.tsx
node node_modules/tsx/dist/cli.mjs scripts/check-lynq-management.tsx
node node_modules/tsx/dist/cli.mjs scripts/check-creator-workspace.ts
node node_modules/tsx/dist/cli.mjs scripts/check-creator-routing.ts
```

With the preview running:

```powershell
$env:PREVIEW_URL = 'http://127.0.0.1:3017'
node preview/onlyfans/scripts/check-isolation.mjs
node preview/onlyfans/scripts/shots.mjs
```

`preview/onlyfans/scripts/chromium.mjs` searches existing Playwright Chromium installations under LOCALAPPDATA. `PREVIEW_CHROME` can override the executable. A headless shell has worked where a full Chrome build lacked the Windows side-by-side runtime. Do not assume the browser version pinned by Playwright is installed.

The screenshot script is the current naming authority; it writes 14 captures. Sample-data labels are expected in the fixture harness, not the live source. The root aggregate test chain has separate documented MTProto failures; report its actual result independently if run.

## 4. Python Runtime That Worked

The plain `python` command was a Windows Store alias during the recorded acceptance. Codex's bundled Python lacked FastAPI. A working Python 3.11.9 environment is:

```text
C:/Users/conta/Documents/ChatGPT/TWIN CLONE CREATION/inflowwkiller/.venv/Scripts/python.exe
```

Use it as an interpreter only, with CWD set to `inflowwkiller-of-b1`. The test inserts that worktree's `service/` on sys.path. Do not modify the shared environment or execute the original checkout's server by mistake. For ongoing work, use a dedicated environment pinned to repository dependencies if necessary.

Telegram's separate P2 native work has used a Python 3.13 environment under `output/telegram-p2-python313/venv/`. Compatibility of the whole native engine is distinct from OF-B1's Python 3.11 test results. Do not change runtimes silently or infer full native import compatibility from this read package.

## 5. Backend Read Checks

```powershell
Set-Location 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\inflowwkiller-of-b1'
$ofPython = 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\inflowwkiller\.venv\Scripts\python.exe'
& $ofPython service/tests/test_onlyfans_read.py
```

The accepted run had 237 checks and `all cases passed`, exit 0. It sets DATABASE_URL and CHATTERLY_DB_URL to disposable SQLite state before project imports, discards inherited OF credentials, and uses synthetic bindings/data. It imports the constructed real FastAPI app and issues requests through it with TestClient, without entering its lifespan. Do not change that into a normal relay startup against inherited state.

These are plain-assert scripts, not necessarily pytest tests. `py_compile` alone does not prove imports, startup or behavior. The suite's no-write assertions refer to the dedicated OF namespace/package, not every route in the old relay.

## 6. Disposable PostgreSQL Rehearsal

The prior acceptance used pgserver 0.1.4 unpacked under the Windows temp directory, not installed in the shared venv. The helper was found here:

```text
C:/Users/conta/AppData/Local/Temp/of-b1-pylibs/pgserver
```

When it still exists:

```powershell
Set-Location 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\inflowwkiller-of-b1'
$ofPython = 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\inflowwkiller\.venv\Scripts\python.exe'
$priorPythonPath = $env:PYTHONPATH
$priorTestPgUrl = $env:ONLYFANS_TEST_PG_URL
try {
    Remove-Item Env:ONLYFANS_TEST_PG_URL -ErrorAction SilentlyContinue
    $env:PYTHONPATH = Join-Path $env:TEMP 'of-b1-pylibs'
    & $ofPython service/tests/test_onlyfans_migration_pg.py
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL rehearsal failed.' }
} finally {
    $env:PYTHONPATH = $priorPythonPath
    $env:ONLYFANS_TEST_PG_URL = $priorTestPgUrl
}
```

Clearing ONLYFANS_TEST_PG_URL ensures this invocation cannot select an inherited server URL. The script starts a disposable PostgreSQL 16 server, creates a uniquely named scratch database, applies/reverses/reapplies its delta, checks real constraints and drops the scratch DB/stops the server.

The accepted run had 44 checks and `all cases passed`. Without pgserver or an explicit disposable-test server URL, the script prints SKIPPED and exits 0. That is NOT a passing rehearsal. Inspect the output, not only the exit code.

If the temp helper has vanished, provision a dedicated disposable PostgreSQL test runtime using the project toolchain. Do not use a live Supabase or working relay DB. ONLYFANS_TEST_PG_URL is supported for a dedicated CI/test server on which scratch database creation/drop is authorized; it is not a general production connection option.

Current limitation: the test changes seven pre-existing Boolean defaults in memory before constructing the parent schema and stamps the parent revision. It verifies the OF-B1 delta, not a complete fresh/populated historical upgrade. The next milestone must fix defaults at source, remove the shim, and add unmodified bootstrap plus populated upgrade/restart evidence.

## 7. Compilation and Diff Hygiene

PowerShell does not automatically expand a glob into Python arguments:

```powershell
Set-Location 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\inflowwkiller-of-b1'
$ofPython = 'C:\Users\conta\Documents\ChatGPT\TWIN CLONE CREATION\inflowwkiller\.venv\Scripts\python.exe'
$ofPythonFiles = @(
    'service/llm_models.py',
    'service/server.py',
    'service/db/models.py',
    'service/db/migrations/versions/20261018_0100_onlyfans_read_bindings.py',
    'service/tests/test_onlyfans_read.py',
    'service/tests/test_onlyfans_migration_pg.py'
) + (Get-ChildItem -LiteralPath 'service/onlyfans_read' -Filter '*.py' -File | ForEach-Object FullName)
& $ofPython -m py_compile @ofPythonFiles
git diff --check
```

Report each exit separately. A later successful command must not hide an earlier failure.

## 8. Integration Environment and Secrets

Future isolated integration uses these variable NAMES, with test-generated values:

| Process | Variables |
|---|---|
| Twin Next server | ONLYFANS_API_BASE_URL, ONLYFANS_API_TOKEN; isolated synthetic auth/data dependencies |
| FastAPI read service | ONLYFANS_API_TOKEN, ONLYFANS_API_TENANT; synthetic storage configuration |
| SQLAlchemy runtime | DATABASE_URL (confirm current engine expectations) |
| Alembic | CHATTERLY_DB_URL |
| PG rehearsal | ONLYFANS_TEST_PG_URL, or disposable pgserver |
| Preview scripts | PREVIEW_URL, optional PREVIEW_CHROME |

Do not copy .env files from another worktree or expose privileged keys to browser NEXT_PUBLIC variables. A shared .venv is not permission to inherit its runtime credentials. Audit startup before running any real main app/relay entry point.

There is currently no verified working base URL that fixes the path mismatch by configuration alone: the dashboard appends `/onlyfans/accounts`, while the router serves `/onlyfans/api/v1/accounts`. Correct and test the code convention before providing an integration URL.

Use the existing positive operator-session auth boundary in isolated tests. Do not use DASHBOARD_NO_AUTH or NODE_ENV shortcuts as authentication. Ensure no real fleet, finance, media or identity provider is queried by the synthetic integration harness.

## 9. Snapshot Verification and Recovery

SOURCE_FILES.csv records original relative path, SHA-256, length and copied path for each of 89 changed files. PACKAGE_MANIFEST.csv records package files except itself. Verify hashes before recovery. Compare source changes since capture, especially concurrent Fastt/Telegram work.

The snapshot omits unchanged baseline files. Recover into a new checkout of the exact recorded commit if necessary, compare each file, and apply only the reviewed intended changes. Never overwrite another chat's active dirty worktree. No git reset/clean, no live data restore and no wholesale replacement of shared code is part of this runbook.
