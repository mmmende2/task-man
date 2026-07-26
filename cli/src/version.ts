import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

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

/** Parsed shape of a `git describe --long --dirty` string. */
export interface BuildInfo {
  /** Commits since the last release tag. 0 = sitting exactly on it. */
  ahead: number;
  /** Short commit hash, or null when the string carried none. */
  sha: string | null;
  /** Uncommitted changes in the working tree. */
  dirty: boolean;
}

/**
 * Parse a `git describe --tags --always --long --dirty` string.
 *
 * Handles the three shapes it emits:
 *   "v0.6.0-3-gfd86c26"        → tagged, 3 commits past
 *   "v0.6.0-0-gfd86c26-dirty"  → tagged, on the tag, uncommitted changes
 *   "fd86c26"                  → no tag reachable (--always fallback)
 *
 * Returns null for an unparseable/empty string.
 */
export function parseDescribe(describe: string): BuildInfo | null {
  const s = describe.trim();
  if (!s) return null;
  const dirty = s.endsWith('-dirty');
  const core = dirty ? s.slice(0, -'-dirty'.length) : s;
  // --long always renders "<tag>-<n>-g<sha>"; the tagless --always fallback is
  // a bare sha with no 'g' prefix.
  const tagged = core.match(/-(\d+)-g([0-9a-f]{7,40})$/);
  if (tagged) return { ahead: Number(tagged[1]), sha: tagged[2], dirty };
  const bare = core.match(/^([0-9a-f]{7,40})$/);
  if (bare) return { ahead: 0, sha: bare[1], dirty };
  return null;
}

/** The footer version, split so the two halves can be colored separately. */
export interface VersionParts {
  /** Always present, e.g. "v0.6.0". Rendered grey. */
  version: string;
  /**
   * The build token — "+3 fd86c26", "fd86c26*" — present ONLY when the running
   * code differs from the release. Rendered YELLOW: its whole job is to catch
   * the eye and say "this is not the release". `null` on a clean release, which
   * is what keeps that case entirely grey.
   */
  build: string | null;
}

/**
 * Split the footer version into its grey version and (when the running code
 * isn't the release) its yellow build token.
 *
 *   v0.6.0                  → sitting exactly on the release tag, clean tree
 *   v0.6.0 · +3 fd86c26     → 3 commits past v0.6.0
 *   v0.6.0 · +3 fd86c26*    → ...with uncommitted changes (trailing *)
 *   v0.6.0 · fd86c26        → a commit we can't measure against a tag
 *
 * Why this is needed: `VERSION` comes from package.json, which Changesets only
 * bumps at RELEASE time. On a feature branch whose changesets haven't been
 * consumed yet, package.json still reads the previous release — so a bare
 * "v0.6.0" is actively misleading about what you're running. The build token is
 * the "this is not the release" signal, and the sha pins exactly which commit.
 *
 * Leading with VERSION rather than the raw describe string is deliberate, and
 * mirrors web's formatVersionLabel: a describe tag anchor can lag the real
 * release, so "v0.5.1-5-g939826d" would read as 0.5.1 on a 0.6.0 build.
 */
export function formatVersionParts(version: string, info: BuildInfo | null): VersionParts {
  const plain = { version: `v${version}`, build: null };
  if (!info) return plain;
  const star = info.dirty ? '*' : '';
  if (info.ahead === 0 && !info.dirty) return plain;
  if (!info.sha) return { version: `v${version}`, build: star || null };
  const ahead = info.ahead > 0 ? `+${info.ahead} ` : '';
  return { version: `v${version}`, build: `${ahead}${info.sha}${star}` };
}

/** The flat one-line form, for anywhere that can't color its output. */
export function formatBuildLabel(version: string, info: BuildInfo | null): string {
  const { version: v, build } = formatVersionParts(version, info);
  return build ? `${v} · ${build}` : v;
}

/**
 * Resolve the running build from git, or null when git can't tell us anything.
 *
 * Two paths:
 *  - `TASK_MAN_BUILD` set (the Docker image stamps it at build time) → parse it.
 *    The image has no .git, so this is the only signal there.
 *  - otherwise shell out to `git describe` in the directory this module lives
 *    in — the dev path, where the TUI runs straight from a checkout.
 *
 * Skipped entirely for an installed copy (path contains node_modules): git
 * would either fail or, worse, silently describe whatever UNRELATED repo the
 * install happens to sit inside. Any failure returns null and the footer falls
 * back to the bare version — a version stamp must never break the TUI.
 */
export function resolveBuildInfo(): BuildInfo | null {
  const stamped = process.env.TASK_MAN_BUILD?.trim();
  if (stamped) return parseDescribe(stamped);

  const here = dirname(fileURLToPath(import.meta.url));
  if (here.includes('node_modules')) return null;

  try {
    // --tags counts lightweight tags (a tag ref that actions/checkout has
    // force-fetched onto the commit is no longer annotated); --match keeps
    // stray non-release tags out of the anchor. Same flags as the workflows.
    const args = ['describe', '--tags', '--always', '--long', '--dirty', '--match', 'v[0-9]*'];
    const out = execFileSync('git', args, {
      cwd: here,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    });
    return parseDescribe(out);
  } catch {
    return null;
  }
}

// Resolved once on first use — the footer re-renders on every pulse tick and
// must not shell out to git each time. A restart picks up new commits, which is
// the right granularity for a long-lived TUI session.
let cached: VersionParts | null = null;
export function versionParts(): VersionParts {
  cached ??= formatVersionParts(VERSION, resolveBuildInfo());
  return cached;
}

/** The flat one-line form of the resolved build (logs, non-colored surfaces). */
export function versionLabel(): string {
  const { version, build } = versionParts();
  return build ? `${version} · ${build}` : version;
}
