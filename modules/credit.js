// modules/credit.js
import { storage } from "./_storage.js";

const BANKS = [
  "ПриватБанк", "Ощадбанк", "Укрексімбанк", "Райффайзен Банк",
  "УкрСиббанк", "ОТП Банк", "Sense Bank (Альфа)", "ПУМБ",
  "monobank", "Креді Агріколь Банк", "Кредобанк",
  "А-Банк", "Банк Львів", "ТАСкомбанк", "Ідея Банк",
  "Банк Восток", "ПроКредит Банк", "Мегабанк", "Правекс Банк",
  "Укргазбанк", "Банк Південний", "Глобус Банк", "Інший банк"
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
function formatDate(ts) {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hh}:${mm}`;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

async function save() {
  await storage.set("credit", "data", credits);
}
async function load() {
  const data = await storage.get("credit", "data", []);
  credits = Array.isArray(data) ? data : [];
  credits.forEach(c => {
    if (typeof c.rate !== "number") c.rate = 3.5;
    if (typeof c.minPercent !== "number") c.minPercent = 5;
    if (!Array.isArray(c.history)) c.history = [];
    if (typeof c.body !== "number") c.body = c.sum || 0;
    if (!Array.isArray(c.payments)) c.payments = [];
  });
}

// ==================== КРЕДИТИ (картки) ====================

async function addCredit() {
  const bank = containerRef.querySelector("#bankSelect").value;
  const type = containerRef.querySelector("#typeSelect").value;

  if (type === "installment") {
    // Розстрочка
    const sum = parseFloat(containerRef.querySelector("#bodyInput").value) || 0;
    if (sum <= 0) { alert("Введіть суму"); return; }
    const months = parseInt(containerRef.querySelector("#monthsInput").value) || 12;
    const day = parseInt(containerRef.querySelector("#dayInput").value) || 1;
    const monthly = sum / months;
    const credit = {
      id: uid(), bank, type: "installment", sum, body: sum,
      months, payDay: day, monthly,
      payments: [], isPaid: false, createdAt: Date.now()
    };
    credits.push(credit);
    expandedIds.add(credit.id);
    containerRef.querySelector("#bodyInput").value = "";
    await save();
    render();
    return;
  }

  // Кредит
  const body = parseFloat(containerRef.querySelector("#bodyInput").value) || 0;
  const rate = parseFloat(containerRef.querySelector("#rateInput").value) || 3.5;
  const minPercent = parseFloat(containerRef.querySelector("#minPercentInput").value) || 5;

  if (body <= 0) { alert("Введіть тіло кредиту"); return; }

  const credit = {
    id: uid(), bank, type: "credit",
    body, rate, minPercent,
    history: [], createdAt: Date.now()
  };
  credits.push(credit);
  expandedIds.add(credit.id);
  containerRef.querySelector("#bodyInput").value = "";
  await save();
  render();
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

// Кредит: оновлення тіла
async function updateBody(id, newBody) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  const nb = parseFloat(newBody);
  if (isNaN(nb) || nb < 0) return;

  const oldBody = c.body;
  if (Math.abs(oldBody - nb) < 0.01) return;

  c.history.push({
    id: uid(), date: Date.now(),
    from: oldBody, to: nb,
    paid: Math.max(0, oldBody - nb)
  });
  c.body = nb;
  await save();
  render();
}

async function updateRate(id, val) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  c.rate = parseFloat(val) || 0;
  await save();
  render();
}

async function updateMinPercent(id, val) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  c.minPercent = parseFloat(val) || 0;
  await save();
  render();
}

async function deleteHistory(creditId, historyId) {
  const c = credits.find(x => x.id === creditId);
  if (!c) return;
  c.history = c.history.filter(h => h.id !== historyId);
  await save();
  render();
}

// Розстрочка: оновлення полів
async function updateField(id, field, value) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  if (field === "sum") c.sum = parseFloat(value) || 0;
  else if (field === "months") c.months = parseInt(value) || 1;
  else if (field === "payDay") c.payDay = parseInt(value) || 1;
  else if (field === "monthly") c.monthly = parseFloat(value) || 0;
  await save();
  render();
}

// Розстрочка: погашення
async function payInstallment(id) {
  const c = credits.find(x => x.id === id);
  if (!c || c.type !== "installment") return;

  const payment = c.monthly || (c.sum / c.months);
  c.body = Math.max(0, c.body - payment);
  c.payments.push({ id: uid(), date: Date.now(), amount: payment });
  if (c.body <= 0.01) c.isPaid = true;
  await save();
  render();
}

async function payInstallmentCustom(id) {
  const c = credits.find(x => x.id === id);
  if (!c || c.type !== "installment") return;
  const input = containerRef.querySelector(`#inst_pay_${id}`);
  const v = parseFloat(input.value) || 0;
  if (v <= 0) { alert("Введіть суму"); return; }
  c.body = Math.max(0, c.body - v);
  c.payments.push({ id: uid(), date: Date.now(), amount: v });
  if (c.body <= 0.01) c.isPaid = true;
  await save();
  render();
}

