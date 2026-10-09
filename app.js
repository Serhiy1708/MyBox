// ============ РЕЄСТР МОДУЛІВ ============
// Коли додаєш новий модуль — додай сюди рядок.
// Модуль має бути у файлі modules/<id>.js і експортувати об'єкт.
const modules = [
  {
    id: "credit",
    title: "Кредити",
    icon: "💳",
    desc: "Калькулятор кредитів",
    loaded: false,
    instance: null
  },
  {
    id: "utility",
    title: "Комуналка",
    icon: "🏠",
    desc: "Розрахунок платежів",
    loaded: false,
    instance: null
  },
  {
    id: "calendar",
    title: "Календар",
    icon: "📅",
    desc: "Приватний календар",
    loaded: false,
    instance: null
  }
];

// ============ DOM ============
const dashboard    = document.getElementById("dashboard");
const moduleScreen = document.getElementById("moduleScreen");
const grid         = document.getElementById("modulesGrid");
const moduleTitle  = document.getElementById("moduleTitle");
const moduleContent= document.getElementById("moduleContent");
const btnBack      = document.getElementById("btnBack");
const btnExport    = document.getElementById("btnExport");
const btnImport    = document.getElementById("btnImport");
const fileInput    = document.getElementById("fileInput");
const toastEl      = document.getElementById("toast");

// ============ УТИЛІТИ ============
function showToast(msg, ms = 2400) {
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

  // Карточка "додати модуль"
  const addCard = document.createElement("div");
  addCard.className = "module-card add-card";
  addCard.innerHTML = `
    <div class="icon">＋</div>
    <div class="title">Додати модуль</div>
  `;
  addCard.onclick = () => {
    showToast("Скоро: шаблон для нових модулів");
  };
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
    // Ліниве завантаження модуля
    if (!m.loaded) {
      const mod = await import(`./modules/${m.id}.js`);
      m.instance = mod.default;
      m.loaded = true;
    }

    moduleContent.innerHTML = "";
    if (m.instance && typeof m.instance.init === "function") {
      m.instance.init(moduleContent);
    } else {
      // Заглушка, якщо модуль ще не реалізовано
      moduleContent.innerHTML = `
        <div class="placeholder">
          <div class="big">${m.icon}</div>
          <h3>${escapeHtml(m.title)}</h3>
          <p>Модуль у розробці. Скоро тут буде повний функціонал.</p>
        </div>
      `;
    }
  } catch (err) {
    console.warn("Не вдалось завантажити модуль:", err);
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
  const pack = {
    app: "MyBox",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    modules: {}
  };

  for (const m of modules) {
    try {
      if (!m.loaded) {
        const mod = await import(`./modules/${m.id}.js`);
        m.instance = mod.default;
        m.loaded = true;
      }
      if (m.instance && typeof m.instance.getData === "function") {
        pack.modules[m.id] = m.instance.getData();
      } else {
        pack.modules[m.id] = null;
      }
    } catch (e) {
      pack.modules[m.id] = null;
    }
  }

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
};

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

    const ok = confirm(
      "Імпорт замінить усі дані поточної коробки.\n\nПродовжити?"
    );
    if (!ok) {
      fileInput.value = "";
      return;
    }

    for (const m of modules) {
      const data = pack.modules[m.id];
      if (data === undefined || data === null) continue;
      try {
        if (!m.loaded) {
          const mod = await import(`./modules/${m.id}.js`);
          m.instance = mod.default;
          m.loaded = true;
        }
        if (m.instance && typeof m.instance.setData === "function") {
          await m.instance.setData(data);
        }
      } catch (err) {
        console.warn(`Не вдалось імпортувати ${m.id}:`, err);
      }
    }

    showToast("✅ Імпорт завершено", 2500);
    setTimeout(() => {
      alert(
        "Імпорт завершено ✅\n\n" +
        "Рекомендуємо одразу зробити новий бекап (📦 Експорт пакетом) " +
        "і надіслати його собі на пошту або в хмару."
      );
    }, 600);
  } catch (err) {
    console.error(err);
    showToast("❌ Помилка читання файлу");
  }

  fileInput.value = "";
};

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