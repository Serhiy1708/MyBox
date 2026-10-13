// modules/calendar.js
import { storage } from "./_storage.js";

const DB_KEY_MODULE = "calendar";

const TYPES = {
  // Шар 1: Секс
  NORMAL: "normal",
  QUICK: "quick",
  FAST: "fast",
  // Шар 2: Цикл
  PERIOD: "period",
  SPOTTING: "spotting",
  PERIOD_PREDICTED: "period_predicted",
  OVULATION: "ovulation",
  FERTILE: "fertile",
  PMS: "pms"
};

const SEX_TYPES = [TYPES.NORMAL, TYPES.QUICK, TYPES.FAST];
const CYCLE_TYPES = [TYPES.PERIOD, TYPES.SPOTTING, TYPES.PERIOD_PREDICTED, TYPES.OVULATION, TYPES.FERTILE, TYPES.PMS];

let records = {}; // date "YYYY-MM-DD" -> { sex: "normal"|null, cycle: "period"|null }
let containerRef = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let activeTab = "calendar";

let modalDate = null;
let modalSex = null;
let modalCycle = null;

// ==================== УТИЛІТИ ====================

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}
function getDaysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}
function getFirstDayOffset(y, m) {
  const d = new Date(y, m, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function getMonthName(y, m) {
  return new Date(y, m).toLocaleString("uk-UA", { month: "long" });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

// ==================== СХОВИЩЕ ====================

async function save() {
  await storage.set(DB_KEY_MODULE, "records", records);
}
async function load() {
  const data = await storage.get(DB_KEY_MODULE, "records", {});
  records = (data && typeof data === "object") ? data : {};
}

// ==================== ОПЕРАЦІЇ ====================

function getRec(dateStr) {
  if (!records[dateStr]) records[dateStr] = { sex: null, cycle: null };
  return records[dateStr];
}

function isSexType(t) { return SEX_TYPES.includes(t); }
function isCycleType(t) { return CYCLE_TYPES.includes(t); }

// ==================== РОЗРАХУНОК ЦИКЛУ ====================

function getAllPeriodDates() {
  const dates = [];
  for (const [date, rec] of Object.entries(records)) {
    if (rec && rec.cycle === TYPES.PERIOD) dates.push(date);
  }
  return dates.sort();
}

function findPeriodStart(dateStr) {
  let current = parseDate(dateStr);
  while (true) {
    const prev = addDays(current, -1);
    const prevStr = formatDate(prev);
    const r = records[prevStr];
    if (r && r.cycle === TYPES.PERIOD) current = prev;
    else break;
  }
  return current;
}

function findPeriodEnd(dateStr) {
  let current = parseDate(dateStr);
  while (true) {
    const next = addDays(current, 1);
    const nextStr = formatDate(next);
    const r = records[nextStr];
    if (r && r.cycle === TYPES.PERIOD) current = next;
    else break;
  }
  return current;
}

function getAverageCycleLength() {
  const periods = getAllPeriodDates();
  if (periods.length < 2) return null;

  // Шукаємо початок кожного циклу (перший день місячних)
  const starts = [];
  let lastStart = null;
  for (const d of periods) {
    const r = records[formatDate(addDays(parseDate(d), -1))];
    if (!r || r.cycle !== TYPES.PERIOD) {
      starts.push(parseDate(d));
    }
  }

  if (starts.length < 2) return null;

  const lengths = [];
  for (let i = 1; i < starts.length; i++) {
    const diff = Math.round((starts[i] - starts[i - 1]) / (1000 * 60 * 60 * 24));
    if (diff >= 15 && diff <= 60) lengths.push(diff);
  }

  if (lengths.length === 0) return null;
  return Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
}

function getCycleLength() {
  // Пріоритет: В (вручну) > Б (авто) > А (28)
  const manual = parseFloat(containerRef?.querySelector("#cycleLength")?.value);
  if (manual && manual >= 15 && manual <= 60) return manual;

  const avg = getAverageCycleLength();
  if (avg) return avg;

  return 28;
}

function getLastPeriodStart() {
  const periods = getAllPeriodDates();
  if (periods.length === 0) return null;
  return findPeriodStart(periods[periods.length - 1]);
}

function recalcPredictions() {
  // Видаляємо старі прогнози
  for (const [date, rec] of Object.entries(records)) {
    if (rec && rec.cycle === TYPES.PERIOD_PREDICTED) {
      rec.cycle = null;
      if (!rec.sex) delete records[date];
    }
  }

  const lastStart = getLastPeriodStart();
  if (!lastStart) return;

  const cycleLen = getCycleLength();

  // Прогноз наступних місячних: +cycleLen днів від початку останніх
  const nextStart = addDays(lastStart, cycleLen);
  for (let i = 0; i < 5; i++) {
    const d = addDays(nextStart, i);
    const ds = formatDate(d);
    const rec = getRec(ds);
    if (!rec.cycle) rec.cycle = TYPES.PERIOD_PREDICTED;
  }
}

function getOvulationDate() {
  const lastStart = getLastPeriodStart();
  if (!lastStart) return null;
  const cycleLen = getCycleLength();
  // Овуляція: за 14 днів до наступних місячних
  const ovulation = addDays(lastStart, cycleLen - 14);
  return ovulation;
}

function getFertileWindow() {
  const ov = getOvulationDate();
  if (!ov) return null;
  // Фертильні: 5 днів до + день овуляції
  return {
    start: addDays(ov, -5),
    end: ov
  };
}

function getPmsWindow() {
  const lastStart = getLastPeriodStart();
  if (!lastStart) return null;
  const cycleLen = getCycleLength();
  const nextStart = addDays(lastStart, cycleLen);
  // ПМС: 5 днів перед наступними місячними
  return {
    start: addDays(nextStart, -5),
    end: addDays(nextStart, -1)
  };
}

function isInRange(date, range) {
  if (!range) return false;
  const t = date.getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

function getAutoCycleType(dateStr) {
  const date = parseDate(dateStr);
  const ov = getOvulationDate();
  if (ov && formatDate(ov) === dateStr) return TYPES.OVULATION;

  const fertile = getFertileWindow();
  if (fertile && isInRange(date, fertile)) return TYPES.FERTILE;

  const pms = getPmsWindow();
  if (pms && isInRange(date, pms)) return TYPES.PMS;

  return null;
}

// ==================== РЕНДЕР КАЛЕНДАРЯ ====================

function renderCalendar() {
  const c = containerRef;
  const label = c.querySelector("#currentMonthLabel");
  label.textContent = `${getMonthName(currentYear, currentMonth)} ${currentYear}`;

  const startOffset = getFirstDayOffset(currentYear, currentMonth);
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const daysInPrevMonth = getDaysInMonth(currentYear, currentMonth - 1);

  let html = "";
  let monthSexCount = 0;

  for (let i = 0; i < startOffset; i++) {
    const prevDate = daysInPrevMonth - startOffset + i + 1;
    html += `<div class="cal-day other-month"><span class="cal-day-num">${prevDate}</span></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const rec = records[dateStr] || { sex: null, cycle: null };

    // Шар "Цикл" — реальний, або прогноз, або авто-фаза
    let cycleType = rec.cycle;
    let cycleAuto = false;
    if (!cycleType) {
      const auto = getAutoCycleType(dateStr);
      if (auto) { cycleType = auto; cycleAuto = true; }
    }

    let classes = "cal-day";
    let badges = "";

    // Цикл
    if (cycleType === TYPES.PERIOD) { classes += " cycle-period"; badges += "🩸"; }
    else if (cycleType === TYPES.SPOTTING) { classes += " cycle-spotting"; badges += "🩸"; }
    else if (cycleType === TYPES.PERIOD_PREDICTED) { classes += " cycle-period-predicted"; badges += "🔮"; }
    else if (cycleType === TYPES.OVULATION) { classes += " cycle-ovulation" + (cycleAuto ? " auto" : ""); badges += "🥚"; }
    else if (cycleType === TYPES.FERTILE) { classes += " cycle-fertile" + (cycleAuto ? " auto" : ""); badges += "🌱"; }
    else if (cycleType === TYPES.PMS) { classes += " cycle-pms" + (cycleAuto ? " auto" : ""); badges += "😣"; }

    // Секс
    if (rec.sex) {
      if (rec.sex === TYPES.NORMAL) badges += "♥";
      else if (rec.sex === TYPES.QUICK) badges += "⚡";
      else if (rec.sex === TYPES.FAST) badges += "💦";
      monthSexCount++;
    }

    html += `
      <div class="${classes}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        ${badges ? `<span class="cal-day-badges">${badges}</span>` : ""}
      </div>
    `;
  }

  const totalCells = startOffset + daysInMonth;
  const remaining = (7 - totalCells % 7) % 7;
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="cal-day other-month"><span class="cal-day-num">${i}</span></div>`;
  }

  c.querySelector("#daysGrid").innerHTML = html;
  c.querySelector("#monthCount").textContent = monthSexCount;

  c.querySelectorAll(".cal-day:not(.other-month)").forEach(cell => {
    cell.addEventListener("click", () => {
      openActionModal(cell.dataset.date);
    });
  });
}

// ==================== МОДАЛКА ====================

function openActionModal(dateStr) {
  const c = containerRef;
  modalDate = dateStr;
  const rec = records[dateStr] || { sex: null, cycle: null };
  modalSex = rec.sex;
  modalCycle = rec.cycle;

  const dateObj = parseDate(dateStr);
  const formatted = dateObj.toLocaleDateString("uk-UA", {
    year: "numeric", month: "long", day: "numeric"
  });
  c.querySelector("#modalDate").textContent = `📅 ${formatted}`;

  // Підсвітка вибраних опцій
  updateModalSelection();

  c.querySelector("#actionModal").classList.add("show");
}

function updateModalSelection() {
  const c = containerRef;
  c.querySelectorAll("[data-sex]").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.sex === (modalSex || "none"));
  });
  c.querySelectorAll("[data-cycle]").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.cycle === (modalCycle || "none"));
  });
}

