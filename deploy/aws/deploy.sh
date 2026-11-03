#!/bin/bash
# Runs on the EC2 instance (#35): at bootstrap and from autodeploy.sh.
#   /opt/maxball/deploy.sh <git-sha|latest>
# Fetches the compose/Caddy files of that commit, points the app at the
# matching GHCR image tag and restarts only what changed. Secrets stay in
# /opt/maxball/.env, generated on first boot by the CloudFormation UserData.
set -euo pipefail
cd /opt/maxball
TAG="${1:-latest}"
REF="$TAG"; [ "$TAG" = latest ] && REF=main
source .env
RAW="https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${REF}/deploy/aws"
curl -fsSL "$RAW/docker-compose.prod.yml" -o docker-compose.yml
curl -fsSL "$RAW/Caddyfile" -o Caddyfile
for f in deploy.sh autodeploy.sh; do
  curl -fsSL "$RAW/$f" -o "$f.next" && chmod 700 "$f.next" && mv "$f.next" "$f"
done

TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
sed -i '/^SITE_ADDRESS=/d;/^APP_TAG=/d' .env
echo "SITE_ADDRESS=${IP//./-}.sslip.io" >> .env
echo "APP_TAG=$TAG" >> .env

docker compose pull --quiet
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
for i in $(seq 1 36); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "deployed $TAG at https://${IP//./-}.sslip.io"
    exit 0
  fi
  sleep 5
done
docker compose logs --tail 80 app
exit 1
