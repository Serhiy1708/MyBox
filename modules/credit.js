// modules/credit.js
import { storage } from "./_storage.js";

const BANKS = [
  "ПриватБанк", "Ощадбанк", "Укрексімбанк", "Райффайзен Банк",
  "УкрСиббанк", "ОТП Банк", "Sense Bank", "ПУМБ",
  "monobank", "Креді Агріколь Банк", "Кредобанк",
  "А-Банк", "Банк Львів", "ТАСкомбанк", "Ідея Банк",
  "ПроКредит Банк", "Укргазбанк", "Інший банк"
];

let credits = [];
let containerRef = null;
let expandedIds = new Set();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString("uk-UA", { maximumFractionDigits: 2 }) + " ₴";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

async function save() {
  await storage.set("credit", "data", credits);
}

async function load() {
  const data = await storage.get("credit", "data", []);
  credits = Array.isArray(data) ? data.filter(c => c && c.id && c.type) : [];
}

async function addCredit() {
  const bank = containerRef.querySelector("#cc_bank").value;
  const type = containerRef.querySelector("#cc_type").value;
  const sum = parseFloat(containerRef.querySelector("#cc_sum").value) || 0;

  if (sum <= 0) { alert("Введіть суму"); return; }

  const credit = {
    id: uid(),
    bank,
    type,
    sum,
    remaining: sum,
    createdAt: Date.now()
  };

  if (type === "installment") {
    const day = parseInt(containerRef.querySelector("#cc_day").value) || 1;
    const payment = parseFloat(containerRef.querySelector("#cc_payment").value) || 0;
    const months = parseInt(containerRef.querySelector("#cc_months").value) || 0;

    if (payment <= 0) { alert("Введіть суму платежу"); return; }
    if (months <= 0) { alert("Введіть кількість місяців"); return; }

    credit.day = day;
    credit.payment = payment;
    credit.months = months;
    credit.monthsPaid = 0;
  }

  credits.unshift(credit);
  expandedIds.add(credit.id);
  await save();
  render();

  containerRef.querySelector("#cc_sum").value = "";
  const p = containerRef.querySelector("#cc_payment");
  if (p) p.value = "";
  const m = containerRef.querySelector("#cc_months");
  if (m) m.value = "";
}

async function deleteCredit(id) {
  if (!confirm("Видалити?")) return;
  credits = credits.filter(c => c.id !== id);
  expandedIds.delete(id);
  await save();
  render();
}

async function toggleExpand(id) {
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
  render();
}

async function setRemaining(id, value) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  const v = parseFloat(value);
  if (isNaN(v) || v < 0) return;
  c.remaining = Math.min(v, c.sum);
  await save();
  render();
}

async function payFixed(id) {
  const c = credits.find(x => x.id === id);
  if (!c || c.type !== "installment") return;

  c.remaining = Math.max(0, c.remaining - c.payment);
  c.monthsPaid = (c.monthsPaid || 0) + 1;
  await save();
  render();

  if (c.remaining <= 0) {
    setTimeout(() => alert("🎉 Розстрочку повністю погашено!"), 100);
  }
}

async function payCustom(id) {
  const c = credits.find(x => x.id === id);
  if (!c || c.type !== "installment") return;

  const input = containerRef.querySelector(`#pay_${id}`);
  const v = parseFloat(input.value) || 0;
  if (v <= 0) { alert("Введіть суму"); return; }

  c.remaining = Math.max(0, c.remaining - v);
  c.monthsPaid = (c.monthsPaid || 0) + 1;
  await save();
  render();

  if (c.remaining <= 0) {
    setTimeout(() => alert("🎉 Розстрочку повністю погашено!"), 100);
  }
}

function render() {
  const list = containerRef.querySelector("#cc_list");
  const active = credits.filter(c => c.remaining > 0);

  if (active.length === 0) {
    list.innerHTML = `<div class="cc-empty">Ще немає активних кредитів</div>`;
  } else {
    list.innerHTML = active.map(c => renderCard(c)).join("");
  }

  const totalSum = active.reduce((s, c) => s + c.sum, 0);
  const totalRemaining = active.reduce((s, c) => s + c.remaining, 0);
  containerRef.querySelector("#cc_totalCount").textContent = active.length;
  containerRef.querySelector("#cc_totalSum").textContent = formatMoney(totalSum);
  containerRef.querySelector("#cc_totalRemaining").textContent = formatMoney(totalRemaining);
}

