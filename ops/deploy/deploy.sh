#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

image=${1:?Usage: deploy.sh ghcr.io/owner/image@sha256:digest}
[[ "$image" =~ ^ghcr.io/[a-z0-9/_.-]+@sha256:[a-f0-9]{64}$ ]] || exit 2
base=/home/ubuntu/dongne
nginx=chart-nginx
network=chart-api_default
shared=/home/ubuntu/chart-api/nginx/ssl/dongne
active=$shared/active.conf
state=$base/active-color
domain=api.dongne.town
mkdir -p "$base"
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[[ $(uname -m) == aarch64 ]]
test -s "$base/backend.env"
test -d "$base/playback"
test -s "$active"
docker exec "$nginx" test -s "/etc/nginx/ssl/dongne/letsencrypt/live/$domain/fullchain.pem"
docker exec "$nginx" test -s "/etc/nginx/ssl/dongne/letsencrypt/live/$domain/privkey.pem"
docker network inspect "$network" >/dev/null
nginx_config=$(docker exec "$nginx" nginx -T 2>&1)
grep -Fq 'include /etc/nginx/ssl/dongne/active.conf;' <<< "$nginx_config"
# PostgreSQL is attached to this network once during provisioning.
test -n "$(docker inspect permit-map-postgres --format '{{with index .NetworkSettings.Networks "chart-api_default"}}{{.IPAddress}}{{end}}')"

old=none
if [[ -f "$state" ]]; then old=$(cat "$state"); fi
case "$old" in blue) next=green ;; green|none) next=blue ;; *) exit 2 ;; esac
candidate=dongne-$next
if docker container inspect "$candidate" >/dev/null 2>&1; then
  echo "Inactive container $candidate still exists; inspect/remove it before deploying." >&2
  exit 1
fi
docker pull "$image"
test "$(docker image inspect "$image" --format '{{.Architecture}}')" = arm64
backup=$(mktemp "$shared/previous.XXXXXX")
cp "$active" "$backup"
switched=false
keep_candidate=false
cleanup() {
  result=$?
  trap - EXIT
  if (( result != 0 )); then
    if [[ "$switched" == true ]]; then
      cp "$backup" "$active"
      if docker exec "$nginx" nginx -t && docker exec "$nginx" nginx -s reload; then
        # Keep the candidate for requests accepted before rollback.
        keep_candidate=true
        echo 'Rolled back Nginx; both containers retained for draining/inspection.' >&2
      else
        keep_candidate=true
        echo 'Nginx rollback failed; containers retained. Inspect Nginx immediately.' >&2
      fi
    fi
    if [[ "$keep_candidate" == false ]]; then docker rm -f "$candidate" >/dev/null 2>&1 || true; fi
  fi
  rm -f "$backup"
  exit "$result"
}
trap cleanup EXIT

docker run -d --name "$candidate" --restart unless-stopped \
  --network "$network" --memory 1g --memory-swap 1g --cpus 1 \
  --env-file "$base/backend.env" \
  --mount "type=bind,src=$base/playback,dst=/app/data/playback,readonly" \
  --log-opt max-size=10m --log-opt max-file=3 "$image" >/dev/null
healthy=false
for ((i=0; i<60; i++)); do
  status=$(docker inspect "$candidate" --format '{{.State.Health.Status}}')
  if [[ "$status" == healthy ]]; then healthy=true; break; fi
  [[ $(docker inspect "$candidate" --format '{{.State.Running}}') == true ]] || break
  sleep 3
done
if [[ "$healthy" != true ]]; then
  echo 'Candidate failed readiness (including DB); existing backend unchanged. Inspect server logs.' >&2
  exit 1
fi

# Capture current workers so old requests can finish after a graceful reload.
workers=$(docker exec "$nginx" sh -c 'ps | grep "[n]ginx: worker process" | awk "{print \$1}"')
test -n "$workers"
cat > "$active" <<EOF
upstream dongne_backend {
    server $candidate:8080;
    keepalive 16;
}
server {
    listen 80;
    server_name $domain;
    location ^~ /.well-known/acme-challenge/ { root /etc/nginx/ssl/dongne/www; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $domain;
    ssl_certificate /etc/nginx/ssl/dongne/letsencrypt/live/$domain/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/dongne/letsencrypt/live/$domain/privkey.pem;
    location /actuator { return 404; }
    location / {
        proxy_pass http://dongne_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
# Mark before testing: a failed test must restore the on-disk configuration too.
switched=true
docker exec "$nginx" nginx -t
docker exec "$nginx" nginx -s reload
curl --fail --silent --show-error --max-time 20 --retry 3 --retry-delay 2 \
  --resolve "$domain:443:127.0.0.1" "https://$domain/api/v1/map/categories" >/dev/null
printf '%s\n' "$next" > "$state.tmp"
mv "$state.tmp" "$state"
switched=false
keep_candidate=true
printf 'Activated %s (%s)\n' "$candidate" "$image"

if [[ "$old" != none ]]; then
  # Do not kill requests still handled by workers from before the reload.
  drained=false
  for ((i=0; i<60; i++)); do
    pending=false
    for pid in $workers; do
      if docker exec "$nginx" test -d "/proc/$pid"; then pending=true; break; fi
    done
    if [[ "$pending" == false ]]; then drained=true; break; fi
    sleep 2
  done
  if [[ "$drained" == true ]]; then
    docker stop --time 40 "dongne-$old" >/dev/null
    docker rm "dongne-$old" >/dev/null
  else
    echo "Old Nginx workers are still draining; dongne-$old retained. Remove after requests finish."
  fi
fi