async function deletePayment(creditId, paymentId) {
  const c = credits.find(x => x.id === creditId);
  if (!c) return;
  c.payments = c.payments.filter(p => p.id !== paymentId);
  if (c.body > 0.01) c.isPaid = false;
  await save();
  render();
}

async function togglePaid(id) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  if (c.type === "installment") {
    if (c.isPaid) { c.isPaid = false; c.body = c.sum; c.payments = []; }
    else { c.isPaid = true; c.body = 0; }
    await save();
    render();
  }
}

// ==================== РЕНДЕР ====================

function render() {
  const list = containerRef.querySelector("#creditsList");
  if (credits.length === 0) {
    list.innerHTML = `<div class="empty">Ще немає кредитів. Додайте перший 👆</div>`;
  } else {
    const sorted = [...credits].sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      const remA = a.type === "installment" ? a.body : a.body;
      const remB = b.type === "installment" ? b.body : b.body;
      if (remB !== remA) return remB - remA;
      return b.createdAt - a.createdAt;
    });
    list.innerHTML = sorted.map(c => renderCredit(c)).join("");
  }
  renderSummary();
}

function renderCredit(c) {
  if (c.type === "installment") return renderInstallment(c);
  return renderCardCredit(c);
}

// Кредит (картка)
function renderCardCredit(c) {
  const expanded = expandedIds.has(c.id);
  const interest = c.body * c.rate / 100;
  const minPayment = c.body * c.minPercent / 100;
  const bodyInMin = Math.max(0, minPayment - interest);

  const historyHtml = c.history.length === 0
    ? '<div class="cc-no-history">Немає змін тіла</div>'
    : c.history.slice().sort((a, b) => b.date - a.date).map(h => `
      <div class="cc-history-item">
        <div>
          <div class="cc-hist-paid">+ ${formatMoney(h.paid)}</div>
          <div class="cc-hist-split">Тіло: ${formatMoney(h.from)} → ${formatMoney(h.to)}</div>
          <div class="cc-hist-date">${formatDate(h.date)}</div>
        </div>
        <button class="cc-hist-del" onclick="event.stopPropagation(); window.ccDeleteHistory('${c.id}', '${h.id}')">✕</button>
      </div>
    `).join("");

  return `
    <div class="cc-credit-card ${expanded ? "expanded" : ""}">
      <div class="cc-credit-header" onclick="window.ccToggle('${c.id}')">
        <div class="cc-header-left">
          <div class="cc-toggle-icon">›</div>
          <h3>
            <span class="cc-bank-badge">${escapeHtml(c.bank)}</span>
            <span class="cc-type-badge cc-type-credit">Кредит</span>
          </h3>
        </div>
        <div class="cc-header-right">
          <div class="cc-header-summary">
            <div class="cc-label">Тіло</div>
            <div class="cc-remaining-val">${formatMoney(c.body)}</div>
          </div>
          <button class="cc-btn-delete" onclick="event.stopPropagation(); window.ccDelete('${c.id}')">✕</button>
        </div>
      </div>

      <div class="cc-credit-body">
        <div class="cc-section-title">📋 Параметри</div>
        <div class="cc-fields">
          <div class="cc-field">
            <label>Тіло кредиту</label>
            <input type="number" value="${c.body}" min="0" inputmode="decimal"
              onchange="window.ccUpdateBody('${c.id}', this.value)">
          </div>
          <div class="cc-field">
            <label>Ставка, % / міс</label>
            <input type="number" value="${c.rate}" min="0" step="0.1" inputmode="decimal"
              onchange="window.ccUpdateRate('${c.id}', this.value)">
          </div>
          <div class="cc-field">
            <label>Мін. платіж, %</label>
            <input type="number" value="${c.minPercent}" min="0" step="0.1" inputmode="decimal"
              onchange="window.ccUpdateMinPercent('${c.id}', this.value)">
          </div>
        </div>

        <div class="cc-section-title green">📊 Розрахунок</div>
        <div class="cc-calc">
          <div class="cc-calc-row"><span>Нараховані відсотки:</span><b class="cc-orange">${formatMoney(interest)}</b></div>
          <div class="cc-calc-row"><span>Мін. платіж:</span><b class="cc-green">${formatMoney(minPayment)}</b></div>
          <div class="cc-calc-row"><span>Тіло в мін. платежі:</span><b>${formatMoney(bodyInMin)}</b></div>
        </div>

        <div class="cc-section-title">📜 Історія змін тіла (${c.history.length})</div>
        <div class="cc-history-list">${historyHtml}</div>
      </div>
    </div>
  `;
}

