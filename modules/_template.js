// modules/_template.js
// ============================================================
// ШАБЛОН МОДУЛЯ ДЛЯ КОРОБКИ
// ============================================================
// Як користуватись:
// 1. Скопіюй цей файл під назвою <id>.js (наприклад utility.js)
// 2. Заміни id, title, icon
// 3. Впиши свій CSS у styles
// 4. Впиши свій HTML у template (БЕЗ <html>, <body> — тільки контент)
// 5. Впиши логіку в init(container)
// 6. Реалізуй getData / setData / resetData для пакетного експорту
// 7. У app.js додай модуль у масив modules:
//    { id: "<id>", title: "Назва", icon: "🎯", desc: "Опис" }
// ============================================================

import { storage } from "./_storage.js";

let items = [];
let containerRef = null;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

async function save() {
  await storage.set("template", "data", items);
}

async function load() {
  const data = await storage.get("template", "data", []);
  items = Array.isArray(data) ? data : [];
}

async function addItem() {
  const input = containerRef.querySelector("#tpl_input");
  const value = input.value.trim();
  if (!value) { alert("Введіть значення"); return; }

  items.unshift({ id: uid(), value, createdAt: Date.now() });
  input.value = "";
  await save();
  render();
}

async function deleteItem(id) {
  items = items.filter(x => x.id !== id);
  await save();
  render();
}

function render() {
  const list = containerRef.querySelector("#tpl_list");
  if (items.length === 0) {
    list.innerHTML = `<div class="tpl-empty">Поки що порожньо</div>`;
  } else {
    list.innerHTML = items.map(x => `
      <div class="tpl-item">
        <span>${escapeHtml(x.value)}</span>
        <button onclick="window.tplDelete('${x.id}')">✕</button>
      </div>
    `).join("");
  }
}

export default {
  id: "template",
  title: "Шаблон",
  icon: "🧩",

  styles: `
    .tpl-wrap { padding-bottom: 20px; }

    .tpl-form {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      margin-bottom: 16px;
      display: flex;
      gap: 8px;
    }
    .tpl-form input {
      flex: 1;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: var(--radius-sm);
      padding: 11px 12px;
      font-size: 15px;
      font-family: inherit;
    }
    .tpl-form input:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }
    .tpl-form button {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      padding: 11px 16px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: 0.2s;
    }
    .tpl-form button:hover {
      background: linear-gradient(135deg, var(--accent), #4a9eff);
    }
    .tpl-form button:active { transform: scale(0.98); }

    .tpl-item {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 14px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .tpl-item button {
      background: rgba(239,68,68,0.1);
      border: none;
      color: var(--danger);
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 6px;
      font-weight: 700;
      font-family: inherit;
    }
    .tpl-item button:active {
      background: var(--danger);
      color: #fff;
    }

    .tpl-empty {
      text-align: center;
      color: var(--text-muted);
      padding: 40px 20px;
      font-size: 15px;
    }
  `,

  template: `
    <div class="tpl-wrap">
      <div class="tpl-form">
        <input type="text" id="tpl_input" placeholder="Введи щось...">
        <button id="tpl_add">+</button>
      </div>
      <div id="tpl_list"></div>
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

    container.querySelector("#tpl_add").addEventListener("click", addItem);
    container.querySelector("#tpl_input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") addItem();
    });

    window.tplDelete = deleteItem;

    await load();
    render();
  },

  async getData() {
    return { items };
  },

  async setData(data) {
    items = (data && data.items) || [];
    await save();
    if (containerRef) render();
  },

  async resetData() {
    items = [];
    await save();
    if (containerRef) render();
  }
};