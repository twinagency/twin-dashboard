#!/bin/sh
set -eu
export NODE_OPTIONS="${NODE_OPTIONS:-} --require=/app/deployment/flirt-shared-services.cjs"
node /app/deployment/flirt-preflight.cjs dashboard
exec "$@"