function renderCard(c) {
  const reduced = c.sum - c.remaining;
  const isInstallment = c.type === "installment";
  const isExpanded = expandedIds.has(c.id);

  const header = `
    <div class="cc-card-header" onclick="window.ccToggle('${c.id}')">
      <div class="cc-toggle ${isExpanded ? 'open' : ''}">›</div>
      <div class="cc-bank">${escapeHtml(c.bank)}</div>
      <div class="cc-type">${isInstallment ? "Розстрочка" : "Кредит"}</div>
      <button class="cc-del" onclick="event.stopPropagation(); window.ccDelete('${c.id}')">✕</button>
    </div>
    <div class="cc-summary">
      <div>
        <div class="cc-summary-lbl">Сума</div>
        <div class="cc-summary-val">${formatMoney(c.sum)}</div>
      </div>
      <div>
        <div class="cc-summary-lbl">Залишок</div>
        <div class="cc-summary-val accent">${formatMoney(c.remaining)}</div>
      </div>
    </div>
  `;

  if (!isExpanded) {
    return `<div class="cc-card">${header}</div>`;
  }

  let body = "";

  if (!isInstallment) {
    body = `
      <div class="cc-field">
        <label>Залишок</label>
        <input type="number" inputmode="decimal" min="0" max="${c.sum}"
          value="${c.remaining}"
          onchange="window.ccSetRemaining('${c.id}', this.value)">
      </div>
      <div class="cc-row">
        <span>Зменшено на</span>
        <span class="cc-reduced">${formatMoney(reduced)}</span>
      </div>
    `;
  } else {
    const totalMonths = c.months || 0;
    const paidMonths = c.monthsPaid || 0;
    const leftMonths = Math.max(0, totalMonths - paidMonths);

    body = `
      <div class="cc-info-row">
        <span>Платіж</span>
        <span>${formatMoney(c.payment)} · ${c.day} число</span>
      </div>
      <div class="cc-info-row">
        <span>Всього місяців</span>
        <span>${totalMonths}</span>
      </div>
      <div class="cc-info-row">
        <span>Сплачено</span>
        <span>${paidMonths} міс.</span>
      </div>
      <div class="cc-info-row">
        <span>Залишилось</span>
        <span>${leftMonths} міс.</span>
      </div>

      <div class="cc-actions">
        <button class="cc-btn cc-btn-primary"
          onclick="window.ccPayFixed('${c.id}')">
          ✅ Погашено ${formatMoney(c.payment)}
        </button>
      </div>

      <div class="cc-custom">
        <input type="number" inputmode="decimal" min="0"
          id="pay_${c.id}" placeholder="Інша сума">
        <button class="cc-btn cc-btn-secondary"
          onclick="window.ccPayCustom('${c.id}')">
          Внести
        </button>
      </div>
    `;
  }

  return `
    <div class="cc-card expanded">
      ${header}
      <div class="cc-body">${body}</div>
    </div>
  `;
}

