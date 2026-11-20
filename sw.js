const APP_CACHE = 'jp-shop-app-v1';
const IMG_CACHE = 'jp-shop-img-v1';

const APP_SHELL_PATHS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/image-util.js',
  './js/export.js',
  './data/items.json',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

function resolveAssetUrl(relPath) {
  return new URL(relPath, self.registration.scope).href;
}

function getCleanUrl(requestUrl) {
  const u = new URL(requestUrl);
  return u.origin + u.pathname;
}

function isProductImageRequest(url) {
  const path = url.pathname;
  if (path.includes('/assets/images/')) return true;
  if (path.includes('/assets/icons/')) return false;
  return /\.(webp|jpe?g|png|gif|avif)$/i.test(path);
}

function isItemsJsonRequest(url) {
  return url.pathname.endsWith('/data/items.json');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const appCache = await caches.open(APP_CACHE);
    const urls = APP_SHELL_PATHS.map(resolveAssetUrl);

    await Promise.allSettled(
      urls.map(async (url) => {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) {
          await appCache.put(url, res);
        }
      })
    );

    // 盡力預載 items.json 內的初始商品圖片，單張失敗不阻擋 SW 安裝
    try {
      const itemsUrl = resolveAssetUrl('./data/items.json');
      const itemsRes = await appCache.match(itemsUrl) || await fetch(itemsUrl);
      if (itemsRes && itemsRes.ok) {
        const data = await itemsRes.clone().json();
        if (Array.isArray(data.items)) {
          const imgCache = await caches.open(IMG_CACHE);
          const imageUrls = [...new Set(
            data.items
              .map((it) => it && it.image)
              .filter((src) => typeof src === 'string' && src.trim() && !src.startsWith('data:'))
              .map(resolveAssetUrl)
          )];
          await Promise.allSettled(
            imageUrls.map(async (imgUrl) => {
              const existing = await imgCache.match(imgUrl);
              if (!existing) {
                const imgRes = await fetch(imgUrl);
                if (imgRes.ok) await imgCache.put(imgUrl, imgRes);
              }
            })
          );
        }
      }
    } catch {
      // 忽略預載錯誤，後續可由介面一鍵補抓
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== APP_CACHE && k !== IMG_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

async function cacheFirstImage(request, url) {
  const imgCache = await caches.open(IMG_CACHE);
  const cleanKey = getCleanUrl(url.href);

  const cached = (await imgCache.match(cleanKey)) || (await imgCache.match(request));
  if (cached) {
    return cached;
  }

  try {
    const networkRes = await fetch(request);
    if (networkRes && networkRes.ok) {
      await imgCache.put(cleanKey, networkRes.clone());
    }
    return networkRes;
  } catch (err) {
    return new Response('', { status: 404, statusText: 'Offline image unavailable' });
  }
}

async function networkFirstApp(request, url) {
  const appCache = await caches.open(APP_CACHE);
  const cleanKey = isItemsJsonRequest(url)
    ? resolveAssetUrl('./data/items.json')
    : getCleanUrl(url.href);

  try {
    // 若非 items.json 帶明確 no-store 的更新檢查，使用標準 fetch
    const networkRes = await fetch(request);
    if (networkRes && networkRes.ok) {
      await appCache.put(cleanKey, networkRes.clone());
      if (request.mode === 'navigate') {
        await appCache.put(resolveAssetUrl('./index.html'), networkRes.clone());
      }
    }
    return networkRes;
  } catch {
    const cached = (await appCache.match(cleanKey)) || (await appCache.match(request));
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const indexCached =
        (await appCache.match(resolveAssetUrl('./index.html'))) ||
        (await appCache.match(resolveAssetUrl('./')));
      if (indexCached) return indexCached;
    }

    return new Response(
      JSON.stringify({ error: 'offline', message: '目前處於離線狀態且無快取' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isProductImageRequest(url)) {
    event.respondWith(cacheFirstImage(request, url));
    return;
  }

  event.respondWith(networkFirstApp(request, url));
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'PRECACHE_IMAGES' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const imgCache = await caches.open(IMG_CACHE);
      const appCache = await caches.open(APP_CACHE);

      // 一併確保 App Shell 已就緒
      await Promise.allSettled(
        APP_SHELL_PATHS.map(async (rel) => {
          const full = resolveAssetUrl(rel);
          if (!(await appCache.match(full))) {
            const res = await fetch(new Request(full, { cache: 'reload' }));
            if (res.ok) await appCache.put(full, res);
          }
        })
      );

      const uniqueUrls = [...new Set(data.urls.map(resolveAssetUrl))];
      let done = 0;
      let failed = 0;
      const total = uniqueUrls.length;

      for (const imgUrl of uniqueUrls) {
        try {
          const existing = await imgCache.match(imgUrl);
          if (existing) {
            done += 1;
          } else {
            const res = await fetch(new Request(imgUrl, { cache: 'reload' }));
            if (res.ok) {
              await imgCache.put(imgUrl, res);
              done += 1;
            } else {
              failed += 1;
            }
          }
        } catch {
          failed += 1;
        }

        if (event.source) {
          event.source.postMessage({
            type: 'PRECACHE_PROGRESS',
            done,
            total,
            failed,
            finished: false
          });
        }
      }

      const finalPayload = {
        type: 'PRECACHE_PROGRESS',
        done,
        total,
        failed,
        finished: true
      };
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(finalPayload);
      } else if (event.source) {
        event.source.postMessage(finalPayload);
      }
    })());
  }
});
