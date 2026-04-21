import { describe, expect, it } from 'vitest';
import { getCopyPack } from '../lib/copywriting';

describe('copywriting pack', () => {
  it('loads neutral and immersive keys', () => {
    const pack = getCopyPack();
    expect(pack.neutral.broadcast.night_start).toBeTruthy();
    expect(pack.immersive.broadcast.night_start).toBeTruthy();
  });
});
