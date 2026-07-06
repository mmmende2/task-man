import { createRequire } from 'node:module';

// Single source of truth for the app version, read from package.json at
// runtime. dist/version.js sits one level below package.json both in the repo
// and in the published tarball, so `../package.json` resolves in both.
export const VERSION: string = createRequire(import.meta.url)('../package.json').version;
