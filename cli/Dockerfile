# Builds task-man from source (not published to npm) and bundles the web
# frontend's static build into dist-web. Build context must be the repo root
# (the npm workspace root), e.g.:
#   docker build -f cli/Dockerfile -t task-man:0.1.1 .
#
# For a reproducible/pinned build, check out the desired tag or commit in the
# repo clone *before* running `docker build` — this Dockerfile always builds
# whatever's currently checked out. See docs/phase2-manual-setup-guide.md.

FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Dependency layer before any source copy: it invalidates only when a manifest
# or the lockfile changes, so a source-only deploy skips npm ci and re-runs
# just tsc + vite. (Interleaving deps with source is what froze the 1GB droplet
# for ~40 minutes on deploy-v8.) One root `npm ci` installs every workspace's
# deps into a single hoisted tree and symlinks web -> cli, so the web build
# resolves task-man/* against the live cli/dist below — no snapshot to refresh.
COPY package.json package-lock.json ./
COPY cli/package.json ./cli/
COPY web/package.json ./web/
RUN npm ci

# Source + build. cli first: web imports task-man/* which resolve to cli/dist
# through the workspace symlink.
COPY cli/tsconfig*.json ./cli/
COPY cli/src ./cli/src
RUN npm run build -w task-man

COPY web/tsconfig*.json web/vite.config.ts web/index.html ./web/
COPY web/src ./web/src
COPY web/public ./web/public
RUN npm run build -w task-man-web

# Production-only deps for the runtime image, in a separate stage so it caches
# independently of the source build. cli's runtime deps and web's don't
# version-conflict, so --omit=dev hoists everything the server needs into
# /repo/node_modules.
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY cli/package.json ./cli/
COPY web/package.json ./web/
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# zoneinfo for the TZ env var (compose passes the user's timezone so the
# server's "today" matches theirs) — slim images don't include it, and a
# TZ that can't resolve silently means UTC date boundaries.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/cli/package.json ./package.json
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/cli/dist ./dist
COPY --from=build /repo/cli/dist-web ./dist-web

# Drop the workspace self-symlinks (task-man -> ../cli, task-man-web -> ../web);
# they dangle here and nothing at runtime imports task-man by package name.
RUN rm -rf node_modules/task-man node_modules/task-man-web

# Matches Config's default task file location (~/.task-man); the compose file
# mounts a volume here so tasks survive container recreation.
ENV HOME=/root
VOLUME /root/.task-man

# `git describe` of the source this image was built from, passed by the
# deploy (`--build-arg GIT_DESCRIBE=$(git describe --long --always --dirty)`).
# Surfaced at /healthz and in the web footer so you can confirm what's live.
# Defaults to 'dev' for an un-stamped local build. Declared LAST so a new
# stamp only rebuilds these final layers — everything above stays cached.
ARG GIT_DESCRIBE=dev
ENV TASK_MAN_BUILD=${GIT_DESCRIBE}
# Print the stamp into the build log — this is the string /healthz reports,
# so the deployer knows exactly what to look for when verifying.
RUN echo "==> task-man build stamped: ${GIT_DESCRIBE}"

EXPOSE 3030
CMD ["node", "dist/index.js", "serve", "--bind", "0.0.0.0", "--port", "3030"]
