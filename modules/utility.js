// modules/utility.js
import { storage } from "./_storage.js";

const ukrMonths = {
  "01": "Січень", "02": "Лютий", "03": "Березень", "04": "Квітень",
  "05": "Травень", "06": "Червень", "07": "Липень", "08": "Серпень",
  "09": "Вересень", "10": "Жовтень", "11": "Листопад", "12": "Грудень"
};

let db = null;
let containerRef = null;
let activeTab = "calc"; // "calc" | "history"

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

// ==================== СХОВИЩЕ ====================

async function saveDraft(values) {
  await storage.set("utility", "draft", values);
}
async function loadDraft() {
  return await storage.get("utility", "draft", null);
}
async function loadHistory() {
  const data = await storage.get("utility", "history", {});
  return (data && typeof data === "object") ? data : {};
}
async function saveHistory(history) {
  await storage.set("utility", "history", history);
}

// ==================== РОЗРАХУНОК ====================

function calculate() {
  const c = containerRef;
  if (!c) return;

  const gasCur = parseFloat(c.querySelector("#gasCurrent").value) || 0;
  const gasPrev = parseFloat(c.querySelector("#gasPrev").value) || 0;
  const gasTariff = parseFloat(c.querySelector("#gasTariff").value) || 0;
  const gasDiff = Math.max(0, gasCur - gasPrev);
  const gasAmount = gasDiff * gasTariff;
  c.querySelector("#gasResult").textContent = gasDiff.toFixed(2);
  c.querySelector("#gasAmount").textContent = gasAmount.toFixed(2);

  const transport = parseFloat(c.querySelector("#transport").value) || 0;

  const elecCur = parseFloat(c.querySelector("#elecCurrent").value) || 0;
  const elecPrev = parseFloat(c.querySelector("#elecPrev").value) || 0;
  const elecTariff = parseFloat(c.querySelector("#elecTariff").value) || 0;
  const elecDiff = Math.max(0, elecCur - elecPrev);
  const elecAmount = elecDiff * elecTariff;
  c.querySelector("#elecResult").textContent = elecDiff.toFixed(2);
  c.querySelector("#elecAmount").textContent = elecAmount.toFixed(2);

  const waterCur = parseFloat(c.querySelector("#waterCurrent").value) || 0;
  const waterPrev = parseFloat(c.querySelector("#waterPrev").value) || 0;
  const waterTariff = parseFloat(c.querySelector("#waterTariff").value) || 0;
  const waterDiff = Math.max(0, waterCur - waterPrev);
  const waterAmount = waterDiff * waterTariff;
  c.querySelector("#waterResult").textContent = waterDiff.toFixed(2);
  c.querySelector("#waterAmount").textContent = waterAmount.toFixed(2);

  const sewer = parseFloat(c.querySelector("#sewer").value) || 0;
  const internet = parseFloat(c.querySelector("#internet").value) || 0;
  const rent = parseFloat(c.querySelector("#rent").value) || 0;
  const balance = parseFloat(c.querySelector("#balance").value) || 0;

  const total = gasAmount + transport + elecAmount + waterAmount + sewer + internet + rent + balance;
  c.querySelector("#total").textContent = total.toFixed(2);
}

// ==================== ЧЕРНЕТКА ====================

async function saveDraftAuto() {
  if (!containerRef) return;
  const inputs = containerRef.querySelectorAll("input:not([type=file]), select");
  const values = {};
  inputs.forEach(inp => { if (inp.id) values[inp.id] = inp.value; });
  await saveDraft(values);
}

async function restoreDraft() {
  const draft = await loadDraft();
  if (!draft || typeof draft !== "object") return;
  Object.keys(draft).forEach(id => {
    const el = containerRef.querySelector("#" + id);
    if (el) el.value = draft[id];
  });
}

// ==================== ІСТОРІЯ ====================

