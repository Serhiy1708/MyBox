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
    c.payments = (c.payments || []).map(p => {
      if (typeof p.body !== "number") p.body = p.amount || 0;
      if (typeof p.interest !== "number") p.interest = 0;
      if (typeof p.amount !== "number") p.amount = p.body + p.interest;
      return p;
    });
  });
}

function getTotalPaidAll(c) {
  return c.payments.reduce((s, p) => s + (p.amount || 0), 0);
}
function getTotalPaidBody(c) {
  return c.payments.reduce((s, p) => s + (p.body || 0), 0);
}
function getTotalPaidInterest(c) {
  return c.payments.reduce((s, p) => s + (p.interest || 0), 0);
}
function getRemaining(c) {
  return Math.max(0, c.sum - getTotalPaidBody(c));
}

async function addCredit() {
  const bank = containerRef.querySelector("#bankSelect").value;
  const type = containerRef.querySelector("#typeSelect").value;
  const sum = parseFloat(containerRef.querySelector("#initialSum").value) || 0;

  if (sum <= 0) { alert("Введіть суму"); return; }

  const credit = {
    id: uid(),
    bank,
    type,
    sum,
    months: 12,
    payDay: 1,
    payments: [],
    isPaid: false,
    createdAt: Date.now()
  };

  credits.push(credit);
  expandedIds.add(credit.id);
  containerRef.querySelector("#initialSum").value = "";
  await save();
  render();
}

async function deleteCredit(id) {
  if (!confirm("Видалити цей кредит?")) return;
  credits = credits.filter(c => c.id !== id);
  expandedIds.delete(id);
  await save();
  render();
}

async function updateCreditField(id, field, value) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  if (field === "sum") c.sum = parseFloat(value) || 0;
  else if (field === "months") c.months = parseInt(value) || 1;
  else if (field === "payDay") c.payDay = parseInt(value) || 1;
  await save();
  render();
}

async function updateRemainingManually(id, newRemaining) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  const remaining = parseFloat(newRemaining);
  if (isNaN(remaining) || remaining < 0) return;

  const newBodyPaid = Math.max(0, c.sum - remaining);
  const existingInterest = getTotalPaidInterest(c);

  if (newBodyPaid === 0 && existingInterest === 0) {
    c.payments = [];
  } else {
    c.payments = [{
      id: uid(),
      amount: newBodyPaid + existingInterest,
      body: newBodyPaid,
      interest: existingInterest,
      date: Date.now(),
      note: "Коригування залишку"
    }];
  }
  c.isPaid = remaining <= 0.01;
  await save();
  render();
}

async function toggleExpand(id) {
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
  render();
}

async function addPayment(id) {
  const c = credits.find(x => x.id === id);
  if (!c) return;

  const payInput = containerRef.querySelector("#pay_" + id);
  const bodyInput = containerRef.querySelector("#body_" + id);
  const interestInput = containerRef.querySelector("#interest_" + id);

  const total = parseFloat(payInput.value) || 0;
  const body = parseFloat(bodyInput.value) || 0;
  const interest = parseFloat(interestInput.value) || 0;

  if (total <= 0) { alert("Введіть суму платежу"); return; }

  const sumCheck = body + interest;
  if (Math.abs(sumCheck - total) > 0.01) {
    const adjustedInterest = total - body;
    if (adjustedInterest < 0) { alert("Тіло більше за загальну суму"); return; }
    c.payments.push({ id: uid(), amount: total, body, interest: adjustedInterest, date: Date.now() });
  } else {
    c.payments.push({ id: uid(), amount: total, body, interest, date: Date.now() });
  }

  const newRemaining = getRemaining(c);
  if (newRemaining <= 0.01) c.isPaid = true;

  await save();
  render();
}

async function deletePayment(creditId, paymentId) {
  const c = credits.find(x => x.id === creditId);
  if (!c) return;
  c.payments = c.payments.filter(p => p.id !== paymentId);
  if (getRemaining(c) > 0.01) c.isPaid = false;
  await save();
  render();
}

