"use strict";

// Anniversary - 画面表示、日付計算、端末内保存をこのファイルで管理します。
(() => {
  const STORAGE_KEY = "mellowDays.anniversaries.v1";
  const STANDARD_MILESTONES = [50, 100, 200, 300, 500, 1000, 1500, 2000];
  const ANNIVERSARY_YEARS = [1, 2, 3, 5, 10];
  const DAY_MS = 24 * 60 * 60 * 1000;

  const state = {
    anniversaries: [],
    currentView: "home",
    selectedAnniversaryId: null,
    formMode: "create",
    detailTab: "future",
    visibleMilestones: 10,
    formSnapshot: "",
    homeScrollY: 0,
  };

  const views = {
    home: document.querySelector("#home-view"),
    detail: document.querySelector("#detail-view"),
    form: document.querySelector("#form-view"),
  };

  const elements = {
    count: document.querySelector("#anniversary-count"),
    list: document.querySelector("#anniversary-list"),
    empty: document.querySelector("#empty-state"),
    addButton: document.querySelector("#add-button"),
    emptyAddButton: document.querySelector("#empty-add-button"),
    detailContent: document.querySelector("#detail-content"),
    detailBackButton: document.querySelector("#detail-back-button"),
    detailEditButton: document.querySelector("#detail-edit-button"),
    form: document.querySelector("#anniversary-form"),
    formTitle: document.querySelector("#form-title"),
    formBackButton: document.querySelector("#form-back-button"),
    titleInput: document.querySelector("#title-input"),
    dateInput: document.querySelector("#date-input"),
    memoInput: document.querySelector("#memo-input"),
    memoCount: document.querySelector("#memo-count"),
    milestonesInput: document.querySelector("#milestones-input"),
    saveButton: document.querySelector("#save-button"),
    deleteButton: document.querySelector("#delete-button"),
    deleteModal: document.querySelector("#delete-modal"),
    deleteModalMessage: document.querySelector("#delete-modal-message"),
    deleteCancelButton: document.querySelector("#delete-cancel-button"),
    deleteConfirmButton: document.querySelector("#delete-confirm-button"),
    toast: document.querySelector("#toast"),
  };

  let toastTimer = null;
  let dateCheckTimer = null;
  let lastRenderedDate = getTodayYmd();

  function parseYmd(ymd) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) return null;
    return date;
  }

  function toYmd(date) {
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  function getTodayYmd() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function diffCalendarDays(fromYmd, toYmdValue) {
    const from = parseYmd(fromYmd);
    const to = parseYmd(toYmdValue);
    if (!from || !to) return 0;
    return Math.round((to.getTime() - from.getTime()) / DAY_MS);
  }

  function addCalendarDays(baseYmd, amount) {
    const date = parseYmd(baseYmd);
    date.setUTCDate(date.getUTCDate() + amount);
    return toYmd(date);
  }

  function getElapsedDays(baseDate, today = getTodayYmd()) {
    return diffCalendarDays(baseDate, today) + 1;
  }

  function getMilestoneDate(baseDate, dayNumber) {
    return addCalendarDays(baseDate, dayNumber - 1);
  }

  function getAnniversaryDate(baseDate, years) {
    const base = parseYmd(baseDate);
    const targetYear = base.getUTCFullYear() + years;
    const month = base.getUTCMonth();
    const day = base.getUTCDate();
    if (month === 1 && day === 29) {
      const leapDate = new Date(Date.UTC(targetYear, 1, 29));
      if (leapDate.getUTCMonth() !== 1) return `${targetYear}-02-28`;
    }
    return toYmd(new Date(Date.UTC(targetYear, month, day)));
  }

  function formatDate(ymd) {
    return ymd.replace(/-/g, ".");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ja-JP").format(value);
  }

  function isStandardMilestone(value) {
    return STANDARD_MILESTONES.includes(value) || (value >= 2500 && value % 500 === 0);
  }

  function getDayMilestoneNumbers(anniversary, today = getTodayYmd()) {
    const elapsed = getElapsedDays(anniversary.baseDate, today);
    const custom = Array.isArray(anniversary.customMilestones) ? anniversary.customMilestones : [];
    const maxCustom = custom.length ? Math.max(...custom) : 0;
    const generationLimit = Math.max(7000, elapsed + 5500, maxCustom);
    const values = [...STANDARD_MILESTONES, ...custom];
    for (let value = 2500; value <= generationLimit; value += 500) values.push(value);
    return [...new Set(values)].filter((value) => value >= 1).sort((a, b) => a - b);
  }

  function getNextDayMilestone(anniversary, today = getTodayYmd()) {
    const values = getDayMilestoneNumbers(anniversary, today);
    let dayNumber = values.find((value) => getMilestoneDate(anniversary.baseDate, value) >= today);
    if (!dayNumber) {
      const elapsed = getElapsedDays(anniversary.baseDate, today);
      dayNumber = Math.max(2500, Math.ceil(elapsed / 500) * 500);
    }
    const date = getMilestoneDate(anniversary.baseDate, dayNumber);
    return { dayNumber, date, remainingDays: diffCalendarDays(today, date) };
  }

  function getAllMilestones(anniversary, today = getTodayYmd()) {
    const dayMilestones = getDayMilestoneNumbers(anniversary, today).map((dayNumber) => ({
      type: "days",
      value: dayNumber,
      label: `${formatNumber(dayNumber)}日目`,
      date: getMilestoneDate(anniversary.baseDate, dayNumber),
    }));
    const anniversaries = ANNIVERSARY_YEARS.map((years) => ({
      type: "anniversary",
      value: years,
      label: `${years}周年`,
      date: getAnniversaryDate(anniversary.baseDate, years),
    }));
    return [...dayMilestones, ...anniversaries].sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      return dateOrder || a.type.localeCompare(b.type);
    });
  }

  function createId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isUsableRecord(record) {
    return record && typeof record === "object" && typeof record.id === "string" &&
      typeof record.title === "string" && parseYmd(record.baseDate);
  }

  function loadAnniversaries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.anniversaries)) {
        console.warn("記念日データの形式が正しくありません。空の状態で起動します。");
        return [];
      }
      const validRecords = data.anniversaries.filter(isUsableRecord);
      if (validRecords.length !== data.anniversaries.length) {
        console.warn("読み込めない記念日データを除外しました。保存データは上書きしていません。");
      }
      return validRecords;
    } catch (error) {
      console.warn("記念日データを読み込めませんでした", error);
      return [];
    }
  }

  function saveAnniversaries(anniversaries) {
    const data = { version: 1, anniversaries };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function makeElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("is-error", isError);
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3200);
  }

  function setView(viewName) {
    Object.entries(views).forEach(([name, view]) => {
      const active = name === viewName;
      view.hidden = !active;
      view.classList.toggle("is-active", active);
    });
    state.currentView = viewName;
  }

  function navigate(viewName, options = {}, pushHistory = true) {
    if (state.currentView === "home") state.homeScrollY = window.scrollY;
    if (options.id !== undefined) state.selectedAnniversaryId = options.id;
    if (options.mode) state.formMode = options.mode;
    state.detailTab = options.tab || "future";
    state.visibleMilestones = 10;

    if (viewName !== "home" && state.selectedAnniversaryId && !findSelected()) {
      viewName = "home";
      state.selectedAnniversaryId = null;
    }

    setView(viewName);
    renderCurrentView();
    if (pushHistory) {
      history.pushState({ view: viewName, id: state.selectedAnniversaryId, mode: state.formMode }, "");
    }
    requestAnimationFrame(() => {
      window.scrollTo({ top: viewName === "home" ? state.homeScrollY : 0, behavior: "auto" });
    });
  }

  function findSelected() {
    return state.anniversaries.find((item) => item.id === state.selectedAnniversaryId) || null;
  }

  function renderCurrentView() {
    lastRenderedDate = getTodayYmd();
    elements.dateInput.max = lastRenderedDate;
    if (state.currentView === "home") renderHome();
    if (state.currentView === "detail") renderDetail();
    if (state.currentView === "form") renderForm();
  }

  function renderHome() {
    elements.list.replaceChildren();
    elements.count.textContent = `${state.anniversaries.length}件`;
    const isEmpty = state.anniversaries.length === 0;
    elements.empty.hidden = !isEmpty;
    elements.addButton.hidden = isEmpty;
    state.anniversaries.forEach((anniversary) => {
      elements.list.append(createAnniversaryCard(anniversary));
    });
  }

  function createAnniversaryCard(anniversary) {
    const today = getTodayYmd();
    const elapsed = getElapsedDays(anniversary.baseDate, today);
    const next = getNextDayMilestone(anniversary, today);
    const card = makeElement("button", "anniversary-card");
    card.type = "button";
    card.setAttribute("aria-label", `${anniversary.title}の詳細を見る。今日で${elapsed}日目`);

    const titleRow = makeElement("div", "card-title-row");
    titleRow.append(makeElement("h3", "card-title", anniversary.title));
    titleRow.append(makeElement("span", "card-arrow", "→"));

    const elapsedLine = makeElement("p", "card-elapsed");
    const elapsedStrong = makeElement("strong", "", formatNumber(elapsed));
    elapsedLine.append(elapsedStrong, document.createTextNode(" days"));

    const baseDate = makeElement("p", "card-date", `${formatDate(anniversary.baseDate)} から`);
    const nextBox = makeElement("div", "card-next");
    nextBox.append(makeElement("span", "card-next-label", "NEXT MILESTONE"));
    nextBox.append(makeElement("span", "card-next-days", next.remainingDays === 0 ? "Today" : `あと ${formatNumber(next.remainingDays)}日`));
    const nextTitle = makeElement("p", "card-next-title", `${formatNumber(next.dayNumber)}日目`);
    nextTitle.append(makeElement("span", "card-next-date", formatDate(next.date)));
    nextBox.append(nextTitle);

    card.append(titleRow, elapsedLine, baseDate, nextBox);
    card.addEventListener("click", () => navigate("detail", { id: anniversary.id }));
    return card;
  }

  function renderDetail() {
    const anniversary = findSelected();
    if (!anniversary) {
      navigate("home", { id: null }, false);
      return;
    }
    const today = getTodayYmd();
    const elapsed = getElapsedDays(anniversary.baseDate, today);
    const next = getNextDayMilestone(anniversary, today);
    const content = document.createDocumentFragment();

    const hero = makeElement("section", "detail-hero");
    const name = makeElement("h2", "detail-name", anniversary.title);
    name.id = "detail-title";
    hero.append(name);
    hero.append(makeElement("p", "detail-base-date", `${formatDate(anniversary.baseDate)} から`));
    hero.append(makeElement("p", "today-label", "TODAY IS"));
    const elapsedLine = makeElement("p", "elapsed-number");
    elapsedLine.append(makeElement("strong", "", formatNumber(elapsed)), document.createTextNode(" days"));
    hero.append(elapsedLine, makeElement("p", "elapsed-caption", `今日で${formatNumber(elapsed)}日目`));

    const nextCard = makeElement("section", "next-milestone-card");
    nextCard.append(makeElement("p", "section-kicker", "NEXT MILESTONE"));
    const nextMain = makeElement("div", "next-main");
    nextMain.append(makeElement("h3", "", `${formatNumber(next.dayNumber)}日目`));
    nextMain.append(makeElement("p", "next-remaining", next.remainingDays === 0 ? "Today / 今日が記念日" : `あと ${formatNumber(next.remainingDays)}日`));
    nextCard.append(nextMain, makeElement("p", "next-date", formatDate(next.date)));

    content.append(hero, nextCard, createMilestoneSection(anniversary, today));

    if (anniversary.memo) {
      const memo = makeElement("section", "detail-memo");
      memo.append(makeElement("h3", "", "メモ"), makeElement("p", "", anniversary.memo));
      content.append(memo);
    }

    const editBottom = makeElement("button", "primary-button detail-edit-bottom", "この記念日を編集");
    editBottom.type = "button";
    editBottom.addEventListener("click", () => navigate("form", { id: anniversary.id, mode: "edit" }));
    content.append(editBottom);
    elements.detailContent.replaceChildren(content);
  }

  function createMilestoneSection(anniversary, today) {
    const section = makeElement("section", "milestone-section");
    const headingRow = makeElement("div", "milestone-heading-row");
    headingRow.append(makeElement("h3", "", "節目の記録"));

    const segments = makeElement("div", "segment-control");
    segments.setAttribute("role", "group");
    segments.setAttribute("aria-label", "節目の表示範囲");
    [["past", "過去"], ["future", "これから"]].forEach(([value, label]) => {
      const button = makeElement("button", "", label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.detailTab === value));
      button.addEventListener("click", () => {
        state.detailTab = value;
        state.visibleMilestones = 10;
        renderDetail();
      });
      segments.append(button);
    });
    headingRow.append(segments);
    section.append(headingRow);

    const all = getAllMilestones(anniversary, today);
    const filtered = all.filter((item) => state.detailTab === "future" ? item.date >= today : item.date < today);
    if (state.detailTab === "past") filtered.reverse();
    const list = makeElement("div", "milestone-list");
    filtered.slice(0, state.visibleMilestones).forEach((item) => list.append(createMilestoneRow(item, today)));
    section.append(list);

    if (filtered.length > state.visibleMilestones) {
      const more = makeElement("button", "load-more-button", "さらに表示");
      more.type = "button";
      more.addEventListener("click", () => {
        state.visibleMilestones += 10;
        renderDetail();
      });
      section.append(more);
    }
    return section;
  }

  function createMilestoneRow(item, today) {
    const remaining = diffCalendarDays(today, item.date);
    const row = makeElement("div", `milestone-row${remaining === 0 ? " is-today" : ""}`);
    row.append(makeElement("span", "timeline-dot"));
    const copy = makeElement("div", "");
    const label = makeElement("p", "milestone-value", item.label);
    if (item.type === "anniversary") label.append(makeElement("span", "anniversary-tag", "ANNIVERSARY"));
    copy.append(label, makeElement("p", "milestone-date", formatDate(item.date)));
    row.append(copy);
    let remainingText;
    if (remaining === 0) remainingText = "Today / 今日が記念日";
    else if (remaining > 0) remainingText = `あと${formatNumber(remaining)}日`;
    else remainingText = `${formatNumber(Math.abs(remaining))}日前`;
    row.append(makeElement("p", "milestone-remaining", remainingText));
    return row;
  }

  function renderForm() {
    const editing = state.formMode === "edit";
    const anniversary = editing ? findSelected() : null;
    if (editing && !anniversary) {
      navigate("home", { id: null }, false);
      return;
    }
    elements.form.reset();
    clearErrors();
    elements.formTitle.textContent = editing ? "記念日を編集" : "記念日を追加";
    elements.saveButton.textContent = editing ? "変更を保存" : "保存する";
    elements.deleteButton.hidden = !editing;
    elements.dateInput.max = getTodayYmd();
    if (anniversary) {
      elements.titleInput.value = anniversary.title;
      elements.dateInput.value = anniversary.baseDate;
      elements.memoInput.value = anniversary.memo || "";
      elements.milestonesInput.value = (anniversary.customMilestones || []).join(", ");
      if (elements.milestonesInput.value) elements.milestonesInput.closest("details").open = true;
    }
    updateMemoCount();
    state.formSnapshot = getFormSnapshot();
  }

  function getFormSnapshot() {
    return JSON.stringify({
      title: elements.titleInput.value,
      baseDate: elements.dateInput.value,
      memo: elements.memoInput.value,
      customMilestones: elements.milestonesInput.value,
    });
  }

  function isFormDirty() {
    return state.currentView === "form" && getFormSnapshot() !== state.formSnapshot;
  }

  function confirmDiscard() {
    return !isFormDirty() || window.confirm("入力中の内容を破棄して戻りますか？");
  }

  function parseCustomMilestones(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return { values: [], error: "" };
    const tokens = trimmed.split(/[,、]/).map((value) => value.trim());
    const invalid = tokens.find((value) => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000);
    if (invalid !== undefined) {
      return { values: [], error: `「${invalid || "空の値"}」は1〜100,000の整数で入力してください。` };
    }
    const values = [...new Set(tokens.map(Number))]
      .filter((value) => !isStandardMilestone(value))
      .sort((a, b) => a - b);
    return { values, error: "" };
  }

  function validateForm() {
    clearErrors();
    const title = elements.titleInput.value.trim();
    const baseDate = elements.dateInput.value;
    const memo = elements.memoInput.value;
    const custom = parseCustomMilestones(elements.milestonesInput.value);
    const errors = [];

    if (!title) errors.push(["title", "記念日の名前を入力してください。", elements.titleInput]);
    else if ([...title].length > 32) errors.push(["title", "記念日の名前は32文字以内で入力してください。", elements.titleInput]);

    if (!baseDate) errors.push(["date", "基準日を入力してください。", elements.dateInput]);
    else if (!parseYmd(baseDate)) errors.push(["date", "正しい日付を入力してください。", elements.dateInput]);
    else if (baseDate > getTodayYmd()) errors.push(["date", "基準日は今日以前の日付を選んでください。", elements.dateInput]);

    if ([...memo].length > 120) errors.push(["memo", "メモは120文字以内で入力してください。", elements.memoInput]);
    if (custom.error) errors.push(["milestones", custom.error, elements.milestonesInput]);

    errors.forEach(([name, message, input]) => setError(name, message, input));
    if (errors.length) {
      const firstInput = errors[0][2];
      if (firstInput === elements.milestonesInput) firstInput.closest("details").open = true;
      firstInput.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => firstInput.focus({ preventScroll: true }), 180);
      return null;
    }
    return { title, baseDate, memo, customMilestones: custom.values };
  }

  function setError(name, message, input) {
    document.querySelector(`#${name}-error`).textContent = message;
    input.setAttribute("aria-invalid", "true");
  }

  function clearErrors() {
    ["title", "date", "memo", "milestones"].forEach((name) => {
      document.querySelector(`#${name}-error`).textContent = "";
    });
    [elements.titleInput, elements.dateInput, elements.memoInput, elements.milestonesInput]
      .forEach((input) => input.removeAttribute("aria-invalid"));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const values = validateForm();
    if (!values) return;

    const now = new Date().toISOString();
    let nextRecords;
    let savedRecord;
    if (state.formMode === "edit") {
      const current = findSelected();
      savedRecord = { ...current, ...values, updatedAt: now };
      nextRecords = state.anniversaries.map((item) => item.id === current.id ? savedRecord : item);
    } else {
      savedRecord = { id: createId(), ...values, createdAt: now, updatedAt: now };
      nextRecords = [...state.anniversaries, savedRecord];
    }

    try {
      saveAnniversaries(nextRecords);
    } catch (error) {
      console.error("記念日を保存できませんでした", error);
      showToast("保存できませんでした。ブラウザの設定または空き容量をご確認ください", true);
      return;
    }

    state.anniversaries = nextRecords;
    state.selectedAnniversaryId = savedRecord.id;
    state.formSnapshot = getFormSnapshot();
    navigate("detail", { id: savedRecord.id });
    showToast(state.formMode === "edit" ? "変更を保存しました" : "記念日を保存しました");
  }

  function openDeleteModal() {
    const anniversary = findSelected();
    if (!anniversary) return;
    elements.deleteModalMessage.textContent = `「${anniversary.title}」を削除しますか？`;
    elements.deleteModal.hidden = false;
    elements.deleteConfirmButton.focus();
  }

  function closeDeleteModal() {
    elements.deleteModal.hidden = true;
    elements.deleteButton.focus();
  }

  function confirmDelete() {
    const anniversary = findSelected();
    if (!anniversary) return;
    const nextRecords = state.anniversaries.filter((item) => item.id !== anniversary.id);
    try {
      saveAnniversaries(nextRecords);
    } catch (error) {
      console.error("記念日を削除できませんでした", error);
      elements.deleteModal.hidden = true;
      showToast("保存できませんでした。ブラウザの設定または空き容量をご確認ください", true);
      return;
    }
    state.anniversaries = nextRecords;
    state.selectedAnniversaryId = null;
    elements.deleteModal.hidden = true;
    state.formSnapshot = getFormSnapshot();
    navigate("home", { id: null });
    showToast("記念日を削除しました");
  }

  function updateMemoCount() {
    elements.memoCount.textContent = `${[...elements.memoInput.value].length} / 120`;
  }

  function handleFormBack() {
    if (!confirmDiscard()) return;
    if (state.formMode === "edit") navigate("detail", { id: state.selectedAnniversaryId });
    else navigate("home", { id: null });
  }

  function refreshIfDateChanged() {
    const today = getTodayYmd();
    if (today !== lastRenderedDate) renderCurrentView();
  }

  function bindEvents() {
    elements.addButton.addEventListener("click", () => navigate("form", { id: null, mode: "create" }));
    elements.emptyAddButton.addEventListener("click", () => navigate("form", { id: null, mode: "create" }));
    elements.detailBackButton.addEventListener("click", () => navigate("home", { id: null }));
    elements.detailEditButton.addEventListener("click", () => navigate("form", { id: state.selectedAnniversaryId, mode: "edit" }));
    elements.formBackButton.addEventListener("click", handleFormBack);
    elements.form.addEventListener("submit", handleSubmit);
    elements.memoInput.addEventListener("input", updateMemoCount);
    elements.deleteButton.addEventListener("click", openDeleteModal);
    elements.deleteCancelButton.addEventListener("click", closeDeleteModal);
    elements.deleteConfirmButton.addEventListener("click", confirmDelete);
    elements.deleteModal.addEventListener("click", (event) => {
      if (event.target === elements.deleteModal) closeDeleteModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.deleteModal.hidden) closeDeleteModal();
    });
    window.addEventListener("popstate", (event) => {
      if (state.currentView === "form" && isFormDirty()) {
        const discard = window.confirm("入力中の内容を破棄して戻りますか？");
        if (!discard) {
          history.pushState({ view: "form", id: state.selectedAnniversaryId, mode: state.formMode }, "");
          return;
        }
      }
      const historyState = event.state || { view: "home", id: null };
      state.selectedAnniversaryId = historyState.id || null;
      state.formMode = historyState.mode || "create";
      navigate(historyState.view || "home", { id: state.selectedAnniversaryId, mode: state.formMode }, false);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshIfDateChanged();
    });
    window.addEventListener("focus", refreshIfDateChanged);
    dateCheckTimer = window.setInterval(refreshIfDateChanged, 60 * 1000);
  }

  function init() {
    state.anniversaries = loadAnniversaries();
    bindEvents();
    history.replaceState({ view: "home", id: null, mode: "create" }, "");
    setView("home");
    renderHome();
  }

  // ブラウザ上で計算結果を確認しやすいよう、読み取り専用の検証用関数を公開します。
  globalThis.MellowDaysTest = Object.freeze({
    diffCalendarDays,
    getElapsedDays,
    getMilestoneDate,
    getAnniversaryDate,
    getNextDayMilestone,
    storageKey: STORAGE_KEY,
  });

  init();
})();