function closeActionModal() {
  containerRef.querySelector("#actionModal").classList.remove("show");
  modalDate = null;
}

async function saveModal() {
  if (!modalDate) return;

  const rec = getRec(modalDate);
  rec.sex = modalSex;
  rec.cycle = modalCycle;

  if (!rec.sex && !rec.cycle) delete records[modalDate];

  // Якщо ставимо реальні місячні — автоперерахунок прогнозу
  if (modalCycle === TYPES.PERIOD) {
    // Ставимо 5 днів місячних
    const start = parseDate(modalDate);
    for (let i = 0; i < 5; i++) {
      const d = addDays(start, i);
      const ds = formatDate(d);
      const r = getRec(ds);
      if (r.cycle === TYPES.PERIOD_PREDICTED || r.cycle === null) {
        r.cycle = TYPES.PERIOD;
      }
    }
  }

  recalcPredictions();
  await save();
  renderCalendar();
  renderStats();
  closeActionModal();
}

async function deleteModal() {
  if (!modalDate) return;
  if (!confirm("Видалити запис за цей день?")) return;

  delete records[modalDate];
  recalcPredictions();
  await save();
  renderCalendar();
  renderStats();
  closeActionModal();
}

// ==================== СТАТИСТИКА ====================

function getCurrentPhase() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDate(today);

  const rec = records[todayStr];
  if (rec && rec.cycle) {
    if (rec.cycle === TYPES.PERIOD) return "🩸 Місячні";
    if (rec.cycle === TYPES.SPOTTING) return "🩸 Мазання";
    if (rec.cycle === TYPES.OVULATION) return "🥚 Овуляція";
    if (rec.cycle === TYPES.FERTILE) return "🌱 Фертильні";
    if (rec.cycle === TYPES.PMS) return "😣 ПМС";
  }

  const auto = getAutoCycleType(todayStr);
  if (auto === TYPES.OVULATION) return "🥚 Овуляція (прогноз)";
  if (auto === TYPES.FERTILE) return "🌱 Фертильні (прогноз)";
  if (auto === TYPES.PMS) return "😣 ПМС (прогноз)";

  return "Безпечні дні";
}

