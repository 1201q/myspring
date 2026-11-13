#!/usr/bin/env bash
set -Eeuo pipefail
exec 9>/home/ubuntu/dongne/deploy.lock
flock -n 9 || exit 0
docker run --rm \
  -v /home/ubuntu/chart-api/nginx/ssl/dongne/www:/var/www/acme \
  -v /home/ubuntu/chart-api/nginx/ssl/dongne/letsencrypt:/etc/letsencrypt \
  certbot/certbot@sha256:c5698da859429ccee0fcc299a8000368198222d1f9e789ab6e388b491e8ce06d \
  renew --quiet
docker exec chart-nginx nginx -t
docker exec chart-nginx nginx -s reload
