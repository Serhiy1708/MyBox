// modules/construction.js
import { storage } from "./_storage.js";

let containerRef = null;
let activeTab = "projects";

// Стан
let projects = [];
let rooms = [];
let stages = [];
let expenses = [];
let categories = [
  { id: 1, name: "Матеріали" },
  { id: 2, name: "Робота" },
  { id: 3, name: "Інструменти" }
];
let currentProjectId = null;

const PRESETS = [
  "Демонтаж", "Електрика", "Шпаклівка", "Ґрунт", "Фарбування",
  "Підлога", "Плитка", "Сантехніка", "Фурнітура", "Прибирання"
];

// ==================== УТИЛІТИ ====================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function fmtMoney(cents) {
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format((cents || 0) / 100) + " ₴";
}
function toCents(v) {
  return Math.round((parseFloat(v) || 0) * 100);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ==================== СХОВИЩЕ ====================
async function loadAll() {
  projects = await storage.get("construction", "projects", []) || [];
  rooms = await storage.get("construction", "rooms", []) || [];
  stages = await storage.get("construction", "stages", []) || [];
  expenses = await storage.get("construction", "expenses", []) || [];
  const cats = await storage.get("construction", "categories", null);
  if (cats) categories = cats;
  currentProjectId = await storage.get("construction", "currentProjectId", null);
}
async function saveAll() {
  await storage.set("construction", "projects", projects);
  await storage.set("construction", "rooms", rooms);
  await storage.set("construction", "stages", stages);
  await storage.set("construction", "expenses", expenses);
  await storage.set("construction", "categories", categories);
  await storage.set("construction", "currentProjectId", currentProjectId);
}

function getCurrentProject() {
  return projects.find(p => p.id === currentProjectId);
}
function getProjectRooms(projId) {
  return rooms.filter(r => r.project_id === projId);
}
function getProjectExpenses(projId) {
  return expenses.filter(e => e.project_id === projId);
}

// ==================== РЕНДЕР: ВКЛАДКИ ====================
function switchTab(tab) {
  activeTab = tab;
  const c = containerRef;
  c.querySelectorAll(".con-tab-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  c.querySelectorAll(".con-tab-content").forEach(el => {
    el.classList.toggle("active", el.id === "con-tab-" + tab);
  });
  if (tab === "projects") renderProjects();
  if (tab === "rooms") renderRooms();
  if (tab === "stages") renderStages();
  if (tab === "expenses") renderExpenses();
}

// ==================== ПРОЄКТИ ====================
function renderProjects() {
  const box = containerRef.querySelector("#con-projectsList");
  if (projects.length === 0) {
    box.innerHTML = `<div class="con-empty">Немає проєктів. Додай перший 👆</div>`;
    return;
  }
  box.innerHTML = projects.map(p => {
    const sum = getProjectExpenses(p.id).reduce((s, e) => s + e.total_cents, 0);
    const area = p.total_area || 0;
    const perM2 = area > 0 ? (sum / 100 / area).toFixed(2) : "—";
    const active = p.id === currentProjectId;
    return `
      <div class="con-card ${active ? "con-card-active" : ""}" data-open="${p.id}">
        <div class="con-card-header">
          <div>
            <b>${escapeHtml(p.name)}</b>
            ${active ? '<span class="con-active-badge">Активний</span>' : ''}
          </div>
          <button class="con-btn-danger" data-del="${p.id}">✕</button>
        </div>
        <div class="con-muted">Площа: ${area} м²</div>
        <div class="con-muted">Витрати: ${fmtMoney(sum)}</div>
        <div class="con-muted"><b>грн/м²:</b> ${perM2}</div>
      </div>
    `;
  }).join("");

  box.querySelectorAll("[data-open]").forEach(el => {
    el.addEventListener("click", async (ev) => {
      if (ev.target.dataset.del) return;
      currentProjectId = el.dataset.open;   // ← БЕЗ parseInt
      await saveAll();
      renderProjects();
    });
  });
  box.querySelectorAll("[data-del]").forEach(el => {
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm("Видалити проєкт і всі його дані?")) return;
      const id = el.dataset.del;   // ← БЕЗ parseInt
      projects = projects.filter(p => p.id !== id);
      rooms = rooms.filter(r => r.project_id !== id);
      stages = stages.filter(s => s.project_id !== id);
      expenses = expenses.filter(e => e.project_id !== id);
      if (currentProjectId === id) currentProjectId = projects[0]?.id || null;
      await saveAll();
      renderProjects();
    });
  });
}

