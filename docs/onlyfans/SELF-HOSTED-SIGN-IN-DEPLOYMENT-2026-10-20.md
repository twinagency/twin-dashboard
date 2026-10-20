# Private creator sign-in deployment — 20 October 2026

## Running candidate

The creator entry point is <https://dashboard.tgaiclone.xyz/creator/platforms>. Choose **Connect OnlyFans**, sign in and complete any provider verification, then confirm the detected handle. Real account verification, history sync and reconnect still require an explicitly selected creator's pilot. No real account login, fan message or purchase was performed during deployment.

| Component | Running version |
| --- | --- |
| Dashboard | `aaffe90fddb1631862edc34a89c40e9965b1e180` |
| Native API/worker and browser | `0525e51aa690b44d1c9f1dc0bc2b9aed6baa627a` |
| Dashboard image | `twin-dashboard@sha256:513336b02ac04335ed65bb919e65b45f9a5b9d567709a71354ccdb506f968a02` |
| Native runtime image | `twin-dashboard@sha256:e5611032fbf5d5b4f9b3962515b5332efcca06e39c9d267177b089ef94d23554` |
| Browser image | `twin-dashboard@sha256:bd438064738e17f8524b7ee2dc5694e22412033940ef6dc369ef2bdb81fee300` |

All images are in the existing private Sydney ECR repository. Images were built on GitHub Actions, not on the production server. Native build run 39334077166 and dashboard build run 39334578077 passed.

## Approved infrastructure change

Jesse approved the planned restart, `t3.small` to `t3.medium` and an additional US$25/month ceiling. AWS Pricing returned Sydney Linux rates of US$0.0264/hour and US$0.0528/hour; the compute increase for 744 hours is US$19.6416 before tax. The existing Elastic IP and EBS disk were retained. The server now reports 3831 MiB of usable RAM.

The database dump was validated with `pg_restore --list`. The server-only recovery directory is `/var/backups/twin-private-signin-0525e51-20261020`, protected for root. Environment files, complete container metadata and the database dump were never exported. Recovery snapshot: `snap-06a3eb2bdb139d8d9`. Snapshot completion may be asynchronous; the validated database dump is independent of it.

## Target-host evidence

- All six original services recovered after the approved restart; public dashboard HTTPS passed.
- The original database, Flirt bot and Flirt dashboard container identities were preserved. The database and vault volumes were retained.
- The headed Chromium fixture passed inside the actual private container with its Chromium sandbox enabled, non-root user, read-only filesystem, dropped capabilities, private Docker network and memory/process limits. Synthetic input/capture, scope refusal, capacity, exact retry, cleanup and expiry passed. Peak container memory observed during the fixture was 702 MiB.
- The browser publishes no host port. Private Docker health returned200; an unauthenticated private request returned401.
- The native capture-context request passed with existing private configuration and no enrollment, provider request or database write.
- The deployed dashboard's actual commit, digest and matching private sign-in configuration were checked. A dashboard-to-native authenticated capture-context request passed. The deployed public sign-in route refuses unauthenticated requests with401.
- Post-deployment public HTTPS passed, with 3746 MiB free disk space.
- Native bindings, connections, enabled runtimes and enabled delivery policies remained 0 throughout the checks. Connecting does not enable outgoing messaging.
- The established agency/dashboard/private-photo recovery check passed. The catalogue preview check passed 45 videos and failed 4 at the source probe (`probe/invalid`). An isolated run of the prior deployed immutable dashboard image against its backed-up settings reproduced the exact same 4 failed item IDs. Preview source code and the check itself have identical Git blobs before and after this release. This is a confirmed existing catalogue issue, not a passing check or a sign-in regression. No source media were deleted or replaced.

SSM evidence: resize recovery `01285bc2-9c00-4c4b-9e82-81d9eb9e023a`; image pulls `cf17ab27-f368-4cfa-b914-f5b5eff1cb88`; native rollout `ffc3d5df-390c-4722-87b7-e20470a73705`; target browser verification `dc642db5-8620-40c6-be73-cdcf512d5c31`; dashboard rollout `17db485a-6a34-4ca2-a583-190e7699f367`; running release verification `9da2a0b3-8f4b-44ec-a19c-8a60eb31ccaa`.

Post-deployment recovery/catalogue check `25714bfa-114a-401b-a611-acd5b4c8b37e`; isolated catalogue diagnostic `d7849b0b-731d-4924-8557-773f0157ed73`; prior-image comparison `1ef3c334-d85f-457f-b572-02f6f2703d1a`. Item IDs and complete private check output remain in the root-only recovery directory.

The real anonymous OnlyFans login screen also rendered through the deployed private API. No credentials or keyboard input were supplied, and the temporary attempt was cancelled after inspection. This proves provider-page rendering, not authenticated login or capture.

## Source and CI status

Dashboard PR 197 and native PR 3 retain the candidate changes for review and the real-account pilot. The dashboard deployment above is pinned to the tested candidate, rather than a merge to `main` that would trigger another automatic deployment. Later documentation and deployment-helper commits do not change the running application code.

The dedicated native PostgreSQL acceptance run 39329996865 passed 215 tests. The final native browser workflow 39330557414 passed. Dashboard core CI, workspace, saved-content, demo, LYNQ and dedicated sign-in checks passed at the application candidate. The generic native relay CI still fails with missing `pytest` in its direct-file test runner; the same pytest import exists on the base995d031, so this inherited runner issue is not reported as a passing check.

## Deployment and rollback interface

`deployment/creator-sign-in-deploy.cjs` submits the explicit reviewed Python phase over SSM to the approved server using the existing local AWS profile. The recovery state stores only metadata and command IDs. Pending commands are resumed, avoiding duplicate side effects. Use phases `pull`, `native`, `verify-native`, `dashboard`, `verify` and `checks` in order. This is a release-specific helper, not a generic fleet deployer.

The original native compose overrides remain unchanged. The release uses a separate root-only overlay, keeps the host-network worker and existing private database configuration, and starts only API, worker and browser. The base compose is verified against the tracked Git blob after normalizing Windows line endings. The Microsoft seccomp profile is pinned and checked against the tested canonical SHA256. No IAM, database schema, registry or messaging engine was added.

For rollback, `rollback-dashboard` first runs the upload-idle gate, restores the backed-up private dashboard settings and deploys the original pinned image through the established `twin-pull.sh` interface. `rollback-native` stops only the new browser and restores the original API/worker images through the original compose configuration. Neither operation recreates the database. Secrets and tokens stay on the original server; the deployment script contents are not read.
