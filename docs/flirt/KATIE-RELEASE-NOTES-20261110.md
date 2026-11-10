# Katie Price on FLIRT agency dashboard (2026-11-10)

DO NOT MERGE. This branch records an isolated release already live on the FLIRT host.

- Base: 9c9c473c (the commit live on the FLIRT host, from codex/flirt-four-step-onboarding-20261109). NOT the flirt/independent-backend head, which had 41 unreleased commits.
- Change: one commit, 6ebe907e, adds Katie Price (clone dfcab3fc-a30b-44ad-868f-3cf20a877b90, @katiepricex) to CLONES in deployment/flirt-live-twin.cjs, its test (count 13) and the unreviewed-photos list in deployment/flirt-live-creators-check.cjs.
- Release path: local docker build with GIT_SHA=6ebe907e..., push to ECR twin-dashboard:flirt-<sha>, upload-idle gate passed, host deploy via flirt-release.py host("deploy") with no configure step. Deploy output: twin_unchanged true, rollback retained (previous 9c9c473c). Login page returned 200.
- Not verified: deployment/flirt-live-creators-check.py (needs the release environment). Check the agency list shows Katie.
- Brooke Aries (fe9dad6f) is still NOT in the live list.
- Separate, DB only: proper grammar (uses_lowercase, drops_punctuation, makes_typos off; levels never) set on Katie plus the 12 FLIRT master clones. Persona text for Katie (ur/rn/babe) untouched.
- For whoever merges Jesse's branch next: the same three-file Katie change must be carried over or Katie drops off the list on the next release.
