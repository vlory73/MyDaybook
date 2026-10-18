# syntax=docker/dockerfile:1
#
# MyDaybook image. Multi-stage, non-root, works with a read-only root filesystem (only /data, /backup and a
# tmpfs /tmp need to be writable). Base image tag: node:24-bookworm-slim, pinned by digest (THREAT_MODEL case d).
# Update the digest on purpose, never with a floating tag.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5

# ---- build ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 13 ships prebuilt addons for linux x64/arm64 (glibc) inside the npm package and picks the one for
# the running architecture at load time (lib/linux-<arch>.js). Its binding.gyp would otherwise make npm try a
# source build with node-gyp, which needs Python and a compiler, so install scripts are skipped.
# Optional: behind a TLS-inspecting proxy, pass its CA with `--secret id=cacert,src=ca.pem` (not needed otherwise).
RUN --mount=type=secret,id=cacert,required=false \
	if [ -f /run/secrets/cacert ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cacert; fi; \
	npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=8090 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
# All runtime scripts (cli.mjs and what it imports, gen-secrets.mjs); dev-only ones and tests are in .dockerignore.
COPY --from=build /app/scripts/*.mjs ./scripts/
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint
# `cli` and `gen-secrets` as commands: docker compose exec app cli invite --admin
RUN chmod 0755 /usr/local/bin/docker-entrypoint \
	&& printf '#!/bin/sh\nexec node /app/scripts/cli.mjs "$@"\n' > /usr/local/bin/cli \
	&& printf '#!/bin/sh\nexec node /app/scripts/gen-secrets.mjs "$@"\n' > /usr/local/bin/gen-secrets \
	&& chmod 0755 /usr/local/bin/cli /usr/local/bin/gen-secrets \
	&& mkdir -p /data /backup && chown 1000:1000 /data /backup
USER 1000:1000
VOLUME ["/data"]
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:8090/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["docker-entrypoint"]
CMD ["node", "build"]
