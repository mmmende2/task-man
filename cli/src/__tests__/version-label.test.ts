import { describe, it, expect } from 'vitest';
import { parseDescribe, formatBuildLabel, resolveBuildInfo } from '../version.js';

describe('parseDescribe', () => {
  it('parses a tagged build some commits past the release', () => {
    expect(parseDescribe('v0.6.0-3-gfd86c26')).toEqual({ ahead: 3, sha: 'fd86c26', dirty: false });
  });

  it('parses a build sitting exactly on the tag', () => {
    expect(parseDescribe('v0.6.0-0-gfd86c26')).toEqual({ ahead: 0, sha: 'fd86c26', dirty: false });
  });

  it('parses the -dirty suffix', () => {
    expect(parseDescribe('v0.6.0-3-gfd86c26-dirty')).toEqual({ ahead: 3, sha: 'fd86c26', dirty: true });
    expect(parseDescribe('v0.6.0-0-gfd86c26-dirty')).toEqual({ ahead: 0, sha: 'fd86c26', dirty: true });
  });

  it('parses the tagless --always fallback (bare sha)', () => {
    expect(parseDescribe('fd86c26')).toEqual({ ahead: 0, sha: 'fd86c26', dirty: false });
    expect(parseDescribe('fd86c26-dirty')).toEqual({ ahead: 0, sha: 'fd86c26', dirty: true });
  });

  it('tolerates surrounding whitespace (git appends a newline)', () => {
    expect(parseDescribe('v0.6.0-3-gfd86c26\n')).toEqual({ ahead: 3, sha: 'fd86c26', dirty: false });
  });

  it('handles a full-length sha', () => {
    const long = 'fd86c26aa1b2c3d4e5f60718293a4b5c6d7e8f90';
    expect(parseDescribe(`v0.6.0-2-g${long}`)?.sha).toBe(long);
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseDescribe('')).toBeNull();
    expect(parseDescribe('   ')).toBeNull();
    expect(parseDescribe('dev')).toBeNull();
    expect(parseDescribe('not-a-describe')).toBeNull();
  });

  it('does not mistake a tag containing digits-dash for the commit counter', () => {
    // The counter+sha group is anchored to the END, so a dashed tag name is safe.
    expect(parseDescribe('release-2024-1-gabcdef1')).toEqual({ ahead: 1, sha: 'abcdef1', dirty: false });
  });
});

describe('formatBuildLabel', () => {
  it('shows a bare version when sitting on the release tag with a clean tree', () => {
    expect(formatBuildLabel('0.6.0', { ahead: 0, sha: 'fd86c26', dirty: false })).toBe('v0.6.0');
  });

  it('shows a bare version when git tells us nothing (installed copy, no repo)', () => {
    expect(formatBuildLabel('0.6.0', null)).toBe('v0.6.0');
  });

  // The actual bug: package.json still reads the PREVIOUS release on a feature
  // branch whose changesets haven't been consumed, so a bare "v0.6.0" claims to
  // be a release it isn't. The suffix is the "this is not the release" signal.
  it('marks a build that is ahead of the release', () => {
    expect(formatBuildLabel('0.6.0', { ahead: 3, sha: 'fd86c26', dirty: false }))
      .toBe('v0.6.0 · +3 fd86c26');
  });

  it('marks an uncommitted tree with a trailing star', () => {
    expect(formatBuildLabel('0.6.0', { ahead: 3, sha: 'fd86c26', dirty: true }))
      .toBe('v0.6.0 · +3 fd86c26*');
  });

  it('marks a dirty tree even when sitting on the tag', () => {
    expect(formatBuildLabel('0.6.0', { ahead: 0, sha: 'fd86c26', dirty: true }))
      .toBe('v0.6.0 · fd86c26*');
  });

  it('omits the +N when there is no tag to measure against', () => {
    expect(formatBuildLabel('0.6.0', { ahead: 0, sha: 'fd86c26', dirty: false })).toBe('v0.6.0');
  });

  it('always leads with the compiled version, never the describe tag anchor', () => {
    // A describe anchor can lag the real release (CI cache artifact), so the
    // label must never let the tag name speak for the version. See web's
    // formatVersionLabel for the same rule.
    const label = formatBuildLabel('0.6.0', parseDescribe('v0.5.1-5-g939826d'));
    expect(label.startsWith('v0.6.0')).toBe(true);
    expect(label).not.toContain('0.5.1');
  });
});

describe('resolveBuildInfo', () => {
  it('prefers the injected TASK_MAN_BUILD stamp over shelling out to git', () => {
    const prev = process.env.TASK_MAN_BUILD;
    process.env.TASK_MAN_BUILD = 'v1.2.3-7-gabcdef1-dirty';
    try {
      expect(resolveBuildInfo()).toEqual({ ahead: 7, sha: 'abcdef1', dirty: true });
    } finally {
      if (prev === undefined) delete process.env.TASK_MAN_BUILD;
      else process.env.TASK_MAN_BUILD = prev;
    }
  });

  it('never throws — a version stamp must not be able to break the TUI', () => {
    const prev = process.env.TASK_MAN_BUILD;
    delete process.env.TASK_MAN_BUILD;
    try {
      expect(() => resolveBuildInfo()).not.toThrow();
    } finally {
      if (prev !== undefined) process.env.TASK_MAN_BUILD = prev;
    }
  });
});
