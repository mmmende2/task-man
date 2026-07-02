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

# cli/ first: web's `file:../cli` dependency needs cli/dist to already exist
# when web is installed below, since plain npm (no workspaces) snapshots the
# local dependency at install time rather than symlinking it live.
COPY cli/package.json cli/package-lock.json ./cli/
RUN npm ci --prefix cli

COPY cli/tsconfig.json ./cli/
COPY cli/src ./cli/src
RUN npm run build --prefix cli

COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web

COPY web/tsconfig*.json web/vite.config.ts web/index.html ./web/
COPY web/src ./web/src
COPY web/public ./web/public
RUN npm run build --prefix web

# Production-only install, discarding the devDependencies (typescript, vitest,
# etc.) pulled in above.
RUN rm -rf cli/node_modules && npm ci --prefix cli --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /repo/cli/package.json ./package.json
COPY --from=build /repo/cli/node_modules ./node_modules
COPY --from=build /repo/cli/dist ./dist
COPY --from=build /repo/cli/dist-web ./dist-web

# Matches Config's default task file location (~/.task-man); the compose file
# mounts a volume here so tasks survive container recreation.
ENV HOME=/root
VOLUME /root/.task-man

EXPOSE 3030
CMD ["node", "dist/index.js", "serve", "--bind", "0.0.0.0", "--port", "3030"]
