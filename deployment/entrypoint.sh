#!/bin/sh
set -eu
node /app/deployment/flirt-preflight.cjs dashboard
exec "$@"