async function addProject() {
  const name = prompt("Назва проєкту:", "Новий проєкт");
  if (!name) return;
  const area = parseFloat(prompt("Площа (м²):", "50") || "0") || 0;
  const id = uid();
  projects.push({ id, name, total_area: area, created_at: Date.now() });
  currentProjectId = id;
  await saveAll();
  renderProjects();
}

// ==================== КІМНАТИ ====================
function renderRooms() {
  const box = containerRef.querySelector("#con-roomsList");
  const proj = getCurrentProject();
  if (!proj) {
    box.innerHTML = `<div class="con-empty">Обери проєкт спочатку</div>`;
    return;
  }
  const list = getProjectRooms(proj.id);
  if (list.length === 0) {
    box.innerHTML = `<div class="con-empty">Немає кімнат</div>`;
    return;
  }
  box.innerHTML = list.map(rm => `
    <div class="con-card">
      <div class="con-card-header">
        <b>${escapeHtml(rm.name)}</b>
        <button class="con-btn-danger" data-del-room="${rm.id}">✕</button>
      </div>
      <div class="con-muted">${rm.area || "—"} м²</div>
    </div>
  `).join("");
  box.querySelectorAll("[data-del-room]").forEach(el => {
    el.addEventListener("click", async () => {
      if (!confirm("Видалити кімнату?")) return;
      const id = el.dataset.delRoom;
      rooms = rooms.filter(r => r.id !== id);
      stages = stages.filter(s => s.room_id !== id);
      await saveAll();
      renderRooms();
    });
  });
}

async function addRoom() {
  const proj = getCurrentProject();
  if (!proj) { alert("Спочатку створи проєкт"); return; }
  const name = prompt("Назва кімнати:", "Кімната");
  if (!name) return;
  const area = parseFloat(prompt("Площа (м²):", "10") || "0") || 0;
  rooms.push({ id: uid(), project_id: proj.id, name, area });
  await saveAll();
  renderRooms();
}