export default {
  id: "credit",
  title: "Кредити",
  icon: "💳",

  styles: `
    .cc-wrap { padding-bottom: 20px; }

    .cc-form {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 16px;
      display: grid;
      gap: 10px;
    }

    .cc-form input, .cc-form select {
      width: 100%;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-size: 15px;
      font-family: inherit;
    }
    .cc-form input:focus, .cc-form select:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }

    .cc-form .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .cc-form button {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      padding: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: 0.2s;
      font-family: inherit;
    }
    .cc-form button:hover {
      background: linear-gradient(135deg, var(--accent), #4a9eff);
    }
    .cc-form button:active { transform: scale(0.98); }

    .cc-hidden { display: none !important; }

    .cc-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 12px;
      transition: 0.2s;
      overflow: hidden;
    }
    .cc-card.expanded {
      border-color: var(--accent);
    }

    .cc-card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }
    .cc-card-header:hover {
      background: var(--bg-soft);
    }
    .cc-card-header:active {
      background: #1f1f2a;
    }

    .cc-toggle {
      font-size: 20px;
      color: var(--text-muted);
      transition: transform 0.25s;
      width: 16px;
      text-align: center;
      flex-shrink: 0;
    }
    .cc-toggle.open {
      transform: rotate(90deg);
      color: var(--accent-light);
    }

    .cc-bank {
      font-weight: 700;
      font-size: 15px;
      color: var(--text);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cc-type {
      background: rgba(108,92,231,0.15);
      color: var(--accent-light);
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .cc-del {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      width: 30px;
      height: 30px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      transition: 0.2s;
      flex-shrink: 0;
    }
    .cc-del:hover {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }

    .cc-summary {
      display: flex;
      justify-content: space-between;
      padding: 0 16px 14px;
      gap: 12px;
    }
    .cc-summary-lbl {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .cc-summary-val {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
    }
    .cc-summary-val.accent { color: var(--accent-light); }

    .cc-body {
      padding: 14px 16px 16px;
      border-top: 1px dashed var(--border);
    }

    .cc-field { margin-bottom: 10px; }
    .cc-field label {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .cc-field input {
      width: 100%;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: var(--radius-sm);
      padding: 12px;
      font-size: 18px;
      font-weight: 600;
      font-family: inherit;
      text-align: center;
    }
    .cc-field input:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }

    .cc-row, .cc-info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      color: var(--text-muted);
      padding: 6px 0;
    }
    .cc-reduced { color: var(--success); font-weight: 700; font-size: 16px; }
    .cc-remaining { color: var(--accent-light); font-weight: 700; font-size: 16px; }

    .cc-actions { margin-top: 12px; }
    .cc-btn {
      width: 100%;
      border: none;
      border-radius: var(--radius-sm);
      padding: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: 0.2s;
    }
    .cc-btn:active { transform: scale(0.98); }

    .cc-btn-primary { background: var(--success); color: #062014; }
    .cc-btn-primary:hover {
      background: #22c55e;
      box-shadow: 0 4px 14px rgba(74,222,128,0.3);
    }

    .cc-btn-secondary {
      background: var(--accent);
      color: #fff;
      padding: 12px 16px;
      width: auto;
      flex-shrink: 0;
    }
    .cc-btn-secondary:hover {
      background: linear-gradient(135deg, var(--accent), #4a9eff);
    }

    .cc-custom { display: flex; gap: 8px; margin-top: 10px; }
    .cc-custom input {
      flex: 1;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-size: 15px;
      font-family: inherit;
    }
    .cc-custom input:focus { border-color: var(--accent); outline: none; }

    .cc-empty {
      text-align: center;
      color: var(--text-muted);
      padding: 40px 20px;
      font-size: 15px;
    }

    .cc-total {
      margin-top: 20px;
      padding: 16px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      text-align: center;
    }
    .cc-total-item .lbl {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .cc-total-item .val {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
    }
    .cc-total-item .val.green { color: var(--success); }
    .cc-total-item .val.accent { color: var(--accent-light); }
  `,

  template: `
    <div class="cc-wrap">
      <div class="cc-form">
        <select id="cc_bank"></select>
        <select id="cc_type">
          <option value="credit">💰 Кредит</option>
          <option value="installment">📅 Розстрочка</option>
        </select>
        <input type="number" id="cc_sum" placeholder="Сума, ₴" inputmode="decimal" min="0">

        <div id="cc_installment_fields" class="cc-hidden">
          <div class="row">
            <input type="number" id="cc_day" placeholder="День (1-31)" min="1" max="31" inputmode="numeric">
            <input type="number" id="cc_payment" placeholder="Платіж/міс, ₴" inputmode="decimal" min="0">
          </div>
          <input type="number" id="cc_months" placeholder="Кількість місяців" min="1" inputmode="numeric" style="margin-top:10px;">
        </div>

        <button id="cc_add">+ Додати</button>
      </div>

      <div id="cc_list"></div>

      <div class="cc-total">
        <div class="cc-total-item">
          <div class="lbl">Активних</div>
          <div class="val" id="cc_totalCount">0</div>
        </div>
        <div class="cc-total-item">
          <div class="lbl">Сума</div>
          <div class="val" id="cc_totalSum">0 ₴</div>
        </div>
        <div class="cc-total-item">
          <div class="lbl">Залишок</div>
          <div class="val accent" id="cc_totalRemaining">0 ₴</div>
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

    const bankSelect = container.querySelector("#cc_bank");
    BANKS.forEach(b => {
      const o = document.createElement("option");
      o.value = b;
      o.textContent = b;
      bankSelect.appendChild(o);
    });

    const typeSelect = container.querySelector("#cc_type");
    const instFields = container.querySelector("#cc_installment_fields");
    typeSelect.addEventListener("change", () => {
      if (typeSelect.value === "installment") {
        instFields.classList.remove("cc-hidden");
      } else {
        instFields.classList.add("cc-hidden");
      }
    });

    container.querySelector("#cc_add").addEventListener("click", addCredit);

    window.ccSetRemaining = setRemaining;
    window.ccPayFixed = payFixed;
    window.ccPayCustom = payCustom;
    window.ccDelete = deleteCredit;
    window.ccToggle = toggleExpand;

    await load();
    render();
  },

  async getData() {
    return { credits };
  },

  async setData(data) {
    credits = (data && data.credits) || [];
    await save();
    if (containerRef) render();
  },

  async resetData() {
    credits = [];
    await save();
    if (containerRef) render();
  }
};