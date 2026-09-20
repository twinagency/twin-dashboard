# Run FLIRT alongside the existing Twin applications

This configuration changes only FLIRT containers. It does not stop, rename or reconfigure Twin. Infrastructure access and a provisioned FLIRT database are required before execution.

## Credentials
Use `.env.example` as the FLIRT environment template. Database and Auth credentials belong to the fresh FLIRT data project. Generate separate FLIRT session secrets; never reuse a complete Twin environment file.

The three AI provider values can come from the existing Twin account. Either inject them with the host's existing secret manager, or provide a protected JSON file with these exact keys:

```json
{
  "OPENROUTER_API_KEY": "existing-authorised-Twin-key",
  "ELEVENLABS_API_KEY": "existing-authorised-Twin-key",
  "DEEPGRAM_API_KEY": "existing-authorised-Twin-key"
}
```

These are placeholders. Only include providers actually configured. Do not commit real values. Store the file outside the checkout and Docker build context, inside a protected host directory. Ensure the mounted file is readable by the container's unprivileged application user. For local Compose, file-based secrets are bind mounts; do not assume Compose will remap their ownership.

Only provider keys are read from the file. Any other key is an error. Explicit app environment keys override file values. The bot's existing FLIRT-database settings override its environment as before. No request from FLIRT reads Twin's customer database to fetch provider keys.

## Compose
Run commands from the FLIRT checkout. Set `FLIRT_SHARED_SERVICES_PATH` to the protected file's absolute path when using the optional overlay.

```sh
# Validate without printing expanded environment values.
docker compose -f docker-compose.yml -f deployment/compose.shared-services.yml config --quiet

# With already built local images, start this repository's FLIRT service only.
docker compose -f docker-compose.yml -f deployment/compose.shared-services.yml up -d --no-build
```

If using environment-only credential injection, omit the overlay. Production should select CI-built immutable image digests through a deployment override; the default local image name is not a production image supply process. Keep `FLIRT_BACKEND_ENABLED=false` until the database baseline, required configuration and test records are ready.

Dashboard uses the `flirt-dashboard` project/container and `127.0.0.1:3101:3001`. Bot uses `flirt-bot` and publishes no inbound ports. Do not override the project/container names with Twin's existing values. Do not use the inherited Twin deploy script targeting `next-app`.

After starting, confirm the image/commit in the running container, then check signup/recovery and scoped test accounts through the configured FLIRT HTTPS hostname. The reverse proxy, DNS and email redirect configuration remain necessary. Do not point the public marketing site's login at an unverified container.

## Service/account ownership
The same AWS, OpenRouter, ElevenLabs, Deepgram, Telegram management and email-provider accounts may be used. Shared billing, rate limits and provider administrator access remain shared. Only the application's data store, credentials for accessing that store, sessions, creator assignments and application resources are separate.

Never start two polling workers for the same Telegram token. Moving an existing creator/bot from Twin to FLIRT requires a planned handover, which is not part of this fresh white-label setup.

No new paid services or accounts are created by these files.
