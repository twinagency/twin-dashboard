# Twin OnlyFans: GitHub Continuation

The owner requested publication of the OnlyFans implementation and complete Claude handover on 18 October 2026. Continue the existing implementation, preserve Twin branding and Telegram, and do not restart the design.

## Start Here

1. Read [the complete handover](handover/CLAUDE_HANDOVER.md) and follow its reading order.
2. Use [the runbook](handover/RUNBOOK.md) for the isolated preview and verification commands.
3. The [complete handover archive](../archive/onlyfans-claude-handover-2026-10-18.zip) contains 89 source-file snapshots, 23 reference documents, 14 existing synthetic screenshots, source inventories and checksum manifests. This is the original pre-publication checkpoint, not a second implementation.

## Published Source

| Component | Repository | Branch |
|---|---|---|
| Twin frontend, routes, read adapter and handover | `jesse98/twin-dashboard` | `codex/onlyfans-dashboard-foundation` |
| Fastt-based OnlyFans read service and migration | `jesse98/twin-onlyfans-backend` | `codex/onlyfans-of-b1` |

Both repositories are private. The backend's original `BlackPhoenixSlo/inflowwkiller` origin is public upstream and was not modified. The new private repository contains the existing upstream history plus the OnlyFans package, without merging unrelated dirty work from the shared native/Telegram checkout.

The local continuation directories are still `twin-dashboard-of-d0` and `inflowwkiller-of-b1` under `C:/Users/conta/Documents/ChatGPT/TWIN CLONE CREATION`. Prefer those directories on the owner's computer. The separate original checkouts and their uncommitted legacy/Telegram work remain untouched; consult their current source when the handover names a shared dependency. Do not assume every referenced concurrent dependency was merged into these feature branches.

## How to Read the Snapshot

The enclosed handover and inventories describe the state immediately before this publication. Statements that the OF-D0/OF-B1 work is uncommitted or has not been pushed are historical after these branches are published. GitHub branch history is the authority for their current commits. The archive preserves its original hashes rather than rewriting that evidence.

This push is not deployment, activation, an acceptance of remaining integration gaps, or permission for live account/provider/database/model access. The known adapter/backend URL mismatch and remaining consolidation milestones are documented in the handover and remain to be implemented. No production integration is claimed.

The owner authorized this commit/push specifically. Later commits, deployments, live migrations, account connections, real messages and paid model calls still require their own applicable authorization. Continue the offline implementation scope and preserve concurrent work.