async function togglePaid(id) {
  const c = credits.find(x => x.id === id);
  if (!c) return;
  if (c.isPaid) {
    c.isPaid = false;
    c.payments = [];
  } else {
    const remaining = getRemaining(c);
    if (remaining > 0) {
      c.payments.push({
        id: uid(), amount: remaining, body: remaining, interest: 0,
        date: Date.now(), note: "Позначено погашеним"
      });
    }
    c.isPaid = true;
  }
  await save();
  render();
}

function onTotalInput(id) {
  const totalInput = containerRef.querySelector("#pay_" + id);
  const bodyInput = containerRef.querySelector("#body_" + id);
  const total = parseFloat(totalInput.value) || 0;
  const c = credits.find(x => x.id === id);
  if (!c) return;
  const remaining = getRemaining(c);
  if (!bodyInput.value || parseFloat(bodyInput.value) === 0) {
    bodyInput.value = Math.min(total, remaining).toFixed(2);
  }
  recalcSplit(id);
}

function recalcSplit(id) {
  const totalInput = containerRef.querySelector("#pay_" + id);
  const bodyInput = containerRef.querySelector("#body_" + id);
  const interestInput = containerRef.querySelector("#interest_" + id);
  const preview = containerRef.querySelector("#preview_" + id);
  if (!totalInput || !bodyInput || !interestInput) return;

  const total = parseFloat(totalInput.value) || 0;
  const body = parseFloat(bodyInput.value) || 0;
  const interest = Math.max(0, total - body);

  interestInput.value = interest.toFixed(2);
  if (preview) {
    preview.querySelector(".val").textContent = formatMoney(total);
  }
}

function render() {
  const list = containerRef.querySelector("#creditsList");
  if (credits.length === 0) {
    list.innerHTML = `<div class="empty">Ще немає кредитів. Додайте перший 👆</div>`;
  } else {
    const sorted = [...credits].sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
    list.innerHTML = sorted.map(c => renderCredit(c)).join("");
  }
  renderSummary();
}

