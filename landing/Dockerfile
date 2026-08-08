# Builds the landing/signup service from source. Separate image from the
# root Dockerfile's task-man server — different public surface, published
# alongside it as ghcr.io/mmmende2/task-man-landing.
#
# Lives in landing/ but the build context must still be the repo ROOT (the
# npm workspace root — landing shares the single root lockfile with cli and
# web), so this is invoked with -f:
#   docker build -f landing/Dockerfile -t task-man-landing:0.0.1 .
#
# Every `npm ci` below is scoped with --workspace=task-man-landing: the root
# lockfile covers cli/web too (their package.json manifests must still be
# present for npm's lockfile-consistency check), but the flag limits what
# actually gets installed to landing's own tree — hono/zod/resend, not
# cli's ink/react/commander/mcp-sdk. Keeps this image lean and this Dockerfile
# independent of cli's build succeeding.

FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY cli/package.json ./cli/
COPY web/package.json ./web/
COPY landing/package.json ./landing/
RUN npm ci --workspace=task-man-landing --no-audit --no-fund

COPY landing/tsconfig*.json ./landing/
COPY landing/src ./landing/src
RUN npm run build -w task-man-landing

# Production-only deps in a separate stage so it caches independently of the
# source build (same reasoning as the root Dockerfile's prod-deps stage).
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY cli/package.json ./cli/
COPY web/package.json ./web/
COPY landing/package.json ./landing/
RUN npm ci --omit=dev --workspace=task-man-landing --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /repo/landing/package.json ./package.json
COPY --from=prod-deps /repo/node_modules ./node_modules

# Drop the workspace self-symlink (task-man-landing -> ../landing); it
# dangles here and nothing at runtime imports the package by name.
RUN rm -rf node_modules/task-man-landing

COPY --from=build /repo/landing/dist ./dist
COPY landing/public ./public

# Matches env.ts's default LANDING_DATA_DIR (~/.task-man-landing); the
# compose file mounts a volume here so signups.json survives recreation.
ENV HOME=/root
VOLUME /root/.task-man-landing

# `git describe` of the source this image was built from, same stamping
# convention as the main image — surfaced at /healthz. Declared LAST so a new
# stamp only rebuilds this final layer.
ARG GIT_DESCRIBE=dev
ENV TASK_MAN_BUILD=${GIT_DESCRIBE}
RUN echo "==> task-man-landing build stamped: ${GIT_DESCRIBE}"

EXPOSE 3040
CMD ["node", "dist/index.js"]
