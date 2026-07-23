import { createRequire } from 'node:module';

// Single source of truth for the app version, read from package.json at
// runtime. dist/version.js sits one level below package.json both in the repo
// and in the published tarball, so `../package.json` resolves in both.
// Managed by Changesets: a changeset per PR declares the bump, and
// `changeset version` writes this number (shared with web via the fixed group)
// plus CHANGELOG.md at release time. Don't edit it by hand. The build stamp
// below is display-only and is never written into package.json.
export const VERSION: string = createRequire(import.meta.url)('../package.json').version;

// `git describe` of the build (e.g. "v0.3.0" at a tag, "v0.3.0-2-ge7d4e7d"
// two commits past it, "-dirty" suffix for an uncommitted tree), injected at
// image-build time (Dockerfile sets TASK_MAN_BUILD from the GIT_DESCRIBE build
// arg). One commit-derived string that fuses release + exact commit. 'dev'
// when unset — a local build that didn't go through Docker.
export const BUILD: string = process.env.TASK_MAN_BUILD?.trim() || 'dev';
