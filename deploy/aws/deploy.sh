#!/bin/bash
# Runs on the EC2 instance (#35): at bootstrap and from autodeploy.sh.
#   /opt/maxball/deploy.sh <git-sha|latest>
# Fetches that commit's deploy/ directory (compose, Caddy, observability
# configs), points the app and on-call images at the matching GHCR tag and
# restarts what changed. Secrets stay in /opt/maxball/.env, generated on first
# boot by the CloudFormation UserData.
set -euo pipefail
cd /opt/maxball
TAG="${1:-latest}"
REF="$TAG"; [ "$TAG" = latest ] && REF=main
source .env

# Instances bootstrapped before the template stopped tracing secrets printed
# APP_SECRET to the serial console; replace it once (signs users out).
if [ -z "${APP_SECRET_ROTATED:-}" ]; then
  sed -i '/^APP_SECRET=/d' .env
  { echo "APP_SECRET=$(openssl rand -hex 32)"; echo "APP_SECRET_ROTATED=1"; } >> .env
  echo "rotated APP_SECRET"
fi
# Secrets added with the observability stack; generated once if missing.
grep -q '^GRAFANA_ADMIN_PASSWORD=' .env || echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)" >> .env
grep -q '^OTLP_INGEST_TOKEN=.' .env || { sed -i '/^OTLP_INGEST_TOKEN=/d' .env; echo "OTLP_INGEST_TOKEN=$(openssl rand -hex 24)" >> .env; }

# The release's deploy/ directory, exactly as committed at REF.
curl -fsSL "https://codeload.github.com/${GITHUB_REPOSITORY}/tar.gz/${REF}" -o release.tgz
rm -rf release.next && mkdir release.next
tar xzf release.tgz -C release.next --strip-components=1 --wildcards '*/deploy/*'
rm -rf release && mv release.next release && rm release.tgz
for f in deploy.sh autodeploy.sh; do
  install -m 700 "release/deploy/aws/$f" "$f.next" && mv "$f.next" "$f"
done

TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
sed -i '/^SITE_ADDRESS=/d;/^APP_TAG=/d;/^IMAGE_REPO=/d' .env
echo "SITE_ADDRESS=${IP//./-}.sslip.io" >> .env
echo "APP_TAG=$TAG" >> .env
echo "IMAGE_REPO=${GITHUB_REPOSITORY,,}" >> .env  # registry names are lowercase

compose() { docker compose --env-file /opt/maxball/.env -f release/deploy/aws/docker-compose.prod.yml "$@"; }
compose pull --quiet
compose up -d --remove-orphans
docker image prune -f >/dev/null
for i in $(seq 1 36); do
  if compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "deployed $TAG at https://${IP//./-}.sslip.io"
    exit 0
  fi
  sleep 5
done
compose logs --tail 80 app
exit 1
