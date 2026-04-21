import { afterEach, describe, expect, it, vi } from 'vitest';

async function parseJson<T = any>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

describe('keepalive route', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/repo');
    vi.resetModules();
  });

  it('reports memory mode and disables caching', async () => {
    vi.doMock('@/lib/repo', () => ({
      getSupabaseClient: () => null,
      persistenceMode: () => 'memory',
    }));
    const { GET } = await import('../app/api/keepalive/route');

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await parseJson(res)).toMatchObject({ ok: true, mode: 'memory' });
  });

  it('reports Supabase connectivity failures', async () => {
    const limit = vi.fn().mockResolvedValue({ error: { message: 'network down' } });
    const select = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ select });
    vi.doMock('@/lib/repo', () => ({
      getSupabaseClient: () => ({ from }),
      persistenceMode: () => 'supabase',
    }));
    const { GET } = await import('../app/api/keepalive/route');

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await parseJson(res)).toMatchObject({
      ok: false,
      error: 'SUPABASE_KEEPALIVE_FAILED: network down',
    });
  });
});
