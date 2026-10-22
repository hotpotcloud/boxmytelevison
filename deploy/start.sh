#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
# Node parses dotenv as data, including the quoted JSON source lists.
exec node --env-file=.env start.cjs
