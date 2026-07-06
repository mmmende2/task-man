import { createRequire } from 'node:module';

// Single source of truth for the app version, read from package.json at
// runtime. dist/version.js sits one level below package.json both in the repo
// and in the published tarball, so `../package.json` resolves in both.
// This is the canonical semver — bump it with `npm version` (which also tags),
// and it's what gets published to npm. The build SHA below is display-only and
// is never written into package.json.
export const VERSION: string = createRequire(import.meta.url)('../package.json').version;

// Short git SHA of the build, injected at image-build time (Dockerfile sets
// TASK_MAN_BUILD_SHA from the GIT_SHA build arg). 'dev' when unset — i.e. a
// local `task-man serve` or `npm run dev` that wasn't built through Docker.
export const BUILD_SHA: string = process.env.TASK_MAN_BUILD_SHA?.trim() || 'dev';