function renderStats() {
  const c = containerRef;

  const avg = getAverageCycleLength();
  const cycleLen = getCycleLength();
  const lastStart = getLastPeriodStart();
  const nextStart = lastStart ? addDays(lastStart, cycleLen) : null;
  const ov = getOvulationDate();

  const today = new Date();
  const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const yearStr = String(today.getFullYear());

  let sexMonth = 0, sexYear = 0;
  for (const [date, rec] of Object.entries(records)) {
    if (rec && rec.sex) {
      if (date.startsWith(monthStr)) sexMonth++;
      if (date.startsWith(yearStr)) sexYear++;
    }
  }

  c.querySelector("#statAvgCycle").textContent = avg ? `${avg} днів` : "—";
  c.querySelector("#statCycleLen").textContent = `${cycleLen} днів`;
  c.querySelector("#statLastPeriod").textContent = lastStart
    ? formatDate(lastStart).split("-").reverse().join(".")
    : "—";
  c.querySelector("#statNextPeriod").textContent = nextStart
    ? formatDate(nextStart).split("-").reverse().join(".")
    : "—";
  c.querySelector("#statOvulation").textContent = ov
    ? formatDate(ov).split("-").reverse().join(".")
    : "—";
  c.querySelector("#statPhase").textContent = getCurrentPhase();
  c.querySelector("#statSexMonth").textContent = sexMonth;
  c.querySelector("#statSexYear").textContent = sexYear;
}

