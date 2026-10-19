#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
 echo 'Install Node.js 24.13 or newer once before using the TicketBunker Hub.'
 read -r -p 'Press Enter to close. '
 exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<24||(a===24&&b<13))process.exit(1)'; then
 echo 'Update Node.js to version 24.13 or newer before starting this hub.'
 read -r -p 'Press Enter to close. '
 exit 1
fi
if [ ! -d node_modules ]; then npm ci --no-audit --no-fund; fi
exec node start.js