function renderCredit(c) {
  const totalPaidAll = getTotalPaidAll(c);
  const totalPaidBody = getTotalPaidBody(c);
  const totalPaidInterest = getTotalPaidInterest(c);
  const remaining = getRemaining(c);
  const progress = c.sum > 0 ? Math.min(100, (totalPaidBody / c.sum) * 100) : 0;
  const expanded = expandedIds.has(c.id);

  let installmentBlock = "";
  if (c.type === "installment") {
    const monthly = c.months > 0 ? c.sum / c.months : 0;
    const monthsPaid = monthly > 0 ? Math.floor(totalPaidBody / monthly) : 0;
    const monthsLeft = Math.max(0, c.months - monthsPaid);

    installmentBlock = `
      <div class="cc-section-title">📅 Параметри розстрочки</div>
      <div class="cc-fields">
        <div class="cc-field">
          <label>Кількість місяців</label>
          <input type="number" value="${c.months}" min="1" inputmode="numeric"
            onchange="window.ccUpdateField('${c.id}', 'months', this.value)">
        </div>
        <div class="cc-field">
          <label>День списання</label>
          <input type="number" value="${c.payDay}" min="1" max="31" inputmode="numeric"
            onchange="window.ccUpdateField('${c.id}', 'payDay', this.value)">
        </div>
      </div>
      <div class="cc-installment">
        <div class="cc-inst-grid">
          <div class="cc-inst-stat">
            <div class="val">${formatMoney(monthly)}</div>
            <div class="lbl">Платіж/міс</div>
          </div>
          <div class="cc-inst-stat">
            <div class="val">${monthsPaid} / ${c.months}</div>
            <div class="lbl">Сплачено міс.</div>
          </div>
          <div class="cc-inst-stat">
            <div class="val">${monthsLeft}</div>
            <div class="lbl">Залишилось міс.</div>
          </div>
          <div class="cc-inst-stat">
            <div class="val">${c.payDay} чис.</div>
            <div class="lbl">Списання</div>
          </div>
        </div>
      </div>
    `;
  }

  const paymentsHtml = c.payments.length === 0
    ? '<div class="cc-no-payments">Немає платежів</div>'
    : c.payments
        .slice()
        .sort((a, b) => b.date - a.date)
        .map(p => `
          <div class="cc-payment-item">
            <div>
              <div class="cc-pay-amount">+ ${formatMoney(p.amount)}</div>
              <div class="cc-pay-split">
                Тіло: <span class="body">${formatMoney(p.body || 0)}</span>
                • Відсотки: <span class="interest">${formatMoney(p.interest || 0)}</span>
              </div>
              <div class="cc-pay-date">
                ${formatDate(p.date)}
                ${p.note ? " • " + escapeHtml(p.note) : ""}
              </div>
            </div>
            <button class="cc-pay-del"
              onclick="event.stopPropagation(); window.ccDeletePayment('${c.id}', '${p.id}')">✕</button>
          </div>
        `).join("");

  return `
    <div class="cc-credit-card ${c.isPaid ? "paid" : ""} ${expanded ? "expanded" : ""}">
      <div class="cc-credit-header" onclick="window.ccToggle('${c.id}')">
        <div class="cc-header-left">
          <div class="cc-toggle-icon">›</div>
          <h3>
            <span class="cc-bank-badge">${escapeHtml(c.bank)}</span>
            <span class="cc-type-badge ${c.type === "installment" ? "cc-type-installment" : "cc-type-credit"}">
              ${c.type === "installment" ? "Розстрочка" : "Кредит"}
            </span>
            ${c.isPaid ? '<span class="cc-paid-badge">✅</span>' : ""}
          </h3>
        </div>
        <div class="cc-header-right">
          <div class="cc-header-summary">
            <div class="cc-label">Залишок</div>
            <div class="cc-remaining-val">${formatMoney(remaining)}</div>
          </div>
          <button class="cc-btn-delete"
            onclick="event.stopPropagation(); window.ccDelete('${c.id}')">✕</button>
        </div>
      </div>

      <div class="cc-credit-body">
        <div class="cc-section-title">📋 Основна інформація</div>
        <div class="cc-fields">
          <div class="cc-field">
            <label>Сума кредиту (тіло)</label>
            <input type="number" value="${c.sum}" min="0" inputmode="decimal"
              onchange="window.ccUpdateField('${c.id}', 'sum', this.value)">
          </div>
          <div class="cc-field">
            <label>Залишок тіла <span class="hint">(можна редагувати)</span></label>
            <input type="number" value="${remaining.toFixed(2)}" min="0" inputmode="decimal"
              class="editable"
              onchange="window.ccUpdateRemaining('${c.id}', this.value)">
          </div>
          <div class="cc-field">
            <label>Сплачено тіла</label>
            <input type="number" value="${totalPaidBody.toFixed(2)}" readonly class="readonly-green">
          </div>
          <div class="cc-field">
            <label>Сплачено відсотків</label>
            <input type="number" value="${totalPaidInterest.toFixed(2)}" readonly class="readonly-orange">
          </div>
          <div class="cc-field">
            <label>Всього внесено</label>
            <input type="number" value="${totalPaidAll.toFixed(2)}" readonly>
          </div>
          <div class="cc-field">
            <label>Залишилось внести</label>
            <input type="number" value="${remaining.toFixed(2)}" readonly>
          </div>
        </div>

        <div class="cc-progress-bar">
          <div class="cc-progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="cc-progress-info">
          <span>Тіло: ${formatMoney(totalPaidBody)} / ${formatMoney(c.sum)}</span>
          <span>${progress.toFixed(1)}%</span>
        </div>

        ${installmentBlock}

        <div class="cc-section-title green">💵 Внести платіж</div>
        <div class="cc-payment-form">
          <div class="cc-payment-form-title">📱 Введи дані з застосунку банку</div>
          <div class="cc-payment-fields">
            <div class="cc-payment-field">
              <label>Загальна сума платежу *</label>
              <input type="number" id="pay_${c.id}" placeholder="Напр. 2500"
                inputmode="decimal" min="0"
                oninput="window.ccOnTotalInput('${c.id}')">
            </div>
            <div class="cc-payment-field">
              <label>З них на тіло кредиту</label>
              <input type="number" id="body_${c.id}" placeholder="Напр. 1800"
                inputmode="decimal" min="0"
                oninput="window.ccRecalcSplit('${c.id}')">
            </div>
            <div class="cc-payment-field">
              <label>З них на відсотки</label>
              <input type="number" id="interest_${c.id}" placeholder="Рахується авто"
                readonly class="readonly-orange">
            </div>
          </div>

          <div class="cc-payment-hint">
            💡 <strong>Як читати виписку банку:</strong><br>
            • «Сума платежу» = загальна сума<br>
            • «Тіло кредиту» = основна частина<br>
            • «Відсотки» = плата за користування (рахуються автоматично як різниця)
          </div>

          <div class="cc-payment-preview" id="preview_${c.id}">
            <span>Буде внесено:</span>
            <span class="val">0 ₴</span>
          </div>

          <div class="cc-credit-actions">
            <button class="cc-btn-pay" onclick="window.ccAddPayment('${c.id}')">💵 Внести платіж</button>
            <button class="cc-btn-pay cc-btn-secondary" onclick="window.ccTogglePaid('${c.id}')">
              ${c.isPaid ? "↩️ Зняти статус" : "✅ Позначити погашеним"}
            </button>
          </div>
        </div>

        <div class="cc-section-title">📜 Історія платежів (${c.payments.length})</div>
        <div class="cc-payments-list">${paymentsHtml}</div>
      </div>
    </div>
  `;
}