// ==================== ІСТОРІЯ ====================

function renderHistory() {
  const c = containerRef;
  const history = {};

  for (const [date, rec] of Object.entries(records)) {
    if (!rec || !rec.sex) continue;
    const year = date.substring(0, 4);
    const month = date.substring(5, 7);
    if (!history[year]) history[year] = {};
    if (!history[year][month]) history[year][month] = 0;
    history[year][month]++;
  }

  const years = Object.keys(history).sort().reverse();
  let html = "";

  if (years.length === 0) {
    html = `<div class="cal-empty">Немає записів</div>`;
  } else {
    const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
      "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];

    years.forEach((year, idx) => {
      const months = history[year];
      const totalYear = Object.values(months).reduce((a, b) => a + b, 0);
      html += `
        <div class="cal-year ${idx > 0 ? "collapsed" : ""}">
          <div class="cal-year-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span>📅 ${year}</span>
            <span class="cal-year-count">${totalYear} днів</span>
          </div>
          <div class="cal-year-content">
      `;
      for (let m = 1; m <= 12; m++) {
        const mk = String(m).padStart(2, "0");
        const count = months[mk] || 0;
        if (count > 0) {
          html += `
            <div class="cal-month-row">
              <span>${monthNames[m - 1]}</span>
              <span class="cal-month-count">${count} днів</span>
            </div>
          `;
        }
      }
      html += `</div></div>`;
    });
  }

  c.querySelector("#historyContainer").innerHTML = html;
}

// ==================== ВКЛАДКИ ====================

function switchTab(tab) {
  activeTab = tab;
  const c = containerRef;
  c.querySelectorAll(".cal-tab-btn").forEach(b => b.classList.remove("active"));
  c.querySelectorAll(".cal-tab-content").forEach(el => el.classList.remove("active"));

  c.querySelector(`#tab-${tab}`).classList.add("active");
  c.querySelector(`[data-tab="${tab}"]`).classList.add("active");

  if (tab === "history") renderHistory();
  if (tab === "stats") renderStats();
}

// ==================== НАВІГАЦІЯ ====================

function goPrevMonth() {
  if (currentMonth === 0) { currentMonth = 11; currentYear--; }
  else currentMonth--;
  renderCalendar();
}
function goNextMonth() {
  if (currentMonth === 11) { currentMonth = 0; currentYear++; }
  else currentMonth++;
  renderCalendar();
}

// ==================== МОДУЛЬ ====================

