const CACHE = "mybox-v5";

// Файли, які треба кешувати для офлайну
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./modules/_storage.js",
  "./modules/credit.js",
  "./modules/utility.js",
  "./modules/calendar.js"
];

// ---- INSTALL: кешуємо все ----
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // Кешуємо кожен файл окремо — якщо один впаде, інші все одно закешуються
      return Promise.all(
        ASSETS.map(url =>
          c.add(url).catch(err => console.warn("Не закешовано:", url, err))
        )
      );
    })
  );
  self.skipWaiting(); // активуємо новий SW одразу
});

// ---- ACTIVATE: чистимо старий кеш ----
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim(); // беремо контроль над сторінками одразу
});

// ---- FETCH: спочатку мережа, потім кеш (для оновлень) ----
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Не кешуємо запити до інших доменів
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Успішна відповідь — оновлюємо кеш і віддаємо
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => {
        // Мережа недоступна — беремо з кешу (офлайн)
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          // Якщо нічого немає — віддаємо index.html (SPA-фолбек)
          return caches.match("./index.html");
        });
      })
  );
});