// ==================== ЕТАПИ ====================
function renderStages() {
  const box = containerRef.querySelector("#con-stagesBox");
  const proj = getCurrentProject();
  if (!proj) {
    box.innerHTML = `<div class="con-empty">Обери проєкт спочатку</div>`;
    return;
  }
  const projRooms = getProjectRooms(proj.id);
  if (projRooms.length === 0) {
    box.innerHTML = `<div class="con-empty">Спочатку додай кімнати</div>`;
    return;
  }
  box.innerHTML = projRooms.map((rm, idx) => {
    const rmStages = stages.filter(s => s.room_id === rm.id && s.project_id === proj.id);
    const done = rmStages.filter(s => s.status === "done").length;
    return `
      <div class="con-room-block">
        <div class="con-room-header" data-rtoggle="${rm.id}">
          <div><b>${escapeHtml(rm.name)}</b> <span class="con-muted">• ${done}/${rmStages.length}</span></div>
          <button class="con-btn-ghost" data-add-stage="${rm.id}">+ Етап</button>
        </div>
        <div class="con-room-body ${idx === 0 ? "open" : ""}" id="con-body-${rm.id}">
          <div class="con-preset-row">
            <button class="con-btn-sm" data-preset="${rm.id}">+ Пресет (10 етапів)</button>
            <button class="con-btn-sm" data-all-done="${rm.id}">✔ Позначити всі</button>
          </div>
          <div class="con-stages-list" id="con-list-${rm.id}">
            ${rmStages.length === 0 ? '<div class="con-muted" style="padding:10px;">Немає етапів</div>' : ""}
            ${rmStages.map(s => `
              <div class="con-stage-item ${s.status === "done" ? "done" : ""}">
                <input type="checkbox" ${s.status === "done" ? "checked" : ""} data-stage-toggle="${s.id}">
                <div style="flex:1">${escapeHtml(s.title)}</div>
                <button class="con-btn-danger" data-stage-del="${s.id}">✕</button>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }).join("");

  box.querySelectorAll("[data-rtoggle]").forEach(el => {
    el.addEventListener("click", (ev) => {
      if (ev.target.dataset.addStage) return;
      const body = containerRef.querySelector("#con-body-" + el.dataset.rtoggle);
      body.classList.toggle("open");
    });
  });
  box.querySelectorAll("[data-add-stage]").forEach(el => {
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const roomId = el.dataset.addStage;
      const title = prompt("Назва етапу:", "Новий етап");
      if (!title) return;
      stages.push({ id: uid(), project_id: proj.id, room_id: roomId, title, status: "planned" });
      await saveAll();
      renderStages();
    });
  });
  box.querySelectorAll("[data-preset]").forEach(el => {
    el.addEventListener("click", async () => {
      const roomId = el.dataset.preset;
      PRESETS.forEach(title => {
        stages.push({ id: uid(), project_id: proj.id, room_id: roomId, title, status: "planned" });
      });
      await saveAll();
      renderStages();
    });
  });
  box.querySelectorAll("[data-all-done]").forEach(el => {
    el.addEventListener("click", async () => {
      const roomId = el.dataset.allDone;
      stages.filter(s => s.room_id === roomId && s.project_id === proj.id)
        .forEach(s => s.status = "done");
      await saveAll();
      renderStages();
    });
  });
  box.querySelectorAll("[data-stage-toggle]").forEach(el => {
    el.addEventListener("change", async () => {
      const s = stages.find(x => x.id === el.dataset.stageToggle);
      if (s) { s.status = el.checked ? "done" : "planned"; await saveAll(); renderStages(); }
    });
  });
  box.querySelectorAll("[data-stage-del]").forEach(el => {
    el.addEventListener("click", async () => {
      stages = stages.filter(x => x.id !== el.dataset.stageDel);
      await saveAll();
      renderStages();
    });
  });
}

// ==================== ВИТРАТИ ====================
let filterCategory = "";
let filterRoom = "";
let filterMonth = "";

function renderExpenses() {
  const c = containerRef;
  const proj = getCurrentProject();
  if (!proj) {
    c.querySelector("#con-expTable tbody").innerHTML = "";
    c.querySelector("#con-expTotal").textContent = "0 ₴";
    return;
  }

  // Заповнюємо селекти
  const catSelect = c.querySelector("#con-filterCat");
  catSelect.innerHTML = `<option value="">Всі категорії</option>` +
    categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join("");
  const roomSelect = c.querySelector("#con-filterRoom");
  roomSelect.innerHTML = `<option value="">Всі кімнати</option>` +
    getProjectRooms(proj.id).map(rm => `<option value="${rm.id}">${rm.name}</option>`).join("");

  let list = getProjectExpenses(proj.id);
  if (filterCategory) list = list.filter(e => String(e.category_id) === String(filterCategory));
  if (filterRoom) list = list.filter(e => String(e.room_id) === String(filterRoom));
  if (filterMonth) list = list.filter(e => (e.purchased_at || "").startsWith(filterMonth));

  list.sort((a, b) => (b.purchased_at || "").localeCompare(a.purchased_at || ""));

  // Таблиця
  const tbody = c.querySelector("#con-expTable tbody");
  tbody.innerHTML = list.map(e => {
    const cat = categories.find(x => x.id === e.category_id)?.name || "";
    const room = rooms.find(r => r.id === e.room_id)?.name || "—";
    return `
      <tr>
        <td>${e.purchased_at || ""}</td>
        <td>${cat}</td>
        <td>${room}</td>
        <td>${escapeHtml(e.title)}</td>
        <td>${e.quantity}</td>
        <td>${e.unit || ""}</td>
        <td>${fmtMoney(e.unit_price_cents)}</td>
        <td>${fmtMoney(e.total_cents)}</td>
        <td>
          <button class="con-btn-sm" data-exp-edit="${e.id}">✎</button>
          <button class="con-btn-danger" data-exp-del="${e.id}">✕</button>
        </td>
      </tr>
    `;
  }).join("");

  const total = list.reduce((s, e) => s + e.total_cents, 0);
  c.querySelector("#con-expTotal").textContent = fmtMoney(total);

  // Статистика по категоріях
  const byCat = {};
  list.forEach(e => { byCat[e.category_id] = (byCat[e.category_id] || 0) + e.total_cents; });
  const statsBox = c.querySelector("#con-expStats");
  statsBox.innerHTML = categories.map(cat => {
    const sum = byCat[cat.id] || 0;
    if (sum === 0) return "";
    return `<div class="con-stat-row"><span>${cat.name}</span><b>${fmtMoney(sum)}</b></div>`;
  }).join("");

  // Обробники
  tbody.querySelectorAll("[data-exp-del]").forEach(el => {
    el.addEventListener("click", async () => {
      if (!confirm("Видалити витрату?")) return;
      expenses = expenses.filter(x => x.id !== el.dataset.expDel);
      await saveAll();
      renderExpenses();
    });
  });
  tbody.querySelectorAll("[data-exp-edit]").forEach(el => {
    el.addEventListener("click", () => editExpense(el.dataset.expEdit));
  });
}

