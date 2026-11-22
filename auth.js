(function () {
  // ==========================================================
  // 1. ВСТАВЬ СВОЙ firebaseConfig ИЗ КОНСОЛИ FIREBASE:
  // ==========================================================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDME6EvOZvc0RQ3oapIW9Ypv0tPXbZX1LE",
    authDomain: "physarea-ct.firebaseapp.com",
    projectId: "physarea-ct",
    storageBucket: "physarea-ct.firebasestorage.app",
    messagingSenderId: "956641816650",
    appId: "1:956641816650:web:6eed5426da552c663736b3"
  };

  const LOGIN_DOMAIN = "physarea.ct";
  const TEACHER_EMAIL = "teacher@physarea.ct";
  const FB_VER = "13.2.0";

  // Определяем, где мы находимся: index.html, teacher.html или папка dz1..dz10
  const pathname = window.location.pathname;
  const dzMatch = pathname.match(/\/(dz\d+)(?:\/|$)/i);
  const dzKey = dzMatch ? dzMatch[1].toLowerCase() : null;
  const isTeacherPage = /(?:^|\/)teacher\.html$/i.test(pathname);
  const isIndexPage = !dzKey && !isTeacherPage;
  const rootPrefix = dzKey ? "../" : "";

  let fbAuth = null;
  let fbDb = null;
  let currentUser = null;
  let studentDoc = null;
  let isRestoring = false;
  let hooksInstalled = false;
  let origHandleChoice = null;
  let origValidateCalculation = null;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getLoginFromEmail(email) {
    if (!email) return "";
    return email.endsWith("@" + LOGIN_DOMAIN)
      ? email.slice(0, -LOGIN_DOMAIN.length - 1)
      : email;
  }

  function normalizeEmail(input) {
    const clean = input.trim().toLowerCase();
    if (!clean) return "";
    return clean.includes("@") ? clean : `${clean}@${LOGIN_DOMAIN}`;
  }

  // ==========================================================
  // 2. СТИЛИ ДЛЯ ОКНА ВХОДА, ВЕРХНЕЙ ПАНЕЛИ И ПРОГРЕССА
  // ==========================================================
  function injectStyles() {
    if (document.getElementById("phys-auth-styles")) return;
    const style = document.createElement("style");
    style.id = "phys-auth-styles";
    style.textContent = `
      .phys-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(6, 7, 12, 0.88);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .phys-overlay.hidden { display: none !important; }
      .phys-modal {
        width: 100%;
        max-width: 400px;
        background: rgba(18, 22, 34, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        padding: 28px 24px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
        color: #f8fafc;
        text-align: center;
      }
      .phys-modal-badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #a5b4fc;
        background: rgba(99, 102, 241, 0.14);
        border: 1px solid rgba(99, 102, 241, 0.3);
        padding: 4px 12px;
        border-radius: 999px;
        margin-bottom: 14px;
      }
      .phys-modal h2 {
        font-size: 24px;
        font-weight: 800;
        margin-bottom: 6px;
        color: #ffffff;
      }
      .phys-modal p {
        font-size: 14px;
        color: #94a3b8;
        margin-bottom: 22px;
      }
      .phys-field {
        text-align: left;
        margin-bottom: 14px;
      }
      .phys-field label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        color: #cbd5e1;
        margin-bottom: 6px;
      }
      .phys-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .phys-input {
        width: 100%;
        background: rgba(9, 11, 18, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        padding: 13px 14px;
        font-size: 16px;
        color: #ffffff;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .phys-input:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
      }
      .phys-eye-btn {
        position: absolute;
        right: 10px;
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        padding: 6px 8px;
        font-family: inherit;
      }
      .phys-login-btn {
        width: 100%;
        margin-top: 8px;
        padding: 14px;
        border: none;
        border-radius: 12px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
        color: #ffffff;
        font-size: 16px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
        transition: opacity 0.2s, transform 0.15s;
      }
      .phys-login-btn:active { transform: scale(0.98); }
      .phys-login-btn:disabled { opacity: 0.6; cursor: wait; }
      .phys-error {
        display: none;
        margin-top: 14px;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(244, 63, 94, 0.14);
        border: 1px solid rgba(244, 63, 94, 0.35);
        color: #fda4af;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
      }
      .phys-error.visible { display: block; }

      /* Верхняя панель на страницах ДЗ */
      .phys-dz-topbar {
        position: sticky;
        top: 0;
        z-index: 90;
        background: rgba(9, 10, 16, 0.82);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-family: "Plus Jakarta Sans", -apple-system, sans-serif;
      }
      .phys-topbar-left, .phys-topbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .phys-pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        text-decoration: none;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e2e8f0;
        font-size: 13px;
        font-weight: 700;
        font-family: inherit;
        padding: 7px 12px;
        border-radius: 10px;
        cursor: pointer;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
      }
      .phys-pill-btn:active { transform: scale(0.97); }
      .phys-pill-btn.teacher-btn {
        background: rgba(99, 102, 241, 0.16);
        border-color: rgba(99, 102, 241, 0.35);
        color: #c7d2fe;
      }
      .phys-user-chip {
        font-size: 13px;
        font-weight: 700;
        color: #cbd5e1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 150px;
      }
      .phys-score-chip {
        font-size: 12px;
        font-weight: 700;
        font-family: "JetBrains Mono", monospace;
        color: #6ee7b7;
        background: rgba(16, 185, 129, 0.14);
        border: 1px solid rgba(16, 185, 129, 0.3);
        padding: 5px 10px;
        border-radius: 8px;
        white-space: nowrap;
      }

      /* Панель пользователя на index.html */
      .phys-index-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        background: rgba(18, 22, 34, 0.72);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 12px 16px;
        margin-bottom: 20px;
        backdrop-filter: blur(16px);
      }
      .phys-dz-progress-badge {
        position: relative;
        z-index: 1;
        font-size: 12px;
        font-weight: 700;
        font-family: "JetBrains Mono", monospace;
        padding: 4px 10px;
        border-radius: 999px;
        white-space: nowrap;
        flex-shrink: 0;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #cbd5e1;
      }
      .phys-dz-progress-badge.all-ok {
        background: rgba(16, 185, 129, 0.16);
        border-color: rgba(16, 185, 129, 0.35);
        color: #6ee7b7;
      }

      @media (max-width: 520px) {
        .phys-dz-topbar { padding: 8px 12px; }
        .phys-pill-btn { padding: 6px 10px; font-size: 12px; }
        .phys-user-chip { max-width: 95px; font-size: 12px; }
        .phys-score-chip { font-size: 11px; padding: 4px 8px; }
      }
    `;
    document.head.appendChild(style);
  }

  // ==========================================================
  // 3. ОКНО ВХОДА
  // ==========================================================
  function buildOverlay() {
    if (document.getElementById("phys-auth-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "phys-auth-overlay";
    overlay.className = "phys-overlay";
    overlay.innerHTML = `
      <div class="phys-modal">
        <div class="phys-modal-badge">@physarea.ct • Физика</div>
        <div id="phys-loading-state">
          <h2>Загрузка...</h2>
          <p style="margin-bottom:0">Проверяем авторизацию</p>
        </div>
        <form id="phys-login-form" style="display:none" novalidate>
          <h2>Вход в аккаунт</h2>
          <p>Введите логин и пароль, выданные преподавателем</p>
          <div class="phys-field">
            <label for="phys-login-inp">Логин</label>
            <input class="phys-input" id="phys-login-inp" type="text" placeholder="Например: ivan"
              autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required />
          </div>
          <div class="phys-field">
            <label for="phys-pass-inp">Пароль</label>
            <div class="phys-input-wrap">
              <input class="phys-input" id="phys-pass-inp" type="password" placeholder="••••••"
                autocomplete="current-password" style="padding-right: 78px;" required />
              <button type="button" class="phys-eye-btn" id="phys-toggle-pass">Показать</button>
            </div>
          </div>
          <button type="submit" class="phys-login-btn" id="phys-submit-btn">Войти</button>
          <div class="phys-error" id="phys-login-err"></div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const toggleBtn = document.getElementById("phys-toggle-pass");
    const passInp = document.getElementById("phys-pass-inp");
    toggleBtn.addEventListener("click", () => {
      const isPass = passInp.type === "password";
      passInp.type = isPass ? "text" : "password";
      toggleBtn.textContent = isPass ? "Скрыть" : "Показать";
    });

    const form = document.getElementById("phys-login-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const loginRaw = document.getElementById("phys-login-inp").value;
      const password = passInp.value;
      const errBox = document.getElementById("phys-login-err");
      const submitBtn = document.getElementById("phys-submit-btn");

      errBox.classList.remove("visible");

      if (!loginRaw.trim() || !password) {
        errBox.textContent = "Введите логин и пароль.";
        errBox.classList.add("visible");
        return;
      }

      const email = normalizeEmail(loginRaw);
      submitBtn.disabled = true;
      submitBtn.textContent = "Вход...";

      try {
        await fbAuth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        let msg = "Не удалось войти. Проверьте логин и пароль.";
        if (err.code === "auth/too-many-requests") {
          msg = "Слишком много попыток входа. Подождите пару минут.";
        } else if (err.code === "auth/network-request-failed") {
          msg = "Ошибка сети. Проверьте интернет-соединение.";
        } else if (err.code === "auth/unauthorized-domain") {
          msg = "Добавьте домен сайта в Firebase (Authentication → Settings → Authorized domains).";
        }
        errBox.textContent = msg;
        errBox.classList.add("visible");
        submitBtn.disabled = false;
        submitBtn.textContent = "Войти";
      }
    });
  }

  function showLoginForm(customError) {
    const overlay = document.getElementById("phys-auth-overlay");
    const loading = document.getElementById("phys-loading-state");
    const form = document.getElementById("phys-login-form");
    const errBox = document.getElementById("phys-login-err");
    const submitBtn = document.getElementById("phys-submit-btn");

    if (!overlay) return;
    overlay.classList.remove("hidden");
    loading.style.display = "none";
    form.style.display = "block";
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Войти";
    }
    if (customError) {
      errBox.textContent = customError;
      errBox.classList.add("visible");
    }
  }

  function hideOverlay() {
    const overlay = document.getElementById("phys-auth-overlay");
    if (overlay) overlay.classList.add("hidden");
  }

  // ==========================================================
  // 4. ВЕРХНЯЯ ПАНЕЛЬ НАВИГАЦИИ И ПРОГРЕССА
  // ==========================================================
  function renderTopBar(user) {
    const isTeacher = user.email === TEACHER_EMAIL;
    const displayName = studentDoc?.displayName || getLoginFromEmail(user.email);

    if (dzKey) {
      let bar = document.getElementById("phys-dz-topbar");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "phys-dz-topbar";
        bar.className = "phys-dz-topbar";
        document.body.prepend(bar);
        // Убираем лишний верхний отступ у старых ДЗ
        if (parseInt(getComputedStyle(document.body).paddingTop, 10) > 20) {
          document.body.style.paddingTop = "0";
        }
      }

      const teacherLink = isTeacher
        ? `<a class="phys-pill-btn teacher-btn" href="${rootPrefix}teacher.html">Учителю</a>`
        : "";

      bar.innerHTML = `
        <div class="phys-topbar-left">
          <a class="phys-pill-btn" href="${rootPrefix}index.html">← Все ДЗ</a>
          <span class="phys-score-chip" id="phys-dz-score">0 / 0</span>
        </div>
        <div class="phys-topbar-right">
          ${teacherLink}
          <span class="phys-user-chip" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
          <button class="phys-pill-btn" id="phys-logout-btn" type="button">Выйти</button>
        </div>
      `;
      updateDzScoreChip();
    } else if (isIndexPage) {
      const mainEl = document.querySelector("main");
      if (!mainEl) return;
      let bar = document.getElementById("phys-index-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "phys-index-bar";
        bar.className = "phys-index-bar";
        mainEl.prepend(bar);
      }

      const teacherLink = isTeacher
        ? `<a class="phys-pill-btn teacher-btn" href="teacher.html">Панель учителя</a>`
        : "";

      bar.innerHTML = `
        <div class="phys-topbar-left">
          <span class="phys-user-chip" style="max-width:200px">👤 ${escapeHtml(displayName)}</span>
        </div>
        <div class="phys-topbar-right">
          ${teacherLink}
          <button class="phys-pill-btn" id="phys-logout-btn" type="button">Выйти</button>
        </div>
      `;
    }

    const logoutBtn = document.getElementById("phys-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => fbAuth.signOut());
    }
  }

  function updateDzScoreChip() {
    const chip = document.getElementById("phys-dz-score");
    if (!chip || !dzKey) return;
    const total = document.querySelectorAll('[id^="task-"]').length;
    const savedDz = studentDoc?.dz?.[dzKey] || {};
    const ok = Object.values(savedDz).filter((t) => t && t.isCorrect).length;
    chip.textContent = `${ok} / ${total}`;
  }

  function renderIndexProgressBadges() {
    if (!isIndexPage) return;
    const dzMap = studentDoc?.dz || {};
    const metaMap = studentDoc?.dzMeta || {};

    document.querySelectorAll(".nav-btn[href]").forEach((btn) => {
      const href = btn.getAttribute("href") || "";
      const m = href.match(/^(dz\d+)\//i);
      if (!m) return;
      const key = m[1].toLowerCase();
      const tasks = dzMap[key];
      const existing = btn.querySelector(".phys-dz-progress-badge");
      if (existing) existing.remove();
      if (!tasks) return;

      const values = Object.values(tasks);
      if (values.length === 0) return;

      const okCount = values.filter((t) => t && t.isCorrect).length;
      const total = metaMap[key]?.total;
      const badge = document.createElement("span");
      badge.className = "phys-dz-progress-badge" + (total && okCount >= total ? " all-ok" : "");
      badge.textContent = total ? `${okCount}/${total} ✓` : `${okCount} ✓`;

      const arrow = btn.querySelector(".btn-arrow");
      if (arrow) btn.insertBefore(badge, arrow);
      else btn.appendChild(badge);
    });
  }

  // ==========================================================
  // 5. ПЕРЕХВАТ ЗАДАЧ И ВОССТАНОВЛЕНИЕ ОТВЕТОВ (ОБА ШАБЛОНА)
  // ==========================================================
  function installTaskHooks() {
    if (!dzKey || hooksInstalled) return;
    if (typeof window.handleChoice === "function" && typeof window.validateCalculation === "function") {
      hooksInstalled = true;
      origHandleChoice = window.handleChoice;
      origValidateCalculation = window.validateCalculation;

      window.handleChoice = function (taskId, value, buttonEl) {
        const res = origHandleChoice.apply(this, arguments);
        if (!isRestoring) {
          const statusEl =
            document.getElementById("status-" + taskId) ||
            document.getElementById("fb-" + taskId);
          const isCorrect = statusEl ? statusEl.classList.contains("correct") : false;
          saveTaskAttempt(taskId, "choice", String(value), isCorrect);
        }
        return res;
      };

      window.validateCalculation = function (taskId) {
        const inp =
          document.getElementById("inp-" + taskId) ||
          document.getElementById("calc-" + taskId + "-input");
        const rawVal = inp ? inp.value.trim() : "";
        const res = origValidateCalculation.apply(this, arguments);

        if (!isRestoring && rawVal) {
          const statusEl =
            document.getElementById("status-" + taskId) ||
            document.getElementById("fb-" + taskId);
          const fbText = statusEl ? statusEl.textContent : "";
          if (!fbText.includes("введите числовое")) {
            const isCorrect = statusEl ? statusEl.classList.contains("correct") : false;
            saveTaskAttempt(taskId, "calc", rawVal, isCorrect);
          }
        }
        return res;
      };
    }
  }

  async function saveTaskAttempt(taskId, type, answer, isCorrect) {
    if (!currentUser || !fbDb || !dzKey) return;

    const tKey = "t" + taskId;
    const totalTasks = document.querySelectorAll('[id^="task-"]').length;

    if (!studentDoc) studentDoc = { dz: {}, dzMeta: {} };
    if (!studentDoc.dz) studentDoc.dz = {};
    if (!studentDoc.dz[dzKey]) studentDoc.dz[dzKey] = {};
    if (!studentDoc.dzMeta) studentDoc.dzMeta = {};

    const prev = studentDoc.dz[dzKey][tKey];
    const nowIso = new Date().toISOString();
    const loginName = getLoginFromEmail(currentUser.email);

    const taskPayload = {
      answer: String(answer),
      type: type,
      isCorrect: Boolean(isCorrect),
      attempts: (prev?.attempts || 0) + 1,
      firstCorrect: prev !== undefined ? Boolean(prev.firstCorrect) : Boolean(isCorrect),
      firstAnswer: prev !== undefined ? String(prev.firstAnswer) : String(answer),
      updatedAt: nowIso
    };

    studentDoc.dz[dzKey][tKey] = taskPayload;
    studentDoc.dzMeta[dzKey] = { total: totalTasks };
    updateDzScoreChip();

    try {
      await fbDb
        .collection("students")
        .doc(currentUser.uid)
        .set(
          {
            login: loginName,
            email: currentUser.email,
            updatedAt: nowIso,
            dzMeta: {
              [dzKey]: { total: totalTasks }
            },
            dz: {
              [dzKey]: {
                [tKey]: taskPayload
              }
            }
          },
          { merge: true }
        );
    } catch (err) {
      console.error("Ошибка сохранения ответа:", err);
    }
  }

  function restoreSavedDzState() {
    if (!dzKey || !studentDoc?.dz?.[dzKey]) return;
    installTaskHooks();
    if (!origHandleChoice || !origValidateCalculation) return;

    const savedDz = studentDoc.dz[dzKey];
    isRestoring = true;
    try {
      Object.entries(savedDz).forEach(([tKey, entry]) => {
        if (!entry) return;
        const taskId = Number(tKey.replace(/^t/, ""));
        const card = document.getElementById("task-" + taskId);
        if (!card) return;

        if (entry.type === "choice") {
          const btns = card.querySelectorAll(".btn-option");
          const targetBtn = btns[Number(entry.answer) - 1];
          if (targetBtn) {
            const onclickAttr = targetBtn.getAttribute("onclick") || "";
            const expectsString = /handleChoice\(\s*\d+\s*,\s*['"]/.test(onclickAttr);
            origHandleChoice(
              taskId,
              expectsString ? String(entry.answer) : Number(entry.answer),
              targetBtn
            );
          }
        } else if (entry.type === "calc") {
          const inp =
            document.getElementById("inp-" + taskId) ||
            document.getElementById("calc-" + taskId + "-input");
          if (inp) {
            inp.value = entry.answer;
            origValidateCalculation(taskId);
          }
        }
      });
    } finally {
      isRestoring = false;
      updateDzScoreChip();
    }
  }

  // ==========================================================
  // 6. ЗАГРУЗКА FIREBASE SDK И СТАРТ
  // ==========================================================
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Ошибка загрузки " + src));
      document.head.appendChild(s);
    });
  }

  async function init() {
    injectStyles();
    buildOverlay();
    installTaskHooks();

    if (window.location.protocol === "file:") {
      showLoginForm("Для работы аккаунтов откройте сайт через GitHub Pages или Live Server (не через file://).");
      return;
    }

    if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.includes("ВСТАВЬ_СЮДА")) {
      showLoginForm("Не вставлен firebaseConfig в файле auth.js.");
      return;
    }

    try {
      await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore-compat.js`);

      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      fbAuth = firebase.auth();
      fbDb = firebase.firestore();

      window.PhysAuth = {
        getAuth: () => fbAuth,
        getDb: () => fbDb,
        getUser: () => currentUser,
        isTeacher: () => currentUser && currentUser.email === TEACHER_EMAIL,
        teacherEmail: TEACHER_EMAIL,
        loginDomain: LOGIN_DOMAIN,
        getLoginFromEmail,
        escapeHtml
      };

      fbAuth.onAuthStateChanged(async (user) => {
        currentUser = user;
        if (!user) {
          studentDoc = null;
          showLoginForm();
          window.dispatchEvent(new CustomEvent("physauth:ready", { detail: { user: null } }));
          return;
        }

        try {
          const docSnap = await fbDb.collection("students").doc(user.uid).get();
          if (docSnap.exists) {
            studentDoc = docSnap.data();
          } else {
            const loginName = getLoginFromEmail(user.email);
            studentDoc = { login: loginName, email: user.email, dz: {}, dzMeta: {} };
            // Создаём карточку ученика сразу после первого входа (чтобы учитель видел его в списке)
            if (user.email !== TEACHER_EMAIL) {
              fbDb
                .collection("students")
                .doc(user.uid)
                .set({ login: loginName, email: user.email, updatedAt: new Date().toISOString() }, { merge: true })
                .catch(() => {});
            }
          }
        } catch (err) {
          console.error("Ошибка загрузки профиля:", err);
          studentDoc = { dz: {}, dzMeta: {} };
        }

        hideOverlay();
        renderTopBar(user);
        renderIndexProgressBadges();
        restoreSavedDzState();

        window.dispatchEvent(new CustomEvent("physauth:ready", { detail: { user, studentDoc } }));
      });
    } catch (err) {
      console.error(err);
      showLoginForm("Не удалось загрузить Firebase. Проверьте интернет-соединение.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();