// Розстрочка
function renderInstallment(c) {
  const expanded = expandedIds.has(c.id);
  const totalPaid = (c.payments || []).reduce((s, p) => s + p.amount, 0);
  const monthly = c.monthly || (c.sum / c.months);
  const monthsPaid = monthly > 0 ? Math.floor(totalPaid / monthly) : 0;
  const monthsLeft = Math.max(0, c.months - monthsPaid);

  const paymentsHtml = (c.payments || []).length === 0
    ? '<div class="cc-no-payments">Немає платежів</div>'
    : c.payments.slice().sort((a, b) => b.date - a.date).map(p => `
      <div class="cc-payment-item">
        <div>
          <div class="cc-pay-amount">+ ${formatMoney(p.amount)}</div>
          <div class="cc-pay-date">${formatDate(p.date)}</div>
        </div>
        <button class="cc-pay-del" onclick="event.stopPropagation(); window.ccDeletePayment('${c.id}', '${p.id}')">✕</button>
      </div>
    `).join("");

  return `
    <div class="cc-credit-card ${c.isPaid ? "paid" : ""} ${expanded ? "expanded" : ""}">
      <div class="cc-credit-header" onclick="window.ccToggle('${c.id}')">
        <div class="cc-header-left">
          <div class="cc-toggle-icon">›</div>
          <h3>
            <span class="cc-bank-badge">${escapeHtml(c.bank)}</span>
            <span class="cc-type-badge cc-type-installment">Розстрочка</span>
            ${c.isPaid ? '<span class="cc-paid-badge">✅</span>' : ""}
          </h3>
        </div>
        <div class="cc-header-right">
          <div class="cc-header-summary">
            <div class="cc-label">Залишок</div>
            <div class="cc-remaining-val">${formatMoney(c.body)}</div>
          </div>
          <button class="cc-btn-delete" onclick="event.stopPropagation(); window.ccDelete('${c.id}')">✕</button>
        </div>
      </div>

      <div class="cc-credit-body">
        <div class="cc-section-title">📋 Параметри</div>
        <div class="cc-fields">
          <div class="cc-field">
            <label>Сума</label>
            <input type="number" value="${c.sum}" min="0" inputmode="decimal"
              onchange="window.ccUpdateField('${c.id}', 'sum', this.value)">
          </div>
          <div class="cc-field">
            <label>Місяців</label>
            <input type="number" value="${c.months}" min="1" inputmode="numeric"
              onchange="window.ccUpdateField('${c.id}', 'months', this.value)">
          </div>
          <div class="cc-field">
            <label>День</label>
            <input type="number" value="${c.payDay}" min="1" max="31" inputmode="numeric"
              onchange="window.ccUpdateField('${c.id}', 'payDay', this.value)">
          </div>
          <div class="cc-field">
            <label>Платіж/міс</label>
            <input type="number" value="${monthly.toFixed(2)}" min="0" inputmode="decimal"
              onchange="window.ccUpdateField('${c.id}', 'monthly', this.value)">
          </div>
        </div>

        <div class="cc-installment">
          <div class="cc-inst-grid">
            <div class="cc-inst-stat"><div class="val">${monthsPaid} / ${c.months}</div><div class="lbl">Сплачено</div></div>
            <div class="cc-inst-stat"><div class="val">${monthsLeft}</div><div class="lbl">Залишилось</div></div>
            <div class="cc-inst-stat"><div class="val">${formatMoney(totalPaid)}</div><div class="lbl">Сплачено, ₴</div></div>
            <div class="cc-inst-stat"><div class="val">${c.payDay} чис.</div><div class="lbl">Списання</div></div>
          </div>
        </div>

        <div class="cc-section-title green">💵 Внести платіж</div>
        <div class="cc-payment-form">
          <div class="cc-credit-actions">
            <button class="cc-btn-pay" onclick="window.ccPayInstallment('${c.id}')">✅ Погашено ${formatMoney(monthly)}</button>
          </div>
          <div class="cc-custom">
            <input type="number" id="inst_pay_${c.id}" placeholder="Інша сума" inputmode="decimal" min="0">
            <button class="cc-btn-pay cc-btn-secondary" onclick="window.ccPayInstallmentCustom('${c.id}')">Внести</button>
          </div>
        </div>

        <div class="cc-section-title">📜 Історія платежів (${(c.payments || []).length})</div>
        <div class="cc-payments-list">${paymentsHtml}</div>
      </div>
    </div>
  `;
}