async function editExpense(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  const title = prompt("Назва:", e.title);
  if (title === null) return;
  const qty = parseFloat(prompt("Кількість:", e.quantity) || e.quantity);
  const price = parseFloat(prompt("Ціна за од. (грн):", (e.unit_price_cents / 100).toFixed(2)) || (e.unit_price_cents / 100));
  e.title = title.trim();
  e.quantity = qty;
  e.unit_price_cents = toCents(price);
  e.total_cents = Math.round(qty * e.unit_price_cents);
  await saveAll();
  renderExpenses();
}

async function addExpense() {
  const c = containerRef;
  const proj = getCurrentProject();
  if (!proj) { alert("Спочатку створи проєкт"); return; }

  const title = c.querySelector("#con-expTitle").value.trim();
  if (!title) { alert("Введи назву"); return; }

  const qty = parseFloat(c.querySelector("#con-expQty").value) || 1;
  const unit = c.querySelector("#con-expUnit").value || "шт";
  const price = toCents(c.querySelector("#con-expPrice").value);
  const catId = parseInt(c.querySelector("#con-expCat").value);
  const roomId = c.querySelector("#con-expRoom").value || null;
  const date = c.querySelector("#con-expDate").value || todayISO();
  const vendor = c.querySelector("#con-expVendor").value.trim();
  const note = c.querySelector("#con-expNote").value.trim();

  expenses.push({
    id: uid(),
    project_id: proj.id,
    room_id: roomId,
    category_id: catId,
    title, quantity: qty, unit,
    unit_price_cents: price,
    total_cents: Math.round(qty * price),
    purchased_at: date,
    vendor, note
  });
  await saveAll();

  // Очищаємо
  c.querySelector("#con-expTitle").value = "";
  c.querySelector("#con-expQty").value = "";
  c.querySelector("#con-expUnit").value = "";
  c.querySelector("#con-expPrice").value = "";
  c.querySelector("#con-expVendor").value = "";
  c.querySelector("#con-expNote").value = "";

  renderExpenses();
}

