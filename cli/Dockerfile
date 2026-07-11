# Builds task-man from source (the package isn't published to npm) and bundles
# the web frontend's static build into dist-web, exactly as `npm run build:all`
# does locally. Build context must be the repo root, e.g.:
#   docker build -f cli/Dockerfile -t task-man:0.1.1 .
#
# For a reproducible/pinned build, check out the desired tag or commit in the
# repo clone *before* running `docker build` — this Dockerfile always builds
# whatever's currently checked out. See docs/phase2-manual-setup-guide.md.

FROM node:22-bookworm-slim AS build
WORKDIR /repo

# ALL dependency layers come before any source copy: they invalidate only
# when a package.json/lockfile changes, so a source-only deploy skips every
# npm ci below and re-runs just tsc + vite. Ordered the other way (deps
# interleaved with source), each deploy re-installed everything — which is
# what froze the 1GB droplet for ~40 minutes building deploy-v8.
COPY cli/package.json cli/package-lock.json ./cli/
RUN npm ci --prefix cli

# web's `file:../cli` dependency is snapshotted by npm at install time (plain
# npm, no workspaces — it copies rather than symlinks). cli/dist doesn't exist
# yet, so this snapshot is dist-less; it's refreshed after the cli build below.
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web

# Production-only deps for the runtime image, installed into a parallel dir so
# this layer is also cache-stable across source changes.
COPY cli/package.json cli/package-lock.json ./cli-prod/
RUN npm ci --prefix cli-prod --omit=dev

COPY cli/tsconfig*.json ./cli/
COPY cli/src ./cli/src
RUN npm run build --prefix cli

# Refresh the snapshotted file:../cli dep with the freshly built dist so the
# web build resolves task-man/* imports (and their .d.ts) normally.
RUN rm -rf web/node_modules/task-man \
  && mkdir -p web/node_modules/task-man \
  && cp cli/package.json web/node_modules/task-man/ \
  && cp -R cli/dist web/node_modules/task-man/dist

COPY web/tsconfig*.json web/vite.config.ts web/index.html ./web/
COPY web/src ./web/src
COPY web/public ./web/public
RUN npm run build --prefix web

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `git describe` of the source this image was built from, passed by the
# deploy (`--build-arg GIT_DESCRIBE=$(git describe --tags --always --dirty)`).
# Surfaced at /healthz and in the web footer so you can confirm what's live.
# Defaults to 'dev' for an un-stamped local build.
ARG GIT_DESCRIBE=dev
ENV TASK_MAN_BUILD=${GIT_DESCRIBE}

# zoneinfo for the TZ env var (compose passes the user's timezone so the
# server's "today" matches theirs) — slim images don't include it, and a
# TZ that can't resolve silently means UTC date boundaries.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/cli/package.json ./package.json
COPY --from=build /repo/cli-prod/node_modules ./node_modules
COPY --from=build /repo/cli/dist ./dist
COPY --from=build /repo/cli/dist-web ./dist-web

# Matches Config's default task file location (~/.task-man); the compose file
# mounts a volume here so tasks survive container recreation.
ENV HOME=/root
VOLUME /root/.task-man

EXPOSE 3030
CMD ["node", "dist/index.js", "serve", "--bind", "0.0.0.0", "--port", "3030"]
