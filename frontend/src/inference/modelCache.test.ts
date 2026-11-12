import { describe, expect, it, vi } from 'vitest';
import { fetchCached } from './modelCache';

function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn((url: string) => Promise.resolve(store.get(url)?.clone())),
    put: vi.fn((url: string, res: Response) => {
      store.set(url, res);
      return Promise.resolve();
    }),
  };
  return { caches: { open: () => Promise.resolve(cache) } as unknown as CacheStorage, cache };
}

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe('fetchCached', () => {
  it('télécharge une fois puis sert depuis le cache', async () => {
    const { caches } = fakeCaches();
    const fetchMock = vi.fn(() => Promise.resolve(new Response(bytes(1, 2, 3))));
    const deps = { caches, fetch: fetchMock as unknown as typeof fetch };

    const first = await fetchCached('/models/a.bin', deps);
    const second = await fetchCached('/models/a.bin', deps);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(new Uint8Array(second.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fonctionne sans Cache API', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(bytes(9))));
    const result = await fetchCached('/x', {
      caches: undefined,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ fromCache: false });
  });

  it('n’enregistre pas une réponse en erreur', async () => {
    const { caches, cache } = fakeCaches();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('absent', { status: 404 })));
    await expect(
      fetchCached('/missing', { caches, fetch: fetchMock as unknown as typeof fetch }),
    ).rejects.toThrow('404');
    expect(cache.put).not.toHaveBeenCalled();
  });
});