function renderSummary() {
  const active = credits.filter(c => !c.isPaid);
  const totalBody = active.reduce((s, c) => s + (c.body || 0), 0);
  const totalInterest = active.filter(c => c.type === "credit").reduce((s, c) => s + c.body * c.rate / 100, 0);
  const totalMinPayment = active.filter(c => c.type === "credit").reduce((s, c) => s + c.body * c.minPercent / 100, 0);

  containerRef.querySelector("#totalCount").textContent = active.length;
  containerRef.querySelector("#totalBody").textContent = formatMoney(totalBody);
  containerRef.querySelector("#totalInterest").textContent = formatMoney(totalInterest);
  containerRef.querySelector("#totalMinPayment").textContent = formatMoney(totalMinPayment);
}

// ==================== МОДУЛЬ ====================

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
      padding: 14px;
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
      padding: 11px 12px;
      font-size: 15px;
      font-family: inherit;
    }
    .cc-form input:focus, .cc-form select:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }
    .cc-form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
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
    .cc-form button:hover { background: linear-gradient(135deg, var(--accent), #4a9eff); }
    .cc-form button:active { transform: scale(0.98); }
    .cc-hidden { display: none !important; }

    .cc-empty { text-align: center; color: var(--text-muted); padding: 40px 20px; font-size: 15px; }

    .cc-credit-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 12px;
      overflow: hidden;
      transition: 0.2s;
    }
    .cc-credit-card.paid { border-color: var(--success); opacity: 0.85; }
    .cc-credit-card.expanded { border-color: var(--accent); }
    .cc-credit-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px;
      cursor: pointer;
      user-select: none;
      gap: 10px;
      transition: background 0.15s;
    }
    .cc-credit-header:hover { background: var(--bg-soft); }
    .cc-header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; flex-wrap: wrap; }
    .cc-toggle-icon {
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; background: var(--accent); color: #fff;
      font-size: 14px; font-weight: 700;
      transition: transform 0.3s; flex-shrink: 0;
    }
    .cc-credit-card.expanded .cc-toggle-icon { transform: rotate(90deg); }
    .cc-credit-header h3 {
      font-size: 14px; color: var(--text);
      display: flex; align-items: center; gap: 6px;
      flex-wrap: wrap; min-width: 0;
    }
    .cc-bank-badge {
      background: var(--accent); color: #fff;
      padding: 3px 9px; border-radius: 20px;
      font-size: 10px; font-weight: 600;
      text-transform: uppercase; white-space: nowrap;
    }
    .cc-type-badge {
      padding: 3px 9px; border-radius: 20px;
      font-size: 9px; font-weight: 700;
      text-transform: uppercase; white-space: nowrap;
    }
    .cc-type-credit { background: #ed8936; color: #fff; }
    .cc-type-installment { background: #9f7aea; color: #fff; }
    .cc-paid-badge {
      background: var(--success); color: #062014;
      padding: 3px 9px; border-radius: 20px;
      font-size: 10px; font-weight: 600;
    }
    .cc-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .cc-header-summary { text-align: right; font-size: 12px; }
    .cc-remaining-val {
      font-weight: 700; color: var(--danger);
      font-size: 14px; white-space: nowrap;
    }
    .cc-credit-card.paid .cc-remaining-val { color: var(--success); }
    .cc-label { color: var(--text-muted); font-size: 10px; }
    .cc-btn-delete {
      background: rgba(239,68,68,0.1); color: var(--danger);
      padding: 8px 10px; border-radius: 8px; border: none;
      cursor: pointer; font-size: 14px; font-weight: 700;
      min-width: 34px; min-height: 34px; font-family: inherit;
    }
    .cc-btn-delete:active { background: var(--danger); color: #fff; }
    .cc-credit-body {
      max-height: 0; overflow: hidden;
      transition: max-height 0.5s ease, padding 0.3s;
      padding: 0 14px;
    }
    .cc-credit-card.expanded .cc-credit-body {
      max-height: 6000px; padding: 14px;
      border-top: 1px dashed var(--border);
    }
    .cc-fields {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 10px; margin-bottom: 12px;
    }
    .cc-field label {
      display: block; font-size: 11px; color: var(--text-muted);
      margin-bottom: 4px; font-weight: 600;
    }
    .cc-field input {
      width: 100%; padding: 10px 12px;
      background: var(--bg-soft); border: 1px solid var(--border);
      color: var(--text); border-radius: 8px;
      font-size: 15px; outline: none; font-family: inherit;
    }
    .cc-field input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }
    .cc-section-title {
      font-size: 12px; color: var(--accent-light); font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.5px;
      margin: 14px 0 8px; padding-bottom: 6px;
      border-bottom: 2px solid var(--border);
    }
    .cc-section-title.green {
      color: var(--success);
      border-bottom-color: rgba(74,222,128,0.3);
    }
    .cc-calc {
      background: var(--bg-soft); border-radius: 10px;
      padding: 12px; margin-bottom: 12px;
    }
    .cc-calc-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0; font-size: 14px; color: var(--text-muted);
    }
    .cc-calc-row b { font-size: 15px; }
    .cc-orange { color: var(--warning); }
    .cc-green { color: var(--success); }

    .cc-history-list {
      background: var(--bg-soft); border-radius: 10px;
      padding: 8px; max-height: 300px; overflow-y: auto;
    }
    .cc-history-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px; background: var(--card); border-radius: 8px;
      margin-bottom: 6px; font-size: 13px;
      border-left: 3px solid var(--success); gap: 8px;
    }
    .cc-history-item:last-child { margin-bottom: 0; }
    .cc-hist-paid { font-weight: 700; color: var(--success); font-size: 14px; }
    .cc-hist-split { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
    .cc-hist-date { color: var(--text-dim); font-size: 11px; margin-top: 3px; }
    .cc-hist-del {
      background: rgba(239,68,68,0.1); border: none; color: var(--danger);
      cursor: pointer; font-size: 14px; padding: 6px 10px;
      border-radius: 6px; font-weight: 700; min-width: 34px; min-height: 34px;
      font-family: inherit;
    }
    .cc-hist-del:active { background: var(--danger); color: #fff; }
    .cc-no-history { text-align: center; color: var(--text-dim); font-size: 12px; padding: 15px; }

    .cc-payment-form {
      background: rgba(74,222,128,0.05);
      border: 1px solid rgba(74,222,128,0.3);
      border-radius: 12px; padding: 12px; margin-bottom: 12px;
    }
    .cc-credit-actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
    .cc-btn-pay {
      background: linear-gradient(135deg, #48bb78, #38a169);
      color: #fff; padding: 13px 16px; border: none;
      border-radius: 8px; cursor: pointer;
      font-weight: 700; font-size: 15px; font-family: inherit;
    }
    .cc-btn-pay:active { transform: scale(0.98); }
    .cc-btn-secondary { background: linear-gradient(135deg, #4299e1, #3182ce); font-size: 14px; }
    .cc-custom { display: flex; gap: 8px; }
    .cc-custom input {
      flex: 1; background: var(--bg-soft); border: 1px solid var(--border);
      color: var(--text); border-radius: 8px; padding: 10px 12px;
      font-family: inherit; font-size: 15px;
    }
    .cc-custom input:focus { border-color: var(--accent); outline: none; }

    .cc-payments-list {
      background: var(--bg-soft); border-radius: 10px;
      padding: 8px; max-height: 300px; overflow-y: auto;
    }
    .cc-payment-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px; background: var(--card); border-radius: 8px;
      margin-bottom: 6px; font-size: 13px;
      border-left: 3px solid var(--success); gap: 8px;
    }
    .cc-payment-item:last-child { margin-bottom: 0; }
    .cc-pay-amount { font-weight: 700; color: var(--success); font-size: 14px; }
    .cc-pay-date { color: var(--text-dim); font-size: 11px; margin-top: 3px; }
    .cc-pay-del {
      background: rgba(239,68,68,0.1); border: none; color: var(--danger);
      cursor: pointer; font-size: 14px; padding: 6px 10px;
      border-radius: 6px; font-weight: 700; min-width: 34px; min-height: 34px;
      font-family: inherit;
    }
    .cc-pay-del:active { background: var(--danger); color: #fff; }
    .cc-no-payments { text-align: center; color: var(--text-dim); font-size: 12px; padding: 15px; }

    .cc-installment {
      background: rgba(159,122,234,0.08);
      border: 1px dashed #9f7aea;
      border-radius: 10px; padding: 12px; margin-top: 8px;
    }
    .cc-inst-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .cc-inst-stat {
      text-align: center; padding: 10px 6px;
      background: var(--card); border-radius: 8px;
      border: 1px solid rgba(159,122,234,0.3);
    }
    .cc-inst-stat .val { font-size: 15px; font-weight: 700; color: #b794f4; }
    .cc-inst-stat .lbl { font-size: 10px; color: var(--text-muted); text-transform: uppercase; margin-top: 3px; }

    .cc-summary {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px 14px;
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px;
    }
    .cc-summary-item { text-align: center; }
    .cc-summary-item .label {
      font-size: 10px; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;
    }
    .cc-summary-item .value {
      font-size: 16px; font-weight: 700; color: var(--text); word-break: break-word;
    }
    .cc-summary-item .value.green { color: var(--success); }
    .cc-summary-item .value.red { color: var(--danger); }
    .cc-summary-item .value.orange { color: var(--warning); }

    @media (min-width: 768px) {
      .cc-fields { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
      .cc-credit-actions { flex-direction: row; flex-wrap: wrap; align-items: center; }
      .cc-btn-pay { width: auto; }
      .cc-inst-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
      .cc-inst-stat .val { font-size: 18px; }
      .cc-summary { grid-template-columns: repeat(4, 1fr); }
      .cc-summary-item .value { font-size: 18px; }
    }
  `,

  template: `
    <div class="cc-wrap">
      <div class="cc-form">
        <select id="bankSelect"></select>
        <div class="cc-form-row">
          <select id="typeSelect">
            <option value="credit">💰 Кредит</option>
            <option value="installment">📅 Розстрочка</option>
          </select>
          <input type="number" id="bodyInput" placeholder="Тіло/Сума, ₴" inputmode="decimal" min="0">
          <input type="number" id="rateInput" placeholder="Ставка, %" step="0.1" value="3.5" inputmode="decimal">
        </div>
        <div class="cc-form-row">
          <input type="number" id="minPercentInput" placeholder="Мін. %" step="0.1" value="5" inputmode="decimal">
          <input type="number" id="monthsInput" placeholder="Місяців" value="12" inputmode="numeric" class="cc-hidden">
          <input type="number" id="dayInput" placeholder="День" value="1" inputmode="numeric" class="cc-hidden">
        </div>
        <button id="addBtn">+ Додати</button>
      </div>

      <div id="creditsList"></div>

      <div class="cc-summary">
        <div class="cc-summary-item">
          <div class="label">Активних</div>
          <div class="value" id="totalCount">0</div>
        </div>
        <div class="cc-summary-item">
          <div class="label">Загальне тіло</div>
          <div class="value red" id="totalBody">0 ₴</div>
        </div>
        <div class="cc-summary-item">
          <div class="label">Відсотки за міс</div>
          <div class="value orange" id="totalInterest">0 ₴</div>
        </div>
        <div class="cc-summary-item">
          <div class="label">Мін. платежі</div>
          <div class="value green" id="totalMinPayment">0 ₴</div>
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

    const bankSelect = container.querySelector("#bankSelect");
    BANKS.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      bankSelect.appendChild(opt);
    });

    const typeSelect = container.querySelector("#typeSelect");
    const monthsInput = container.querySelector("#monthsInput");
    const dayInput = container.querySelector("#dayInput");
    const rateInput = container.querySelector("#rateInput");
    const minPercentInput = container.querySelector("#minPercentInput");

    typeSelect.addEventListener("change", () => {
      if (typeSelect.value === "installment") {
        monthsInput.classList.remove("cc-hidden");
        dayInput.classList.remove("cc-hidden");
        rateInput.classList.add("cc-hidden");
        minPercentInput.classList.add("cc-hidden");
      } else {
        monthsInput.classList.add("cc-hidden");
        dayInput.classList.add("cc-hidden");
        rateInput.classList.remove("cc-hidden");
        minPercentInput.classList.remove("cc-hidden");
      }
    });

    container.querySelector("#addBtn").addEventListener("click", addCredit);

    window.ccDelete = deleteCredit;
    window.ccToggle = toggleExpand;
    window.ccUpdateBody = updateBody;
    window.ccUpdateRate = updateRate;
    window.ccUpdateMinPercent = updateMinPercent;
    window.ccDeleteHistory = deleteHistory;
    window.ccUpdateField = updateField;
    window.ccPayInstallment = payInstallment;
    window.ccPayInstallmentCustom = payInstallmentCustom;
    window.ccDeletePayment = deletePayment;
    window.ccTogglePaid = togglePaid;

    await load();
    render();
  },

  async getData() { return { credits }; },
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
