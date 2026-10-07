#!/usr/bin/env bash
set -euo pipefail

if command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null; then
  exit 0
fi

# Ubuntu supplies ffmpeg. The disposable runner's unrelated Chrome feed can
# stall apt or publish inconsistent index hashes; it is not needed here.
# Keep the Ubuntu sources and all package signature/hash verification intact.
sudo mkdir -p /tmp/ci-unused-chrome-feed
while IFS= read -r source; do
  sudo mv "$source" "/tmp/ci-unused-chrome-feed/${source##*/}"
done < <(sudo grep -rl 'dl.google.com/linux/chrome' /etc/apt/sources.list.d 2>/dev/null || true)

apt_options=(
  -o Acquire::Retries=1
  -o Acquire::http::Timeout=20
  -o Acquire::https::Timeout=20
  -o DPkg::Lock::Timeout=30
)

# Bound setup even if a package mirror or subprocess becomes unresponsive.
sudo timeout --kill-after=10s 150s apt-get "${apt_options[@]}" update
sudo timeout --kill-after=10s 210s apt-get "${apt_options[@]}" install -y --no-install-recommends ffmpeg
command -v ffmpeg
command -v ffprobe
