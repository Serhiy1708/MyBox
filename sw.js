const CACHE = "mybox-v9";

// INSTALL: закешувати файли
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return Promise.all([
        c.add("./index.html").catch(err => console.warn("Не закешовано index.html:", err)),
        c.add("./app.js").catch(err => console.warn("Не закешовано app.js:", err)),
        c.add("./style.css").catch(err => console.warn("Не закешовано style.css:", err)),
        c.add("./modules/_storage.js").catch(err => console.warn("Не закешовано _storage.js:", err)),
        c.add("./modules/credit.js").catch(err => console.warn("Не закешовано credit.js:", err)),
        c.add("./modules/utility.js").catch(err => console.warn("Не закешовано utility.js:", err)),
        c.add("./modules/calendar.js").catch(err => console.warn("Не закешовано calendar.js:", err)),
        c.add("./modules/construction.js").catch(err => console.warn("Не закешовано construction.js:", err)) // ← НОВИЙ
      ]);
    })
  );
  self.skipWaiting();
});

// ACTIVATE: чистимо старі кеші
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// FETCH: мережа → кеш → fallback на index.html
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(async () => {
        // Мережа недоступна — пробуємо кеш
        const cached = await caches.match(e.request);
        if (cached) return cached;

        // Для навігаційних запитів — віддаємо index.html
        if (e.request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }

        // Якщо нічого немає — повертаємо помилку
        return new Response("Офлайн — ресурс не закешовано", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
      })
  );
});