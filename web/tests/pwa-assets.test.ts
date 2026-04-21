import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../app/manifest';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readPngSize(path: string) {
  const png = readFileSync(path);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

describe('pwa assets', () => {
  it('exposes install metadata', () => {
    const data = manifest();
    expect(data.display).toBe('standalone');
    expect(data.start_url).toBe('/');
    expect(data.icons?.some((icon) => icon.src === '/icon.svg')).toBe(true);
    expect(data.icons?.some((icon) => icon.src === '/icon-192.png' && icon.sizes === '192x192')).toBe(true);
    expect(data.icons?.some((icon) => icon.src === '/icon-512.png' && icon.sizes === '512x512')).toBe(true);
    expect(data.icons?.some((icon) => icon.src === '/icon-512.png' && icon.purpose === 'maskable')).toBe(true);
  });

  it('ships png install icons with expected dimensions', () => {
    expect(readPngSize(join(webRoot, 'public/icon-192.png'))).toEqual({ width: 192, height: 192 });
    expect(readPngSize(join(webRoot, 'public/icon-512.png'))).toEqual({ width: 512, height: 512 });
  });

  it('keeps live API requests out of service worker cache handling', () => {
    const sw = readFileSync(join(webRoot, 'public/sw.js'), 'utf-8');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain('if (isApiRequest(url)) return;');
    expect(sw).not.toContain('cacheName: "apis"');
    expect(sw).not.toContain("cacheName: 'apis'");
  });
});