function renderSummary() {
  const active = credits.filter(c => !c.isPaid);
  const totalSum = credits.reduce((s, c) => s + c.sum, 0);
  const totalPaidBody = credits.reduce((s, c) => s + getTotalPaidBody(c), 0);
  const totalPaidInterest = credits.reduce((s, c) => s + getTotalPaidInterest(c), 0);
  const totalRemaining = Math.max(0, totalSum - totalPaidBody);

  containerRef.querySelector("#totalCount").textContent = active.length;
  containerRef.querySelector("#totalSum").textContent = formatMoney(totalSum);
  containerRef.querySelector("#totalPaid").textContent = formatMoney(totalPaidBody);
  containerRef.querySelector("#totalRemaining").textContent = formatMoney(totalRemaining);
  containerRef.querySelector("#totalInterest").textContent = formatMoney(totalPaidInterest);
}

export default {
  id: "credit",
  title: "Кредити",
  icon: "💳",

  styles: `
    .cc-wrap { padding-bottom: 20px; }

    /* Форма додавання */
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
    .cc-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
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

    .cc-empty {
      text-align: center;
      color: var(--text-muted);
      padding: 40px 20px;
      font-size: 15px;
    }

    /* Картка */
    .cc-credit-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 12px;
      overflow: hidden;
      transition: 0.2s;
    }
    .cc-credit-card.paid {
      border-color: var(--success);
      opacity: 0.85;
    }
    .cc-credit-card.expanded {
      border-color: var(--accent);
    }

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

    .cc-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
      flex-wrap: wrap;
    }
    .cc-toggle-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      transition: transform 0.3s;
      flex-shrink: 0;
    }
    .cc-credit-card.expanded .cc-toggle-icon {
      transform: rotate(90deg);
    }

    .cc-credit-header h3 {
      font-size: 14px;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .cc-bank-badge {
      background: var(--accent);
      color: #fff;
      padding: 3px 9px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .cc-type-badge {
      padding: 3px 9px;
      border-radius: 20px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .cc-type-credit { background: #ed8936; color: #fff; }
    .cc-type-installment { background: #9f7aea; color: #fff; }
    .cc-paid-badge {
      background: var(--success);
      color: #062014;
      padding: 3px 9px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 600;
    }

    .cc-header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .cc-header-summary { text-align: right; font-size: 12px; }
    .cc-remaining-val {
      font-weight: 700;
      color: var(--danger);
      font-size: 14px;
      white-space: nowrap;
    }
    .cc-credit-card.paid .cc-remaining-val { color: var(--success); }
    .cc-label { color: var(--text-muted); font-size: 10px; }

    .cc-btn-delete {
      background: rgba(239,68,68,0.1);
      color: var(--danger);
      padding: 8px 10px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      min-width: 34px;
      min-height: 34px;
      font-family: inherit;
    }
    .cc-btn-delete:active {
      background: var(--danger);
      color: #fff;
    }

    /* Тіло картки */
    .cc-credit-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.5s ease, padding 0.3s;
      padding: 0 14px;
    }
    .cc-credit-card.expanded .cc-credit-body {
      max-height: 6000px;
      padding: 14px;
      border-top: 1px dashed var(--border);
    }

    .cc-fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .cc-field label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 4px;
      font-weight: 600;
    }
    .cc-field label .hint {
      color: var(--accent-light);
      font-size: 9px;
      font-weight: 400;
      text-transform: none;
    }
    .cc-field input {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 8px;
      font-size: 15px;
      outline: none;
      font-family: inherit;
    }
    .cc-field input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }
    .cc-field input.editable {
      background: #2a2410;
      border-color: #f6e05e;
    }
    .cc-field input.readonly-green {
      background: rgba(74,222,128,0.1);
      color: var(--success);
      font-weight: 700;
    }
    .cc-field input.readonly-orange {
      background: rgba(245,158,11,0.1);
      color: var(--warning);
      font-weight: 700;
    }

    .cc-section-title {
      font-size: 12px;
      color: var(--accent-light);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 14px 0 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid var(--border);
    }
    .cc-section-title.green {
      color: var(--success);
      border-bottom-color: rgba(74,222,128,0.3);
    }

    /* Прогрес */
    .cc-progress-bar {
      height: 10px;
      background: var(--bg-soft);
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .cc-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--success), #22c55e);
      transition: width 0.4s ease;
    }
    .cc-progress-info {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 14px;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Форма платежу */
    .cc-payment-form {
      background: rgba(74,222,128,0.05);
      border: 1px solid rgba(74,222,128,0.3);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .cc-payment-form-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--success);
      margin-bottom: 10px;
    }
    .cc-payment-fields {
      display: grid;
      gap: 10px;
      margin-bottom: 10px;
    }
    .cc-payment-field label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 4px;
      font-weight: 600;
    }
    .cc-payment-field input {
      width: 100%;
      padding: 11px 12px;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 8px;
      font-size: 15px;
      outline: none;
      font-family: inherit;
    }
    .cc-payment-field input:focus {
      border-color: var(--success);
      box-shadow: 0 0 0 3px rgba(74,222,128,0.15);
    }

    .cc-payment-hint {
      font-size: 11px;
      color: var(--text-muted);
      padding: 8px 10px;
      background: var(--bg-soft);
      border-radius: 6px;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    .cc-payment-hint strong { color: var(--success); }

    .cc-payment-preview {
      display: flex;
      justify-content: space-between;
      padding: 8px 10px;
      background: var(--bg-soft);
      border-radius: 8px;
      margin-bottom: 10px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }
    .cc-payment-preview .val { color: var(--success); font-size: 15px; }

    .cc-credit-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 10px;
    }
    .cc-btn-pay {
      background: linear-gradient(135deg, #48bb78, #38a169);
      color: #fff;
      padding: 13px 16px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 700;
      font-size: 15px;
      font-family: inherit;
      transition: 0.2s;
    }
    .cc-btn-pay:active { transform: scale(0.98); }
    .cc-btn-secondary {
      background: linear-gradient(135deg, #4299e1, #3182ce);
      font-size: 14px;
    }
    .cc-btn-secondary:hover {
      background: linear-gradient(135deg, var(--accent), #4a9eff);
    }

    /* Історія платежів */
    .cc-payments-list {
      background: var(--bg-soft);
      border-radius: 10px;
      padding: 8px;
      max-height: 300px;
      overflow-y: auto;
    }
    .cc-payment-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background: var(--card);
      border-radius: 8px;
      margin-bottom: 6px;
      font-size: 13px;
      border-left: 3px solid var(--success);
      gap: 8px;
    }
    .cc-payment-item:last-child { margin-bottom: 0; }
    .cc-pay-amount {
      font-weight: 700;
      color: var(--success);
      font-size: 14px;
    }
    .cc-pay-split {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 3px;
    }
    .cc-pay-split .body { color: var(--text); }
    .cc-pay-split .interest { color: var(--warning); }
    .cc-pay-date {
      color: var(--text-dim);
      font-size: 11px;
      margin-top: 3px;
    }
    .cc-pay-del {
      background: rgba(239,68,68,0.1);
      border: none;
      color: var(--danger);
      cursor: pointer;
      font-size: 14px;
      padding: 6px 10px;
      border-radius: 6px;
      font-weight: 700;
      min-width: 34px;
      min-height: 34px;
      font-family: inherit;
    }
    .cc-pay-del:active {
      background: var(--danger);
      color: #fff;
    }
    .cc-no-payments {
      text-align: center;
      color: var(--text-dim);
      font-size: 12px;
      padding: 15px;
    }

    /* Розстрочка */
    .cc-installment {
      background: rgba(159,122,234,0.08);
      border: 1px dashed #9f7aea;
      border-radius: 10px;
      padding: 12px;
      margin-top: 8px;
    }
    .cc-inst-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .cc-inst-stat {
      text-align: center;
      padding: 10px 6px;
      background: var(--card);
      border-radius: 8px;
      border: 1px solid rgba(159,122,234,0.3);
    }
    .cc-inst-stat .val {
      font-size: 15px;
      font-weight: 700;
      color: #b794f4;
    }
    .cc-inst-stat .lbl {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-top: 3px;
    }

    /* Підсумок */
    .cc-summary {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 14px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 16px;
    }
    .cc-summary-item { text-align: center; }
    .cc-summary-item .label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .cc-summary-item .value {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      word-break: break-word;
    }
    .cc-summary-item .value.green { color: var(--success); }
    .cc-summary-item .value.red { color: var(--danger); }
    .cc-summary-item .value.orange { color: var(--warning); }

    @media (min-width: 768px) {
      .cc-fields { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
      .cc-payment-fields { grid-template-columns: 1fr 1fr 1fr; }
      .cc-credit-actions { flex-direction: row; flex-wrap: wrap; align-items: center; }
      .cc-btn-pay { width: auto; }
      .cc-inst-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
      .cc-inst-stat .val { font-size: 18px; }
      .cc-summary { grid-template-columns: repeat(5, 1fr); }
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
          <input type="number" id="initialSum" placeholder="Сума, ₴" min="0" inputmode="decimal">
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
          <div class="label">Тіло кредиту</div>
          <div class="value" id="totalSum">0 ₴</div>
        </div>
        <div class="cc-summary-item">
          <div class="label">Сплачено тіла</div>
          <div class="value green" id="totalPaid">0 ₴</div>
        </div>
        <div class="cc-summary-item">
          <div class="label">Залишок</div>
          <div class="value red" id="totalRemaining">0 ₴</div>
        </div>
        <div class="cc-summary-item">
          <div class="label">Сплачено відсотків</div>
          <div class="value orange" id="totalInterest">0 ₴</div>
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

    container.querySelector("#addBtn").addEventListener("click", addCredit);

    // Глобальні функції для inline-обробників
    window.ccDelete = deleteCredit;
    window.ccUpdateField = updateCreditField;
    window.ccUpdateRemaining = updateRemainingManually;
    window.ccToggle = toggleExpand;
    window.ccAddPayment = addPayment;
    window.ccDeletePayment = deletePayment;
    window.ccTogglePaid = togglePaid;
    window.ccOnTotalInput = onTotalInput;
    window.ccRecalcSplit = recalcSplit;

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