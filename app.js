// ============ РЕЄСТР МОДУЛІВ ============
const modules = [
  { id: "credit",   title: "Кредити",   icon: "💳", desc: "Калькулятор кредитів", loaded: false, instance: null },
  { id: "utility",  title: "Комуналка", icon: "🏠", desc: "Розрахунок платежів",  loaded: false, instance: null },
  { id: "calendar", title: "Календар",  icon: "📅", desc: "Приватний календар",   loaded: false, instance: null }
];

// ============ DOM ============
const dashboard     = document.getElementById("dashboard");
const moduleScreen  = document.getElementById("moduleScreen");
const grid          = document.getElementById("modulesGrid");
const moduleTitle   = document.getElementById("moduleTitle");
const moduleContent = document.getElementById("moduleContent");
const btnBack       = document.getElementById("btnBack");
const btnExport     = document.getElementById("btnExport");
const btnImport     = document.getElementById("btnImport");
const btnClearAll   = document.getElementById("btnClearAll");
const fileInput     = document.getElementById("fileInput");
const toastEl       = document.getElementById("toast");

// ============ УТИЛІТИ ============
function showToast(msg, ms = 2400) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// ============ ДАШБОРД ============
function renderDashboard() {
  grid.innerHTML = "";

  modules.forEach(m => {
    const card = document.createElement("div");
    card.className = "module-card";
    card.innerHTML = `
      <div class="icon">${m.icon}</div>
      <div class="title">${escapeHtml(m.title)}</div>
      <div class="desc">${escapeHtml(m.desc || "")}</div>
    `;
    card.onclick = () => openModule(m);
    grid.appendChild(card);
  });

  const addCard = document.createElement("div");
  addCard.className = "module-card add-card";
  addCard.innerHTML = `<div class="icon">＋</div><div class="title">Додати модуль</div>`;
  addCard.onclick = () => showToast("Скоро: шаблон для нових модулів");
  grid.appendChild(addCard);
}


// ============ ВІДКРИТТЯ МОДУЛЯ ============
async function openModule(m) {
  moduleTitle.textContent = m.title;
  moduleContent.innerHTML = `<div class="placeholder"><div class="big">⏳</div><h3>Завантаження…</h3></div>`;

  dashboard.classList.remove("active");
  moduleScreen.classList.add("active");
  moduleScreen.scrollTop = 0;

  try {
    if (!m.loaded) {
      const mod = await import(`./modules/${m.id}.js`);
      m.instance = mod.default;
      m.loaded = true;
    }


    if (m.instance && typeof m.instance.init === "function") {
      try {
        await m.instance.init(moduleContent);
      } catch (err) {
        console.error("Помилка ініціалізації модуля:", err);
        moduleContent.innerHTML = `
          <div class="placeholder">
            <div class="big">⚠️</div>
            <h3>${escapeHtml(m.title)}</h3>
            <p>Помилка: ${escapeHtml(err.message || String(err))}</p>
          </div>
        `;
      }
    } else {
      moduleContent.innerHTML = `
        <div class="placeholder">
          <div class="big">${m.icon}</div>
          <h3>${escapeHtml(m.title)}</h3>
          <p>Модуль у розробці.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error("Не вдалось завантажити модуль:", err);
    moduleContent.innerHTML = `
      <div class="placeholder">
        <div class="big">${m.icon}</div>
        <h3>${escapeHtml(m.title)}</h3>
        <p>Модуль ще не підключений. Файл <code>modules/${m.id}.js</code> відсутній.</p>
      </div>
    `;
  }
}

// ============ НАЗАД ============
btnBack.onclick = () => {
  moduleScreen.classList.remove("active");
  dashboard.classList.add("active");
};

// ============ ПАКЕТНИЙ ЕКСПОРТ ============
btnExport.onclick = async () => {
  try {
    const data = await getAllFromDB();

    const pack = {
      app: "MyBox",
      version: "1.0",
      exportedAt: new Date().toISOString(),
      modules: data
    };

    const json = JSON.stringify(pack, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mybox-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setTimeout(() => {
      showToast("📦 Бекап завантажено. Надішли його собі на пошту.", 4000);
    }, 500);
  } catch (e) {
    console.error("Export error:", e);
    showToast("❌ Помилка експорту");
  }
};

// Читає ВСЕ з IndexedDB MyBoxDB
async function getAllFromDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("MyBoxDB", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("kv", "readonly");
      const store = tx.objectStore("kv");
      const result = {};
      const cursor = store.openCursor();
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          result[c.key] = c.value;
          c.continue();
        } else {
          db.close();
          resolve(result);
        }
      };
      cursor.onerror = () => { db.close(); reject(cursor.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

// ============ ПАКЕТНИЙ ІМПОРТ ============
btnImport.onclick = () => fileInput.click();

fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const pack = JSON.parse(text);

    if (!pack.modules || typeof pack.modules !== "object") {
      showToast("❌ Невірний формат файлу");
      fileInput.value = "";
      return;
    }

    const ok = confirm("Імпорт замінить УСІ дані коробки.\n\nПродовжити?");
    if (!ok) { fileInput.value = ""; return; }

    // Записуємо всі дані в IndexedDB
    await setAllToDB(pack.modules);

    showToast("✅ Імпорт завершено. Перезавантаження…", 2000);
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    console.error("Import error:", err);
    showToast("❌ Помилка імпорту");
  }

  fileInput.value = "";
};

// Записує ВСЕ в IndexedDB MyBoxDB
async function setAllToDB(data) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("MyBoxDB", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      store.clear();
      for (const [key, value] of Object.entries(data)) {
        store.put(value, key);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    req.onerror = () => reject(req.error);
  });
}
// ============ ОЧИЩЕННЯ ВСЬОГО ============
if (btnClearAll) {
  btnClearAll.onclick = async () => {
    const ok = confirm("⚠️ УВАГА!\n\nЦе видалить УСІ дані коробки.\n\nПродовжити?");
    if (!ok) return;

    const ok2 = confirm("Точно впевнені?\n\nКраще спочатку зробити експорт (📦).");
    if (!ok2) return;

    try {
      // Видаляємо базу
      const req = indexedDB.deleteDatabase("MyBoxDB");
      req.onsuccess = () => {
        showToast("🗑 Усі дані видалено. Перезавантаження…", 2000);
        setTimeout(() => location.reload(), 800);
      };
      req.onerror = () => showToast("❌ Помилка видалення");
      req.onblocked = () => showToast("⚠️ Закрийте інші вкладки сайту");
    } catch (err) {
      console.error("Clear error:", err);
      showToast("❌ Помилка очищення");
    }
  };
}

// ============ SERVICE WORKER ============
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.warn("SW не зареєстровано:", err);
    });
  });
}

// ============ СТАРТ ============
renderDashboard();