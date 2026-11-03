#!/bin/bash
# Pull-based continuous deployment on the EC2 instance (#35), run every
# minute by maxball-autodeploy.timer. CI publishes ghcr.io/<repo>:<sha> only
# after every test job passes, so "main's head has an image" means "this
# commit is green": deploy it. Nothing to do while CI is still running, after
# a red commit (the last green version keeps serving) or when already current.
set -euo pipefail
cd /opt/maxball
source .env
SHA=$(git ls-remote "https://github.com/${GITHUB_REPOSITORY}.git" refs/heads/main | cut -f1)
[ -n "$SHA" ] || exit 0
[ "${APP_TAG:-}" = "$SHA" ] && exit 0
TOKEN=$(curl -fsS "https://ghcr.io/token?scope=repository:${GITHUB_REPOSITORY}:pull" | jq -r .token)
curl -fsS -o /dev/null \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json" \
  "https://ghcr.io/v2/${GITHUB_REPOSITORY}/manifests/${SHA}" || exit 0
echo "new published commit $SHA (running ${APP_TAG:-none})"
exec ./deploy.sh "$SHA"
