// Téléchargement unique des modèles et runtimes, puis lecture depuis la Cache API.

export const MODEL_CACHE_NAME = 'soundguard-models-v1';

export interface CachedAsset {
  bytes: ArrayBuffer;
  fromCache: boolean;
}

export interface CacheDeps {
  caches: CacheStorage | undefined;
  fetch: typeof fetch;
}

const defaultDeps = (): CacheDeps => ({
  caches: typeof caches === 'undefined' ? undefined : caches,
  fetch: (...args) => fetch(...args),
});

/**
 * Renvoie le contenu de `url`, depuis le cache s'il y est, sinon depuis le réseau
 * (et l'y range). Sans Cache API (navigation privée, contexte non sécurisé), simple fetch.
 */
export async function fetchCached(
  url: string,
  deps: CacheDeps = defaultDeps(),
  cacheName = MODEL_CACHE_NAME,
): Promise<CachedAsset> {
  const cache = deps.caches ? await deps.caches.open(cacheName).catch(() => undefined) : undefined;
  const hit = await cache?.match(url);
  if (hit) return { bytes: await hit.arrayBuffer(), fromCache: true };

  const response = await deps.fetch(url);
  if (!response.ok)
    throw new Error(`Téléchargement impossible (${String(response.status)}) : ${url}`);
  if (cache) {
    await cache.put(url, response.clone()).catch(() => undefined);
  }
  return { bytes: await response.arrayBuffer(), fromCache: false };
}
