#!/bin/bash
# Pull-based continuous deployment of PRODUCTION on the EC2 instance,
# run every minute by maxball-autodeploy.timer. Production runs the commit
# the git tag `production` points at; only the manual "Promote to
# production" workflow moves that tag, and only to a commit whose images CI
# published (every test passed) and that already runs in development.
# Before the first promotion the instance keeps the image it booted with.
set -euo pipefail
cd /opt/maxball
source .env
SHA=$(git ls-remote "https://github.com/${GITHUB_REPOSITORY}.git" refs/tags/production | cut -f1)
[ -n "$SHA" ] || exit 0
[ "${APP_TAG:-}" = "$SHA" ] && exit 0
IMAGE_REPO="${GITHUB_REPOSITORY,,}"  # registry names are lowercase
TOKEN=$(curl -fsS "https://ghcr.io/token?scope=repository:${IMAGE_REPO}:pull" | jq -r .token)
curl -fsS -o /dev/null \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json" \
  "https://ghcr.io/v2/${IMAGE_REPO}/manifests/${SHA}" || exit 0
echo "promoting to production: $SHA (running ${APP_TAG:-none})"
exec ./deploy.sh "$SHA"
