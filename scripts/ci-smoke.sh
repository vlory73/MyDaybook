#!/usr/bin/env bash
# Starts the image the way compose.yaml runs it (read-only root, tmpfs /tmp, no capabilities, uid 1000) and waits for
# /healthz. Synthetic secrets only. Usage: scripts/ci-smoke.sh <image> [platform]
set -euo pipefail
image="$1"
platform="${2:-linux/amd64}"
data="$(mktemp -d)"
backup="$(mktemp -d)"
sudo chown 1000:1000 "$data" "$backup"
env_file="$(mktemp)"
{
	echo "PUBLIC_URL=http://127.0.0.1:8090"
	echo "COOKIE_SECURE=false"
	echo "TZ=Europe/Copenhagen"
	docker run --rm --platform "$platform" "$image" gen-secrets
} >"$env_file"
grep -q '^SESSION_SECRET=' "$env_file"
cid="$(docker run -d --platform "$platform" --read-only --tmpfs /tmp --cap-drop ALL \
	--security-opt no-new-privileges:true --user 1000:1000 --memory 256m \
	--env-file "$env_file" -e DATA_DIR=/data -e BACKUP_DIR=/backup -e BODY_SIZE_LIMIT=2M \
	-v "$data:/data" -v "$backup:/backup" -p 127.0.0.1:8090:8090 "$image")"
trap 'docker logs "$cid" | tail -20; docker rm -f "$cid" >/dev/null' EXIT
for _ in $(seq 1 90); do
	if curl -fsS http://127.0.0.1:8090/healthz >/dev/null 2>&1; then
		echo "healthy on $platform"
		test -f "$data/app.db"
		docker exec "$cid" cli invite --admin | grep -q '/join#t='
		echo "migrations ran and the invite CLI works"
		exit 0
	fi
	sleep 2
done
echo "the container did not become healthy on $platform" >&2
exit 1