async function saveToHistory() {
  calculate();
  const year = containerRef.querySelector("#selectYear").value;
  const month = containerRef.querySelector("#selectMonth").value;
  const period = `${year}-${month}`;
  const c = containerRef;

  const record = {
    period,
    year,
    month,
    total: c.querySelector("#total").textContent,
    details: {
      gasCur: c.querySelector("#gasCurrent").value,
      gasPrev: c.querySelector("#gasPrev").value,
      gasAmount: c.querySelector("#gasAmount").textContent,
      elecCur: c.querySelector("#elecCurrent").value,
      elecPrev: c.querySelector("#elecPrev").value,
      elecAmount: c.querySelector("#elecAmount").textContent,
      waterCur: c.querySelector("#waterCurrent").value,
      waterPrev: c.querySelector("#waterPrev").value,
      waterAmount: c.querySelector("#waterAmount").textContent,
      transport: c.querySelector("#transport").value,
      sewer: c.querySelector("#sewer").value,
      internet: c.querySelector("#internet").value,
      rent: c.querySelector("#rent").value,
      balance: c.querySelector("#balance").value
    }
  };

  const history = await loadHistory();
  history[period] = record;
  await saveHistory(history);

  alert(`✅ Збережено: ${ukrMonths[month]} ${year}`);
  renderHistory();
}

async function deleteHistory(period) {
  if (!confirm("Видалити цей місяць?")) return;
  const history = await loadHistory();
  delete history[period];
  await saveHistory(history);
  renderHistory();
}

