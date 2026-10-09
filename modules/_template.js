export default {
  id: "template",
  title: "Шаблон",
  icon: "🧩",

  // CSS цього модуля (використовує змінні з style.css)
  styles: `
    .my-module-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .my-module-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 12px;
    }
  `,

  // HTML модуля
  template: `
    <div class="my-module-title">Приклад модуля</div>
    <div class="my-module-card">
      <p>Тут буде твій контент.</p>
      <button class="btn" id="testBtn">Тест</button>
    </div>
  `,

  // Логіка модуля
  init(container) {
    // Підключаємо CSS один раз
    if (!document.getElementById(`style-${this.id}`)) {
      const style = document.createElement("style");
      style.id = `style-${this.id}`;
      style.textContent = this.styles;
      document.head.appendChild(style);
    }

    // Рендеримо HTML
    container.innerHTML = this.template;

    // Обробники подій
    container.querySelector("#testBtn").addEventListener("click", () => {
      alert("Працює!");
    });
  },

  // Для пакетного експорту
  getData() {
    return {};
  },

  setData(data) {
    // тут відновлення з data
  },

  resetData() {
    // тут очищення
  }
};