// ==================== МОДУЛЬ ====================
export default {
  id: "construction",
  title: "Будівництво",
  icon: "🏗️",

  styles: `
    .con-wrap { padding-bottom: 20px; }

    .con-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 14px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .con-tab-btn {
      flex: 0 0 auto;
      padding: 10px 14px;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-weight: 700;
      font-size: 13px;
      color: var(--text-muted);
      font-family: inherit;
      white-space: nowrap;
    }
    .con-tab-btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .con-tab-content { display: none; }
    .con-tab-content.active { display: block; }

    .con-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      padding: 10px 16px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      font-family: inherit;
    }
    .con-btn:hover { background: linear-gradient(135deg, var(--accent), #4a9eff); }
    .con-btn:active { transform: scale(0.98); }

    .con-btn-sm {
      background: rgba(108,92,231,0.15);
      color: var(--accent-light);
      border: 1px solid var(--accent);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }
    .con-btn-sm:hover { background: var(--accent); color: #fff; }

    .con-btn-ghost {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
    }
    .con-btn-ghost:hover { border-color: var(--accent); color: var(--accent-light); }

    .con-btn-danger {
      background: rgba(239,68,68,0.15);
      color: var(--danger);
      border: none;
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-weight: 700;
      font-family: inherit;
    }
    .con-btn-danger:active { background: var(--danger); color: #fff; }

    .con-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: 0.15s;
    }
    .con-card:hover { border-color: var(--accent); }
    .con-card-active { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(108,92,231,0.15); }

    .con-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    }

    .con-active-badge {
      background: var(--accent);
      color: #fff;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 10px;
      margin-left: 8px;
      text-transform: uppercase;
      font-weight: 700;
    }

    .con-muted { color: var(--text-muted); font-size: 13px; margin-top: 3px; }
    .con-empty {
      text-align: center;
      color: var(--text-muted);
      padding: 40px 20px;
      font-size: 14px;
    }

    .con-room-block {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      margin-bottom: 10px;
      overflow: hidden;
    }
    .con-room-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      cursor: pointer;
      gap: 10px;
    }
    .con-room-header:hover { background: var(--bg-soft); }
    .con-room-body {
      display: none;
      padding: 12px 14px;
      border-top: 1px solid var(--border);
      background: var(--bg-soft);
    }
    .con-room-body.open { display: block; }

    .con-preset-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }

    .con-stage-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 6px;
    }
    .con-stage-item.done {
      border-color: var(--success);
      background: rgba(74,222,128,0.05);
    }
    .con-stage-item.done div { text-decoration: line-through; opacity: 0.7; }

    .con-form {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px;
      margin-bottom: 14px;
      display: grid;
      gap: 10px;
    }
    .con-form input, .con-form select, .con-form textarea {
      width: 100%;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-family: inherit;
      font-size: 14px;
    }
    .con-form input:focus, .con-form select:focus, .con-form textarea:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }
    .con-form textarea { resize: vertical; min-height: 60px; }

    .con-form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .con-form-row3 {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 10px;
    }

    .con-filters {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }

    .con-table-wrap {
      overflow-x: auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      margin-bottom: 12px;
    }
    .con-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .con-table th, .con-table td {
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    .con-table th {
      background: var(--bg-soft);
      font-weight: 700;
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
    }
    .con-table tr:last-child td { border-bottom: none; }

    .con-total {
      background: var(--card);
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      padding: 12px;
      text-align: right;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 14px;
    }
    .con-total span { color: var(--accent-light); font-size: 20px; }

    .con-stats {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px;
      margin-bottom: 14px;
    }
    .con-stat-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .con-stat-row:last-child { border-bottom: none; }
    .con-stat-row b { color: var(--success); }

    @media (max-width: 500px) {
      .con-form-row3 { grid-template-columns: 1fr; }
      .con-filters { grid-template-columns: 1fr; }
    }
  `,

  template: `
    <div class="con-wrap">
      <div class="con-tabs">
        <button class="con-tab-btn active" data-tab="projects">📁 Проєкти</button>
        <button class="con-tab-btn" data-tab="rooms">🚪 Кімнати</button>
        <button class="con-tab-btn" data-tab="stages">✅ Етапи</button>
        <button class="con-tab-btn" data-tab="expenses">💸 Витрати</button>
      </div>

      <!-- ПРОЄКТИ -->
      <div id="con-tab-projects" class="con-tab-content active">
        <button class="con-btn" id="con-addProject" style="margin-bottom:14px;">+ Новий проєкт</button>
        <div id="con-projectsList"></div>
      </div>

      <!-- КІМНАТИ -->
      <div id="con-tab-rooms" class="con-tab-content">
        <button class="con-btn" id="con-addRoom" style="margin-bottom:14px;">+ Нова кімната</button>
        <div id="con-roomsList"></div>
      </div>

      <!-- ЕТАПИ -->
      <div id="con-tab-stages" class="con-tab-content">
        <div id="con-stagesBox"></div>
      </div>

      <!-- ВИТРАТИ -->
      <div id="con-tab-expenses" class="con-tab-content">
        <div class="con-filters">
          <select id="con-filterCat"></select>
          <select id="con-filterRoom"></select>
          <input type="month" id="con-filterMonth" placeholder="Місяць">
        </div>

        <div class="con-form">
          <input type="text" id="con-expTitle" placeholder="Назва (напр. Цемент М400)">
          <div class="con-form-row3">
            <input type="number" id="con-expQty" placeholder="К-сть" step="0.01">
            <input type="text" id="con-expUnit" placeholder="Од. (шт, м², кг)">
            <input type="number" id="con-expPrice" placeholder="Ціна/од, ₴" step="0.01">
          </div>
          <div class="con-form-row">
            <select id="con-expCat"></select>
            <select id="con-expRoom"></select>
          </div>
          <div class="con-form-row">
            <input type="date" id="con-expDate">
            <input type="text" id="con-expVendor" placeholder="Постачальник (не обов'язково)">
          </div>
          <textarea id="con-expNote" placeholder="Нотатка"></textarea>
          <button class="con-btn" id="con-addExpense">+ Додати витрату</button>
        </div>

        <div class="con-total">Разом: <span id="con-expTotal">0 ₴</span></div>

        <div class="con-stats" id="con-expStats"></div>

        <div class="con-table-wrap">
          <table class="con-table" id="con-expTable">
            <thead>
              <tr>
                <th>Дата</th><th>Категорія</th><th>Кімната</th><th>Назва</th>
                <th>К-сть</th><th>Од.</th><th>Ціна</th><th>Сума</th><th></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `,

  async init(container) {
    containerRef = container;

    if (!document.getElementById(`style-${this.id}`)) {
      const style = document.createElement("style");
      style.id = `style-${this.id}`;
      style.textContent = this.styles;
      document.head.appendChild(style);
    }

    container.innerHTML = this.template;

    await loadAll();

    // Вкладки
    container.querySelectorAll(".con-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Кнопки проєктів/кімнат
    container.querySelector("#con-addProject").addEventListener("click", addProject);
    container.querySelector("#con-addRoom").addEventListener("click", addRoom);
    container.querySelector("#con-addExpense").addEventListener("click", addExpense);

    // Фільтри
    container.querySelector("#con-filterCat").addEventListener("change", (e) => {
      filterCategory = e.target.value; renderExpenses();
    });
    container.querySelector("#con-filterRoom").addEventListener("change", (e) => {
      filterRoom = e.target.value; renderExpenses();
    });
    container.querySelector("#con-filterMonth").addEventListener("change", (e) => {
      filterMonth = e.target.value; renderExpenses();
    });

    // Початковий рендер
    renderProjects();
    switchTab("projects");
  },

  async getData() {
    return { projects, rooms, stages, expenses, categories, currentProjectId };
  },

  async setData(data) {
    if (!data) return;
    projects = data.projects || [];
    rooms = data.rooms || [];
    stages = data.stages || [];
    expenses = data.expenses || [];
    categories = data.categories || categories;
    currentProjectId = data.currentProjectId || null;
    await saveAll();
    if (containerRef) {
      renderProjects();
      switchTab(activeTab);
    }
  },

  async resetData() {
    projects = [];
    rooms = [];
    stages = [];
    expenses = [];
    currentProjectId = null;
    await saveAll();
    if (containerRef) {
      renderProjects();
      switchTab("projects");
    }
  }
};