#!/bin/sh
# Container entrypoint.
#   (no command)       start the server (CMD: node build)
#   gen-secrets        print SESSION_SECRET / VAPID_* lines on stdout
#   cli <args>         operator CLI, e.g. `cli invite --admin`
#   anything else      run as given
set -eu

# PUBLIC_URL is the one documented setting for the app's public origin. adapter-node (CSRF check, request URLs)
# reads ORIGIN, so we pass it on unless ORIGIN is set explicitly. The CLI reads PUBLIC_URL (or ORIGIN).
if [ -n "${PUBLIC_URL:-}" ] && [ -z "${ORIGIN:-}" ]; then
	ORIGIN="$PUBLIC_URL"
	export ORIGIN
fi
if [ -n "${ORIGIN:-}" ] && [ -z "${PUBLIC_URL:-}" ]; then
	PUBLIC_URL="$ORIGIN"
	export PUBLIC_URL
fi

case "${1:-}" in
	gen-secrets | cli)
		cmd="$1"
		shift
		exec "$cmd" "$@"
		;;
esac
exec "$@"
