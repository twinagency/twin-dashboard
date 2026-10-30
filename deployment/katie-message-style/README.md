# Katie Telegram conversation style

Katie's V2 base prompt required lowercase and a fixed single message, and delivery forced every answer to lowercase after generation. Saved timing preferences were not read by V2. This overlay connects those preferences to the existing fleet and sender for clone `dfcab3fc-a30b-44ad-868f-3cf20a877b90` only.

- Correct capitalization survives generation and cleanup. Katie's existing personality supplies the approximate 5% minor grammar-slip and 7% single lowercase x sign-off targets. These remain model style targets, not exact quotas.
- The renderer and dashboard preview replace the conflicting generic voice and fixed-length rules for Katie. The AI-clone identity disclosure remains.
- Fleet refresh reads the saved response and bubble delay fields. The current response target is uniformly sampled from 25–90 seconds after the latest merged input. Generation and queue time count toward the target; slow generation, queues, media preparation or Telegram/network delays can exceed it.
- Ordinary conversation can remain one message or split into two complete thoughts (35% chance when a safe sentence boundary exists), with the configured 2–5 second pause. Short replies, media captions, tips, sales invitations and fixed recovery lines stay together.
- Each bubble uses the existing journal and history owner with its exact payload. Only the first acknowledged bubble bills the turn. Partial failures remain visible and unknown sends are never repeated.
- Other clone IDs retain the existing prompt, lowercase normalization, single bubble and typing delay.

## Validation

Offline Docker checks on the candidate image: TypeScript typecheck; 12 Katie checks; 452 delivery checks; 23 text-retry checks; 31 structured-turn cases; 181 prompt-parity checks; 64 identity-truth checks; 9 runner-recovery checks; 8 shutdown checks. No test messages were sent to fans.

## Deployment and rollback

The base running image is `sha256:17aa097ddc7eab4b1b8d576f3bb5f017f51175b4875b022197eeab65811ae13c`, reporting source revision `96ede0392639c9311fa004358b0bc6043c9487b7`. The live containers were created directly; the historical compose override contains older images and is not used for this release.

`patch.py` applies asserted source replacements to an isolated source copy. Build an overlay from the exact base image with `COPY source/ /app/`. Test before invoking `release.py`. The release checks the original container IDs, copies their current Docker configuration in memory, drains the old bot, retains both old containers for rollback, and verifies the new fleet revision and all previously running creators. Secrets remain on the host and are never written here. Shared histories and journals are preserved. The bot receives a 125-second shutdown budget and 135-second Docker stop timeout so scheduled replies can finish during a later graceful shutdown.

Host staging and release evidence: `/home/ubuntu/twin-v2/katie-style-20261030/`. A successful release writes `release-receipt.json`; do not treat this README alone as proof of deployment. On failure the release restores the retained containers. For a later manual rollback, stop and verify the new bot has drained before restoring `twin-v2-bot-1-pre-katie-20261030` and `twin-v2-dash-1-pre-katie-20261030` to their original names and starting them. Do not remove volumes.