export default {
  id: "calendar",
  title: "Календар",
  icon: "📅",

  styles: `
    .cal-wrap { padding-bottom: 20px; }

    /* Вкладки */
    .cal-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 14px;
    }
    .cal-tab-btn {
      flex: 1;
      padding: 11px 6px;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-weight: 700;
      font-size: 13px;
      color: var(--text-muted);
      font-family: inherit;
      transition: 0.15s;
    }
    .cal-tab-btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .cal-tab-content { display: none; }
    .cal-tab-content.active { display: block; }

    /* Навігація місяця */
    .cal-month-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 14px 0;
      gap: 10px;
    }
    .cal-month-nav button {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
    }
    .cal-month-nav button:hover { border-color: var(--accent); }
    .cal-month-nav span {
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
    }

    .cal-count-badge {
      background: var(--accent);
      color: #fff;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
    }

    /* Сітка днів */
    .cal-weekdays {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      margin-bottom: 4px;
      text-align: center;
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 700;
      text-transform: uppercase;
    }

    .cal-days {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }

    .cal-day {
      aspect-ratio: 1;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: 0.15s;
      padding: 2px;
      position: relative;
      gap: 1px;
    }
    .cal-day:hover {
      border-color: var(--accent);
      transform: scale(0.97);
    }
    .cal-day.other-month {
      opacity: 0.25;
      pointer-events: none;
    }

    .cal-day-num {
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      line-height: 1;
    }
    .cal-day-badges {
      font-size: 10px;
      line-height: 1;
      letter-spacing: -2px;
      display: flex;
      gap: 0;
    }

    /* Кольори циклу */
    .cal-day.cycle-period {
      background: rgba(239,68,68,0.45);
      border-color: #ef4444;
    }
    .cal-day.cycle-spotting {
      background: rgba(239,68,68,0.2);
      border-color: rgba(239,68,68,0.5);
    }
    .cal-day.cycle-period-predicted {
      background: rgba(239,68,68,0.1);
      border: 1px dashed rgba(239,68,68,0.5);
    }
    .cal-day.cycle-ovulation {
      background: rgba(74,158,255,0.25);
      border-color: #4a9eff;
    }
    .cal-day.cycle-fertile {
      background: rgba(74,222,128,0.2);
      border-color: rgba(74,222,128,0.5);
    }
    .cal-day.cycle-pms {
      background: rgba(245,158,11,0.2);
      border-color: rgba(245,158,11,0.5);
    }
    .cal-day.cycle-ovulation.auto,
    .cal-day.cycle-fertile.auto,
    .cal-day.cycle-pms.auto {
      border-style: dashed;
    }

    /* Легенда */
    .cal-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      margin: 16px 0;
      padding: 12px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 11px;
      color: var(--text-muted);
    }
    .cal-legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .cal-legend-color {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    /* Статистика */
    .cal-stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 16px;
    }
    .cal-stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px;
    }
    .cal-stat-card .lbl {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .cal-stat-card .val {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
    }
    .cal-stat-card .val.accent { color: var(--accent-light); }
    .cal-stat-card .val.green { color: var(--success); }
    .cal-stat-card .val.red { color: var(--danger); }
    .cal-stat-card .val.orange { color: var(--warning); }

    .cal-cycle-setting {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px;
      margin-bottom: 16px;
    }
    .cal-cycle-setting label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .cal-cycle-setting input {
      width: 100%;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 15px;
      font-family: inherit;
    }
    .cal-cycle-setting input:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 3px rgba(108,92,231,0.2);
    }
    .cal-cycle-setting .hint {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 6px;
    }

    /* Історія */
    .cal-year {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      margin-bottom: 8px;
      overflow: hidden;
    }
    .cal-year-header {
      padding: 12px 14px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }
    .cal-year-header::after {
      content: "▼";
      font-size: 11px;
      transition: transform 0.2s;
    }
    .cal-year.collapsed .cal-year-header::after { transform: rotate(-90deg); }
    .cal-year-content { display: block; }
    .cal-year.collapsed .cal-year-content { display: none; }
    .cal-year-count {
      background: var(--accent);
      color: #fff;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 11px;
    }
    .cal-month-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 14px;
      border-top: 1px solid var(--border);
      font-size: 13px;
    }
    .cal-month-count { color: var(--success); font-weight: 700; }
    .cal-empty {
      text-align: center;
      color: var(--text-muted);
      padding: 40px 20px;
      font-size: 14px;
    }

    /* Модалка */
    .cal-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
      backdrop-filter: blur(4px);
    }
    .cal-modal-overlay.show { display: flex; }

    .cal-modal {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      max-width: 440px;
      width: 100%;
      padding: 20px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .cal-modal h3 {
      font-size: 16px;
      color: var(--text);
      margin-bottom: 4px;
    }
    .cal-modal-date {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    .cal-modal-section {
      margin-bottom: 16px;
    }
    .cal-modal-section-title {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .cal-modal-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cal-modal-buttons button {
      flex: 1;
      min-width: 80px;
      padding: 10px 8px;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: 0.15s;
    }
    .cal-modal-buttons button:hover {
      border-color: var(--accent);
    }
    .cal-modal-buttons button.selected {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .cal-modal-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
    .cal-modal-actions button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      font-family: inherit;
    }
    .cal-btn-save { background: var(--success); color: #062014; }
    .cal-btn-delete { background: rgba(239,68,68,0.15); color: var(--danger); }
    .cal-btn-cancel { background: var(--bg-soft); color: var(--text); }
  `,

  template: `
    <div class="cal-wrap">
      <div class="cal-tabs">
        <button class="cal-tab-btn active" data-tab="calendar">📅 Календар</button>
        <button class="cal-tab-btn" data-tab="history">📊 Історія</button>
        <button class="cal-tab-btn" data-tab="stats">📈 Статистика</button>
      </div>

      <!-- КАЛЕНДАР -->
      <div id="tab-calendar" class="cal-tab-content active">
        <div class="cal-month-nav">
          <button id="prevMonth">◀</button>
          <div>
            <span id="currentMonthLabel">—</span>
            <span class="cal-count-badge" id="monthCount">0</span>
          </div>
          <button id="nextMonth">▶</button>
        </div>

        <div class="cal-weekdays">
          <div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Нд</div>
        </div>
        <div class="cal-days" id="daysGrid"></div>

        <div class="cal-legend">
          <div class="cal-legend-item"><span class="cal-legend-color" style="background:rgba(239,68,68,0.45);"></span> Місячні</div>
          <div class="cal-legend-item"><span class="cal-legend-color" style="background:rgba(239,68,68,0.2);"></span> Мазання</div>
          <div class="cal-legend-item"><span class="cal-legend-color" style="background:rgba(239,68,68,0.1);border-style:dashed;"></span> Прогноз міс.</div>
          <div class="cal-legend-item"><span class="cal-legend-color" style="background:rgba(74,158,255,0.25);"></span> Овуляція</div>
          <div class="cal-legend-item"><span class="cal-legend-color" style="background:rgba(74,222,128,0.2);"></span> Фертильні</div>
          <div class="cal-legend-item"><span class="cal-legend-color" style="background:rgba(245,158,11,0.2);"></span> ПМС</div>
          <div class="cal-legend-item">♥ ⚡ 💦 Секс</div>
        </div>
      </div>

      <!-- ІСТОРІЯ -->
      <div id="tab-history" class="cal-tab-content">
        <div id="historyContainer"></div>
      </div>

      <!-- СТАТИСТИКА -->
      <div id="tab-stats" class="cal-tab-content">
        <div class="cal-cycle-setting">
          <label>Довжина циклу (днів)</label>
          <input type="number" id="cycleLength" min="15" max="60" placeholder="Авто (або 28 за замовчуванням)">
          <div class="hint">Порожньо = авто з історії, або 28 за замовчуванням</div>
        </div>

        <div class="cal-stat-grid">
          <div class="cal-stat-card">
            <div class="lbl">Середній цикл</div>
            <div class="val accent" id="statAvgCycle">—</div>
          </div>
          <div class="cal-stat-card">
            <div class="lbl">Довжина (викор.)</div>
            <div class="val" id="statCycleLen">—</div>
          </div>
          <div class="cal-stat-card">
            <div class="lbl">Останні місячні</div>
            <div class="val red" id="statLastPeriod">—</div>
          </div>
          <div class="cal-stat-card">
            <div class="lbl">Наступні (прогноз)</div>
            <div class="val red" id="statNextPeriod">—</div>
          </div>
          <div class="cal-stat-card">
            <div class="lbl">Овуляція (прогноз)</div>
            <div class="val" id="statOvulation">—</div>
          </div>
          <div class="cal-stat-card">
            <div class="lbl">Поточна фаза</div>
            <div class="val green" id="statPhase">—</div>
          </div>
          <div class="cal-stat-card">
            <div class="lbl">Секс за місяць</div>
            <div class="val" id="statSexMonth">0</div>
          </div>
          <div class="cal-stat-card">
            <div class="lbl">Секс за рік</div>
            <div class="val" id="statSexYear">0</div>
          </div>
        </div>
      </div>

      <!-- МОДАЛКА -->
      <div class="cal-modal-overlay" id="actionModal">
        <div class="cal-modal">
          <h3>📌 Виберіть дію</h3>
          <div class="cal-modal-date" id="modalDate"></div>

          <div class="cal-modal-section">
            <div class="cal-modal-section-title">♥ Секс</div>
            <div class="cal-modal-buttons">
              <button data-sex="none">— Немає</button>
              <button data-sex="normal">♥ Нормальний</button>
              <button data-sex="quick">⚡ Швидкий</button>
              <button data-sex="fast">💦 Швидко кінчив</button>
            </div>
          </div>

          <div class="cal-modal-section">
            <div class="cal-modal-section-title">🩸 Цикл</div>
            <div class="cal-modal-buttons">
              <button data-cycle="none">— Немає</button>
              <button data-cycle="period">🩸 Місячні</button>
              <button data-cycle="spotting">🩸 Мазання</button>
              <button data-cycle="period_predicted">🔮 Прогноз</button>
              <button data-cycle="ovulation">🥚 Овуляція</button>
              <button data-cycle="fertile">🌱 Фертильні</button>
              <button data-cycle="pms">😣 ПМС</button>
            </div>
          </div>

          <div class="cal-modal-actions">
            <button class="cal-btn-save" id="btnSave">✅ Зберегти</button>
            <button class="cal-btn-delete" id="btnDelete">🗑 Видалити</button>
            <button class="cal-btn-cancel" id="btnCancel">Скасувати</button>
          </div>
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

    // Вкладки
    container.querySelectorAll(".cal-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Навігація місяця
    container.querySelector("#prevMonth").addEventListener("click", goPrevMonth);
    container.querySelector("#nextMonth").addEventListener("click", goNextMonth);

    // Модалка — вибір сексу
    container.querySelectorAll("[data-sex]").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.sex;
        modalSex = v === "none" ? null : v;
        updateModalSelection();
      });
    });

    // Модалка — вибір циклу
    container.querySelectorAll("[data-cycle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.cycle;
        modalCycle = v === "none" ? null : v;
        updateModalSelection();
      });
    });

    // Кнопки модалки
    container.querySelector("#btnSave").addEventListener("click", saveModal);
    container.querySelector("#btnDelete").addEventListener("click", deleteModal);
    container.querySelector("#btnCancel").addEventListener("click", closeActionModal);
    container.querySelector("#actionModal").addEventListener("click", (e) => {
      if (e.target.id === "actionModal") closeActionModal();
    });

    // Поле довжини циклу
    container.querySelector("#cycleLength").addEventListener("input", async () => {
      recalcPredictions();
      await save();
      renderCalendar();
      renderStats();
    });

    await load();
    recalcPredictions();
    renderCalendar();
    renderStats();
  },

  async getData() {
    return { records };
  },

  async setData(data) {
    records = (data && data.records) || {};
    recalcPredictions();
    await save();
    if (containerRef) {
      renderCalendar();
      renderStats();
      renderHistory();
    }
  },

  async resetData() {
    records = {};
    await save();
    if (containerRef) {
      renderCalendar();
      renderStats();
      renderHistory();
    }
  }
};