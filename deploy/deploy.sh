#!/bin/bash
set -euo pipefail
stage=$1
app_dir=$2
if [ "$(id -u)" != 0 ]; then
  exec sudo -n bash "$0" "$stage" "$app_dir"
fi

cd "$stage"
sha256sum -c app.tar.gz.sha256
gzip -t app.tar.gz
case "$(uname -m)" in
  x86_64) ;;
  *) echo 'This build requires an x86_64 server'; exit 1 ;;
esac

# Extract completely before switching the service to the new release.
release="$app_dir/releases/$(basename "$stage")"
install -d -m 700 "$release"
tar -xzf app.tar.gz -C "$release"
# Reuse Node 22 when present; otherwise install it once on the server.
node_bin=$(command -v node || true)
if [ -z "$node_bin" ] || ! "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) === 22 ? 0 : 1)'; then
  node_version=$(cat "$release/.node-version")
  node_sha=$(cat "$release/.node-sha256")
  [[ "$node_version" =~ ^v22\.[0-9]+\.[0-9]+$ ]]
  [[ "$node_sha" =~ ^[a-f0-9]{64}$ ]]
  runtime_dir="$app_dir/runtime/node-$node_version-linux-x64"
  node_bin="$runtime_dir/bin/node"
  if [ ! -x "$node_bin" ]; then
    archive="node-$node_version-linux-x64.tar.xz"
    downloaded=0
    # Prefer the domestic mirror; verify it against the official checksum from CI.
    for base in https://npmmirror.com/mirrors/node https://nodejs.org/dist; do
      echo "Installing Node $node_version on server from $base"
      if curl -fSL --retry 1 --connect-timeout 15 --max-time 180 \
          -o "$stage/$archive" "$base/$node_version/$archive" &&
        printf '%s  %s\n' "$node_sha" "$stage/$archive" | sha256sum -c -; then
        downloaded=1
        break
      fi
    done
    [ "$downloaded" = 1 ] || { echo 'Node download or checksum verification failed'; exit 1; }
    install -d "$app_dir/runtime"
    tar -xJf "$stage/$archive" -C "$app_dir/runtime"
    rm -f "$stage/$archive"
  fi
fi
"$node_bin" --version
printf '%s\n' "$node_bin" > "$release/.node-path"
chmod 600 "$release/.env" "$release/password.json"
test -f "$release/server.js"
test -f "$release/start.cjs"
"$node_bin" --env-file="$release/.env" -e 'const p=require(process.argv[1]); if (!p.password || typeof p.password !== "string") process.exit(1)' "$release/password.json"

unit=/etc/systemd/system/boxmytelevison.service
backup="$stage/previous.service"
if [ -f "$unit" ]; then cp "$unit" "$backup"; fi
cat > "$unit" <<EOF
[Unit]
Description=BoxMyTelevision
After=network.target

[Service]
Type=simple
WorkingDirectory=$release
ExecStart=$node_bin --env-file=.env start.cjs
Environment=NODE_OPTIONS=--max-old-space-size=768
Environment=NEXT_TELEMETRY_DISABLED=1
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

rollback() {
  echo 'Deployment failed; recent service logs:'
  journalctl -u boxmytelevison -n 40 --no-pager || true
  if [ -f "$backup" ]; then
    cp "$backup" "$unit"
    systemctl daemon-reload
    systemctl restart boxmytelevison || true
    echo 'Restored previous service configuration'
  else
    systemctl stop boxmytelevison || true
  fi
  exit 1
}
systemctl daemon-reload || rollback
systemctl enable boxmytelevison || rollback
systemctl restart boxmytelevison || rollback

healthy=0
for attempt in $(seq 1 30); do
  if systemctl is-active --quiet boxmytelevison &&
    curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8080/api/status > "$stage/status.json" &&
    "$node_bin" -e 'const s=require(process.argv[1]); if (!s.passwordRequired || !s.version || s.version === "dev") process.exit(1)' "$stage/status.json"; then
    healthy=1
    break
  fi
  sleep 2
done
[ "$healthy" = 1 ] || rollback
echo 'Deployment succeeded: service active, API reachable, password configured'
# Retain releases so restoring the previous service also restores its application files.
rm -f "$stage/app.tar.gz" "$stage/app.tar.gz.sha256" "$backup" "$stage/status.json"
