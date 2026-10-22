#!/bin/bash
# 容器外（无 Docker）启动脚本：先加载 .env 中的运行时变量，再启动 Next.js standalone
cd /opt/boxmytelevison || exit 1
set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_ENV=production
export HOSTNAME=0.0.0.0
export PORT=8080
exec node server.js
