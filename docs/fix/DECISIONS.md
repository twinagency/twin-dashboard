# Dashboard fix-orchestrator decision log (2026-11-12)

Target: origin/claude/commercial-dashboard-r2-20261111 (e1744a90 at start). step6-20261112 does not contain it (measured) → stays target.

- D1 sweep: 321 unique known-red files (w7-close 302 + 19 from rwl/W* lane branches) + 134 support files (tests/helpers, tests/support, tests/rules, no mutations) checked out onto team head in worktree fix-sweep (branch jaka/fix-sweep-20261112). Runner = init.sh known-red logic (control pass, rest fail on ERR_ASSERTION), 240 s timeout each.
- D2 PR-0 first = scripts/premerge.sh + test:offline repair (owner: first PR adds premerge.sh; pick 6). Fable: continue, measure tail suites first.
- D3 N1 group split (Fable redirect, adopted): PR-1 owner guard (W2 F1 + N2) client only; PR-2 additive captureRef on save + captureId in replies, store on globalThis[Symbol.for], keyed account+job+actor, capped, TTL 15 min, delete on ack, distinct code on expired handle; PR-3 editor uses ref, routes drop capture+xHash, X-Hash input waived in ref mode. Prove store on real `next build`+start and `next dev` (cross-route module instance risk).

## D4 (2026-11-12) PR-0 review dispositions
- premerge runs test:offline/api/public always (path gating skipped shared code); refuses dirty tree; requires a `control:` ok line.
- Rejected: env-prefix covers only first && cmd (measured: second cmds pass unmapped).
- Deferred: per-test known-red granularity, hardcoded default base (PREMERGE_BASE overrides), storage-transport RSS flake (owner call).

## D5 (2026-11-12) PR-2 shape
- storage-only capture-store; swap private to save route (route.ts import would drag server-only into 7 routes + scripts).
- captureRef: action save only ("session" = creator self-connect, out of scope); owner mismatch = plain validation 400 (no 409 code).
- Harness split to #358 to keep PR-2 ≤300 LOC. Storage-transport cap raised (#357): flake blocked premerge 3/5.

## D6 (2026-11-12) Fable consult 2, after 5 merges
- Live-1 run now at 0801deb2; F1 via real browser + faked capture reply (Fable option c), labelled "fake upstream". Real curl from another account (b) rejected until PR-3 stops returning capture to browser.
- PR-3 split UI-first: PR-3a editor reads captureId, sends captureRef, tolerates both reply shapes (parseBrowserbaseJob rejects done-without-capture, so route-first would cancel every login); ref-shape client check (send() silently returns on invalid); 410 handled (refresh status, no false failure); X-Hash field disabled in ref mode, file choice clears ref (decision: no manual X-Hash override after curl/BB capture).
- Remove delete-on-ack (reverses D5): lost ack + Retry same commandKey would get 410. TTL expires handle.
- PR-3b: routes drop capture/xHash (allowlist projection), update tests/components/browserbase-login.test.tsx, promote only N1 tests (N3/N4/N9 stay red) + C-C3.
- Shared-store proof needs a real mint: standalone build + stub upstream with PR-3b.
