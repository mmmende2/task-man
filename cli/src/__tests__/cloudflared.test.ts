import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCloudflared } from '../cloudflared.js';

describe('resolveCloudflared', () => {
  it('an explicit configured path wins over everything', () => {
    expect(
      resolveCloudflared('/custom/cloudflared', {
        env: { CLOUDFLARED: '/env/cloudflared' },
        candidates: ['/nonexistent/cloudflared'],
      }),
    ).toBe('/custom/cloudflared');
  });

  it('$CLOUDFLARED wins when no path is configured', () => {
    expect(
      resolveCloudflared(undefined, {
        env: { CLOUDFLARED: '/env/cloudflared' },
        candidates: ['/nonexistent/cloudflared'],
      }),
    ).toBe('/env/cloudflared');
  });

  it('falls back to the first candidate path that exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'task-man-cf-'));
    const real = join(dir, 'cloudflared');
    writeFileSync(real, '');
    try {
      expect(
        resolveCloudflared(undefined, {
          env: {},
          candidates: [join(dir, 'missing'), real],
        }),
      ).toBe(real);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to the bare name when nothing else resolves', () => {
    expect(
      resolveCloudflared(undefined, { env: {}, candidates: ['/nonexistent/cloudflared'] }),
    ).toBe('cloudflared');
  });
});
