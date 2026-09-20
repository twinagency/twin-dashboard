#!/usr/bin/env bash
# Read-only capacity and credential-presence checks. Never print secret values.
set -euo pipefail
printf 'MEMORY_MIB\n'
free -m
printf 'DISK\n'
df -h / /var/lib/docker
printf 'RUNNING_CONTAINERS\n'
sudo docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
printf 'CONTAINER_RESOURCES\n'
sudo docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'
printf 'FLIRT_PORT_3101\n'
ss -lnt 'sport = :3101'
printf 'PROVIDER_CONFIGURATION_PRESENCE\n'
sudo docker exec next-app node -e 'for (const name of ["OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY"]) console.log(name + ": " + (process.env[name] ? "configured" : "not configured"));'