async function copyFromHistory(period) {
  const history = await loadHistory();
  const rec = history[period];
  if (!rec) return;
  const c = containerRef;
  c.querySelector("#gasPrev").value = rec.details.gasCur;
  c.querySelector("#elecPrev").value = rec.details.elecCur;
  c.querySelector("#waterPrev").value = rec.details.waterCur;
  c.querySelector("#gasCurrent").value = "0";
  c.querySelector("#elecCurrent").value = "0";
  c.querySelector("#waterCurrent").value = "0";
  calculate();
  await saveDraftAuto();
  switchTab("calc");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function renderHistory() {
  const container = containerRef.querySelector("#historyContainer");
  const history = await loadHistory();
  const keys = Object.keys(history);

  if (keys.length === 0) {
    container.innerHTML = `<div class="u-no-history">Архів порожній</div>`;
    return;
  }

  const grouped = {};
  keys.forEach(k => {
    const y = history[k].year;
    if (!grouped[y]) grouped[y] = [];
    grouped[y].push(history[k]);
  });

  const years = Object.keys(grouped).sort((a, b) => b - a);
  let html = "";

  years.forEach((year, idx) => {
    const recs = grouped[year].sort((a, b) => b.month.localeCompare(a.month));
    html += `
      <div class="u-year ${idx > 0 ? "collapsed" : ""}">
        <div class="u-year-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <span>📅 ${year} рік</span>
        </div>
        <div class="u-year-content">
          ${recs.map(rec => `
            <div class="u-month-row">
              <span class="u-month-name">${ukrMonths[rec.month] || rec.month}</span>
              <div class="u-month-controls">
                <span class="u-month-total">${rec.total} ₴</span>
                <button class="u-btn-text u-btn-blue"
                  onclick="window.utilCopyFrom('${rec.period}')">🔄 Попередні</button>
                <button class="u-btn-text u-btn-red"
                  onclick="window.utilDelete('${rec.period}')">🗑</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==================== ВКЛАДКИ ====================

function switchTab(tab) {
  activeTab = tab;
  const c = containerRef;
  c.querySelectorAll(".u-tab-btn").forEach(b => b.classList.remove("active"));
  c.querySelectorAll(".u-card").forEach(el => el.classList.remove("active"));

  if (tab === "calc") {
    c.querySelector("#btnCalcTab").classList.add("active");
    c.querySelector("#calcTab").classList.add("active");
  } else {
    c.querySelector("#btnHistoryTab").classList.add("active");
    c.querySelector("#historyTab").classList.add("active");
    renderHistory();
  }
}

// ==================== ЧЕК (модалка) ====================

function openReport() {
  calculate();
  const c = containerRef;
  const year = c.querySelector("#selectYear").value;
  const month = c.querySelector("#selectMonth").value;

  let report = `📋 Рахунок за комуналку (${ukrMonths[month]} ${year}):\n\n`;

  const gasAmount = parseFloat(c.querySelector("#gasAmount").textContent) || 0;
  const transport = parseFloat(c.querySelector("#transport").value) || 0;
  const elecAmount = parseFloat(c.querySelector("#elecAmount").textContent) || 0;
  const waterAmount = parseFloat(c.querySelector("#waterAmount").textContent) || 0;
  const sewer = parseFloat(c.querySelector("#sewer").value) || 0;
  const internet = parseFloat(c.querySelector("#internet").value) || 0;
  const rent = parseFloat(c.querySelector("#rent").value) || 0;
  const balance = parseFloat(c.querySelector("#balance").value) || 0;

  if (gasAmount > 0) report += `🔥 Газ: ${gasAmount.toFixed(2)} ₴\n`;
  if (transport > 0) report += `🚛 Транспорт: ${transport.toFixed(2)} ₴\n`;
  if (elecAmount > 0) report += `💡 Світло: ${elecAmount.toFixed(2)} ₴\n`;
  if (waterAmount > 0) report += `💧 Вода: ${waterAmount.toFixed(2)} ₴\n`;
  if (sewer > 0) report += `🚽 Стоки: ${sewer.toFixed(2)} ₴\n`;
  if (internet > 0) report += `🌐 Інтернет: ${internet.toFixed(2)} ₴\n`;
  if (rent > 0) report += `🏠 Оренда: ${rent.toFixed(2)} ₴\n`;
  if (balance !== 0) report += `💰 Залишок: ${balance.toFixed(2)} ₴\n`;

  report += `\n💰 РАЗОМ: ${c.querySelector("#total").textContent} ₴`;

  c.querySelector("#modalReportText").textContent = report;
  c.querySelector("#reportModal").classList.add("open");
}

function closeReport() {
  containerRef.querySelector("#reportModal").classList.remove("open");
}

async function copyReport() {
  const text = containerRef.querySelector("#modalReportText").textContent;
  try {
    await navigator.clipboard.writeText(text);
    alert("✅ Скопійовано");
  } catch {
    alert("Не вдалось скопіювати");
  }
}

// ==================== ОЧИЩЕННЯ ====================

async function clearAll() {
  if (!confirm("Очистити всі поля?")) return;
  const c = containerRef;
  c.querySelectorAll("input:not([type=file])").forEach(inp => {
    if (inp.id === "gasTariff") inp.value = "7.96";
    else if (inp.id === "elecTariff") inp.value = "4.32";
    else if (inp.id === "waterTariff") inp.value = "32.50";
    else inp.value = "0";
  });
  calculate();
  await saveDraftAuto();
}

// ==================== МОДУЛЬ ====================

export default {
  id: "utility",
  title: "Комуналка",
  icon: "🏠",

  styles: `
    .u-wrap { padding-bottom: 20px; }

    .u-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    .u-tab-btn {
      flex: 1;
      padding: 12px 6px;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-weight: 700;
      font-size: 14px;
      color: var(--text-muted);
      text-align: center;
      font-family: inherit;
      transition: 0.15s;
    }
    .u-tab-btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .u-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 16px;
      display: none;
    }
    .u-card.active { display: block; }

    .u-period {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: var(--bg-soft);
      padding: 10px;
      border-radius: 8px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .u-period select {
      background: var(--card);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
    }
    .u-period span { color: var(--text-muted); font-size: 13px; }

    .u-group {
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .u-group .title {
      font-weight: 700;
      font-size: 14px;
      color: var(--text);
      margin-bottom: 8px;
    }
    .u-group .title .badge {
      font-weight: 400;
      font-size: 11px;
      color: var(--text-muted);
    }
    .u-row {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .u-row input {
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 14px;
      background: var(--card);
      color: var(--text);
      font-family: inherit;
      width: 70px;
      text-align: center;
    }
    .u-row input.sum-input { width: 90px; }
    .u-row input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }
    .u-row .label-text {
      font-size: 12px;
      color: var(--text-muted);
      min-width: 28px;
    }
    .u-row .result {
      font-weight: 700;
      font-size: 14px;
      color: var(--success);
      min-width: 70px;
      text-align: right;
      padding: 2px 8px;
      background: var(--card);
      border-radius: 4px;
    }
    .u-row .eq { font-weight: 700; color: var(--text-muted); }

    .u-total-box {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 2px dashed var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .u-total-box .label { font-size: 18px; font-weight: 700; color: var(--text); }
    .u-total-box .sum {
      font-size: 26px;
      font-weight: 700;
      color: var(--accent-light);
      background: rgba(108,92,231,0.15);
      padding: 4px 20px;
      border-radius: 8px;
    }

    .u-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .u-actions button {
      flex: 1;
      min-width: 110px;
      text-align: center;
      padding: 11px 8px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: 0.15s;
    }
    .u-btn-primary {
      background: var(--accent);
      color: #fff;
    }
    .u-btn-primary:hover {
      background: linear-gradient(135deg, var(--accent), #4a9eff);
    }
    .u-btn-green {
      background: var(--success);
      color: #062014;
    }
    .u-btn-green:hover { background: #22c55e; }
    .u-btn-red {
      background: rgba(239,68,68,0.15);
      color: var(--danger);
    }
    .u-btn-red:hover {
      background: var(--danger);
      color: #fff;
    }

    /* Історія */
    .u-year {
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    .u-year-header {
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      display: flex;
      justify-content: space-between;
    }
    .u-year-header::after {
      content: "▼";
      font-size: 11px;
      transition: transform 0.2s;
    }
    .u-year.collapsed .u-year-header::after { transform: rotate(-90deg); }
    .u-year-content { display: block; }
    .u-year.collapsed .u-year-content { display: none; }

    .u-month-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid var(--border);
      gap: 8px;
      flex-wrap: wrap;
    }
    .u-month-name {
      font-weight: 700;
      color: var(--text);
    }
    .u-month-controls {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .u-month-total {
      font-weight: 700;
      color: var(--success);
    }
    .u-btn-text {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 12px;
      text-decoration: underline;
      font-family: inherit;
      padding: 2px 4px;
    }
    .u-btn-blue { color: var(--accent-light); }
    .u-btn-red { color: var(--danger); }

    .u-no-history {
      text-align: center;
      color: var(--text-muted);
      padding: 30px;
      font-style: italic;
    }

    /* Модалка чека */
    .u-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      padding: 16px;
      backdrop-filter: blur(4px);
    }
    .u-modal-overlay.open { display: flex; }

    .u-modal {
      background: var(--card);
      border: 1px solid var(--accent);
      border-radius: var(--radius-lg);
      max-width: 450px;
      width: 100%;
      padding: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .u-modal-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px dashed var(--border);
      color: var(--text);
    }
    .u-modal-text {
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      color: var(--text);
      margin-bottom: 14px;
      max-height: 50vh;
      overflow-y: auto;
      font-family: inherit;
    }
    .u-modal-buttons { display: flex; gap: 8px; }
    .u-modal-btn {
      flex: 1;
      padding: 10px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }
    .u-modal-btn.primary { background: var(--accent); color: #fff; }
    .u-modal-btn.secondary { background: var(--bg-soft); color: var(--text); }
  `,

  template: `
    <div class="u-wrap">
      <div class="u-tabs">
        <button id="btnCalcTab" class="u-tab-btn active">🧮 Калькулятор</button>
        <button id="btnHistoryTab" class="u-tab-btn">📅 Історія</button>
      </div>

      <!-- КАЛЬКУЛЯТОР -->
      <div id="calcTab" class="u-card active">
        <div class="u-period">
          <span>Проплата за:</span>
          <select id="selectMonth">
            <option value="01">Січень</option><option value="02">Лютий</option>
            <option value="03">Березень</option><option value="04">Квітень</option>
            <option value="05">Травень</option><option value="06">Червень</option>
            <option value="07">Липень</option><option value="08">Серпень</option>
            <option value="09">Вересень</option><option value="10">Жовтень</option>
            <option value="11">Листопад</option><option value="12">Грудень</option>
          </select>
          <select id="selectYear"></select>
        </div>

        <div class="u-group">
          <div class="title">🔥 Газ <span class="badge">(поточний − попередній) × тариф</span></div>
          <div class="u-row">
            <span class="label-text">Пот.</span>
            <input type="number" step="any" id="gasCurrent" value="0">
            <span class="label-text">Поп.</span>
            <input type="number" step="any" id="gasPrev" value="0">
            <span class="eq">=</span>
            <span class="result" id="gasResult">0.00</span>
            <span class="eq">×</span>
            <input type="number" step="any" id="gasTariff" value="7.96">
            <span class="eq">=</span>
            <span class="result" id="gasAmount">0.00</span>
          </div>
        </div>

        <div class="u-group">
          <div class="title">🚛 Транспортування газу</div>
          <div class="u-row">
            <span class="label-text">Сума</span>
            <input type="number" step="any" class="sum-input" id="transport" value="0">
            <span class="eq">грн</span>
          </div>
        </div>

        <div class="u-group">
          <div class="title">💡 Світло <span class="badge">(поточний − попередній) × тариф</span></div>
          <div class="u-row">
            <span class="label-text">Пот.</span>
            <input type="number" step="any" id="elecCurrent" value="0">
            <span class="label-text">Поп.</span>
            <input type="number" step="any" id="elecPrev" value="0">
            <span class="eq">=</span>
            <span class="result" id="elecResult">0.00</span>
            <span class="eq">×</span>
            <input type="number" step="any" id="elecTariff" value="4.32">
            <span class="eq">=</span>
            <span class="result" id="elecAmount">0.00</span>
          </div>
        </div>

        <div class="u-group">
          <div class="title">💧 Вода <span class="badge">(поточний − попередній) × тариф</span></div>
          <div class="u-row">
            <span class="label-text">Пот.</span>
            <input type="number" step="any" id="waterCurrent" value="0">
            <span class="label-text">Поп.</span>
            <input type="number" step="any" id="waterPrev" value="0">
            <span class="eq">=</span>
            <span class="result" id="waterResult">0.00</span>
            <span class="eq">×</span>
            <input type="number" step="any" id="waterTariff" value="32.50">
            <span class="eq">=</span>
            <span class="result" id="waterAmount">0.00</span>
          </div>
        </div>

        <div class="u-group">
          <div class="title">🚽 Стоки</div>
          <div class="u-row">
            <span class="label-text">Сума</span>
            <input type="number" step="any" class="sum-input" id="sewer" value="0">
            <span class="eq">грн</span>
          </div>
        </div>

        <div class="u-group">
          <div class="title">🌐 Інтернет</div>
          <div class="u-row">
            <span class="label-text">Сума</span>
            <input type="number" step="any" class="sum-input" id="internet" value="0">
            <span class="eq">грн</span>
          </div>
        </div>

        <div class="u-group">
          <div class="title">🏠 Оренда</div>
          <div class="u-row">
            <span class="label-text">Сума</span>
            <input type="number" step="any" class="sum-input" id="rent" value="0">
            <span class="eq">грн</span>
          </div>
        </div>

        <div class="u-group">
          <div class="title">💰 Залишок <span class="badge">(може бути + або −)</span></div>
          <div class="u-row">
            <span class="label-text">Сума</span>
            <input type="number" step="any" class="sum-input" id="balance" value="0">
            <span class="eq">грн</span>
          </div>
        </div>

        <div class="u-total-box">
          <span class="label">💰 РАЗОМ</span>
          <span class="sum" id="total">0.00</span>
        </div>

        <div class="u-actions">
          <button class="u-btn-primary" id="btnCalc">🔄 Розрахувати</button>
          <button class="u-btn-primary" id="btnReport">📋 Чек</button>
          <button class="u-btn-green" id="btnSave">💾 В архів</button>
          <button class="u-btn-red" id="btnClear">🗑 Очистити</button>
        </div>
      </div>

      <!-- ІСТОРІЯ -->
      <div id="historyTab" class="u-card">
        <div id="historyContainer"></div>
      </div>

      <!-- МОДАЛКА ЧЕКА -->
      <div class="u-modal-overlay" id="reportModal">
        <div class="u-modal">
          <div class="u-modal-title">📋 Рахунок за комуналку</div>
          <div class="u-modal-text" id="modalReportText">...</div>
          <div class="u-modal-buttons">
            <button class="u-modal-btn primary" id="btnCopyReport">📋 Копіювати</button>
            <button class="u-modal-btn secondary" id="btnCloseReport">Закрити</button>
          </div>
        </div>
      </div>
    </div>
  `,

    async init(container) {
    containerRef = container;
    db = { ready: true };

    if (!document.getElementById(`style-${this.id}`)) {
      const style = document.createElement("style");
      style.id = `style-${this.id}`;
      style.textContent = this.styles;
      document.head.appendChild(style);
    }

    container.innerHTML = this.template;

    // Заповнюємо роки
    const yearSelect = container.querySelector("#selectYear");
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 3; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === currentYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }
    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, "0");
    container.querySelector("#selectMonth").value = currentMonthStr;

    await restoreDraft();
    calculate();

    // Автозбереження + автоперерахунок
    container.querySelectorAll("input, select").forEach(el => {
      el.addEventListener("input", () => { calculate(); saveDraftAuto(); });
      el.addEventListener("change", () => { calculate(); saveDraftAuto(); });
    });

    // Кнопки
    container.querySelector("#btnCalc").addEventListener("click", calculate);
    container.querySelector("#btnReport").addEventListener("click", openReport);
    container.querySelector("#btnSave").addEventListener("click", saveToHistory);
    container.querySelector("#btnClear").addEventListener("click", clearAll);
    container.querySelector("#btnCalcTab").addEventListener("click", () => switchTab("calc"));
    container.querySelector("#btnHistoryTab").addEventListener("click", () => switchTab("history"));

    // Модалка
    container.querySelector("#btnCloseReport").addEventListener("click", closeReport);
    container.querySelector("#btnCopyReport").addEventListener("click", copyReport);
    container.querySelector("#reportModal").addEventListener("click", (e) => {
      if (e.target.id === "reportModal") closeReport();
    });

    // Глобальні функції
    window.utilCopyFrom = copyFromHistory;
    window.utilDelete = deleteHistory;
  },

  async getData() {
    const draft = await loadDraft();
    const history = await loadHistory();
    return { draft, history };
  },

  async setData(data) {
    if (!data) return;
    if (data.draft) await saveDraft(data.draft);
    if (data.history) await saveHistory(data.history);
    if (containerRef) {
      await restoreDraft();
      calculate();
    }
  },

  async resetData() {
    await storage.remove("utility", "draft");
    await storage.remove("utility", "history");
    if (containerRef) {
      containerRef.querySelectorAll("input:not([type=file])").forEach(inp => {
        if (inp.id === "gasTariff") inp.value = "7.96";
        else if (inp.id === "elecTariff") inp.value = "4.32";
        else if (inp.id === "waterTariff") inp.value = "32.50";
        else inp.value = "0";
      });
      calculate();
    }
  }
};