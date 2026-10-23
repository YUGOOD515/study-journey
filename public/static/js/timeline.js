// 四年规划的交互：编辑模式（拖拽排课、改修读记录、撤销 / 改动记录）、卡片显示偏好、课程库搜索与筛选、课程详情、学期横向滚动。
// 页面由服务器渲染；每次改动后服务器返回新的 #workspace 片段，这里整块替换（支持的浏览器用 View Transitions 过渡），
// 并恢复搜索、筛选、展开状态和滚动位置。编辑状态、显示偏好挂在 <html> 上，不随片段替换丢失。
(() => {
  const { terms, stages, labels, current, urls } = window.PLAN;
  const root = document.documentElement;
  const dialog = document.getElementById("course-dialog");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let filter = "all";
  let query = "";
  let libraryOpen = false; // 窄屏：课程库抽屉是否展开

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const stageOf = (term) => (term ? stages[Number(term) - 1] : "待安排");
  const store = {
    get(key, fallback) { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* 无痕模式等 */ } },
  };

  // ---------- 和服务器通信：发出改动，换上新的工作区 ----------
  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Fragment": "1" },
      body: JSON.stringify(body),
    });
    const html = await res.text();
    const keep = { library: $("#library")?.scrollTop || 0, board: $("[data-board]")?.scrollLeft || 0 };
    const apply = () => {
      $("#workspace").outerHTML = html;
      init();
      $("#library").scrollTop = keep.library;
      $("[data-board]").scrollLeft = keep.board;
    };
    if (document.startViewTransition && !reduced.matches) await document.startViewTransition(apply).updateCallbackDone;
    else apply();
    if (query) searchOfferings(query);
    return res.ok;
  }

  // ---------- 改动记录与撤销 ----------
  // 每条：{ kind: "move" | "record" | "add" | "remove", code, name, before: {term, status, score}, after: 说明文字 }
  let history = store.get("sj-history", []);
  const snapshot = (d) => ({ term: d.term ? Number(d.term) : null, status: d.status, score: d.scoreRaw ? Number(d.scoreRaw) : null });

  function remember(entry) {
    history.push({ ...entry, at: Date.now() });
    history = history.slice(-50);
    store.set("sj-history", history);
  }

  async function change(entry, url, body) {
    if (await post(url, body)) remember(entry);
    renderHistory();
  }
  const move = (d, term) => {
    const t = term === "pending" ? null : Number(term);
    if (String(t ?? "") === (d.term || "")) return;
    return change({ kind: "move", code: d.code, name: d.name, before: snapshot(d), after: `${stageOf(d.term)} → ${stageOf(t)}` }, urls.move, { code: d.code, term });
  };
  const add = (d, term) => change({ kind: "add", code: d.code, name: d.name, after: `加入${stageOf(term)}` }, urls.add, { code: d.code, term });
  const remove = (d) => change({ kind: "remove", code: d.code, name: d.name, before: snapshot(d), after: "移出规划" }, urls.remove, { code: d.code });
  const record = (d, status, score) => change(
    { kind: "record", code: d.code, name: d.name, before: snapshot(d), after: `${status}${score === null ? "" : `，成绩 ${score}`}` },
    urls.record, { code: d.code, term: d.term || null, status, score },
  );

  async function undo() {
    const last = history.pop();
    if (!last) return;
    store.set("sj-history", history);
    if (last.kind === "add") await post(urls.remove, { code: last.code });
    else if (last.kind === "remove") {
      await post(urls.add, { code: last.code, term: last.before.term ?? current });
      if (last.before.term === null) await post(urls.move, { code: last.code, term: "pending" });
    } else await post(urls.record, { code: last.code, ...last.before });
    renderHistory();
  }

  function renderHistory() {
    const list = $("[data-history-list]");
    if (!list) return;
    $("[data-undo]").disabled = !history.length;
    $("[data-history-count]").textContent = history.length;
    list.replaceChildren(...(history.length ? [...history].reverse().map((h) => {
      const li = document.createElement("li");
      li.className = "flex items-baseline gap-2 px-3 py-1.5 text-xs";
      const name = Object.assign(document.createElement("span"), { className: "min-w-0 flex-1 truncate text-ink", textContent: h.name });
      const what = Object.assign(document.createElement("span"), { className: "shrink-0 text-ink-2", textContent: h.after });
      li.append(name, what);
      return li;
    }) : [Object.assign(document.createElement("li"), { className: "px-3 py-1.5 text-xs text-ink-2", textContent: "还没有改动。" })]));
  }

  document.addEventListener("plan:drop", (e) => move(e.detail.before, e.detail.term));

  // ---------- 编辑模式 ----------
  function setEditing(on) {
    root.dataset.editing = String(on);
    store.set("sj-editing", on);
    syncEditing();
  }
  function syncEditing() {
    if (root.dataset.editing !== "true") $$("[data-history]").forEach((d) => (d.open = false));
  }

  // ---------- 卡片显示偏好（存在 localStorage，名称一定显示） ----------
  function prefs() {
    try { return JSON.parse(localStorage.getItem("sj-card-prefs") || "{}"); } catch { return {}; }
  }
  function syncPrefs() {
    const p = prefs();
    $$("[data-pref]").forEach((box) => (box.checked = p[box.dataset.pref] !== false));
  }
  document.addEventListener("change", (e) => {
    const box = e.target.closest("[data-pref]");
    if (!box) return;
    const p = { ...prefs(), [box.dataset.pref]: box.checked };
    try { localStorage.setItem("sj-card-prefs", JSON.stringify(p)); } catch { /* ignore */ }
    root.classList.toggle(`hide-${box.dataset.pref}`, !box.checked);
  });

  // ---------- 课程库：搜索、筛选 ----------
  function applyFilter() {
    const library = $("#library");
    if (!library) return;
    library.dataset.filter = filter;
    $$("[data-filter-chip]").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.filterChip === filter)));
    const q = query.toLowerCase();
    const matches = (card) => !q || card.dataset.name.toLowerCase().includes(q) || card.dataset.code.toLowerCase().includes(q);
    let any = false;
    for (const section of $$("[data-lib-section]")) {
      let sectionHit = false;
      for (const card of $$("[data-card]", section)) {
        card.hidden = !matches(card);
        sectionHit ||= !card.hidden;
      }
      for (const group of $$("[data-lib-group]", section)) {
        group.hidden = Boolean(q) && !$$("[data-card]", group).some((c) => !c.hidden);
      }
      section.hidden = Boolean(q) && !sectionHit;
      any ||= sectionHit;
    }
    $("[data-no-match]").classList.toggle("hidden", !q || any);
  }

  let searchTimer = 0, searchId = 0;
  async function searchOfferings(q) {
    const box = $("[data-search-results]");
    const id = ++searchId;
    if (!q) { box.innerHTML = ""; return; }
    try {
      const res = await fetch(`${urls.search}?q=${encodeURIComponent(q)}`);
      if (res.ok && id === searchId) box.innerHTML = await res.text();
    } catch { /* 搜不到开课表就只显示课程库里的结果 */ }
  }

  // ---------- 窄屏：课程库是底部抽屉 ----------
  function setLibrary(open) {
    libraryOpen = open;
    const lib = $("#library");
    if (!lib) return;
    lib.dataset.open = String(open);
    $("[data-library-toggle]", lib)?.setAttribute("aria-expanded", String(open));
  }

  document.addEventListener("input", (e) => {
    if (!e.target.matches("[data-search]")) return;
    query = e.target.value.trim();
    applyFilter();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchOfferings(query), 250);
  });

  // ---------- 学期横向滚动 ----------
  const board = () => $("[data-board]");
  function columnWidth() {
    const col = $("[data-column]", board());
    return col ? col.getBoundingClientRect().width + 16 : 240;
  }
  function jumpToCurrent(smooth) {
    const b = board(), cur = $("[data-current]", b);
    if (!b || !cur) return;
    const left = b.scrollLeft + cur.getBoundingClientRect().left - b.getBoundingClientRect().left - parseFloat(getComputedStyle(b).paddingLeft || 0);
    b.scrollTo({ left, behavior: smooth && !reduced.matches ? "smooth" : "instant" });
  }
  function updateEdges() {
    const b = board();
    if (!b) return;
    b.dataset.start = String(b.scrollLeft <= 4);
    b.dataset.end = String(b.scrollLeft + b.clientWidth >= b.scrollWidth - 4);
    $("[data-board-scroll='-1']").disabled = b.dataset.start === "true";
    $("[data-board-scroll='1']").disabled = b.dataset.end === "true";
  }
  document.addEventListener("scroll", (e) => { if (e.target.matches?.("[data-board]")) updateEdges(); }, true);

  // ---------- 课程详情弹窗：平时只看；编辑模式里可以换学期、改修读记录 ----------
  const field = (name) => dialog.querySelector(`[data-field="${name}"]`);
  const show = (name, visible) => dialog.querySelectorAll(`[data-show="${name}"]`).forEach((el) => (el.hidden = !visible));
  let opened = null; // 当前弹窗里的课程卡 dataset

  // 开课情况由服务器渲染成片段，打开弹窗时再取，避免首页带上全部教学班
  let sectionsRequest = 0;
  async function loadSections(code, term) {
    const box = field("sections");
    const id = ++sectionsRequest;
    box.innerHTML = '<p class="border-t border-line pt-4 text-xs text-ink-2">正在读取开课情况…</p>';
    try {
      const url = urls.sections.replace("__CODE__", encodeURIComponent(code)) + (term ? `?term=${term}` : "");
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const html = await res.text();
      if (id === sectionsRequest) box.innerHTML = html;
    } catch {
      if (id === sectionsRequest) box.innerHTML = '<p class="border-t border-line pt-4 text-xs text-ink-2">开课情况暂时读取不到。</p>';
    }
  }

  function termButton(label, sub, active, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.disabled = active;
    btn.className = "flex h-11 flex-col items-center justify-center rounded-md border text-xs leading-4 transition-colors duration-150 " +
      (active ? "border-blue bg-blue/10 font-medium text-blue" : "border-line hover:border-ink-2");
    btn.append(Object.assign(document.createElement("span"), { textContent: label }));
    if (sub) btn.append(Object.assign(document.createElement("span"), { className: "text-ink-2 font-normal", textContent: sub }));
    btn.addEventListener("click", async () => {
      dialog.close();
      await onClick();
    });
    return btn;
  }

  function fill(d) {
    const adding = "add" in d;
    const editing = root.dataset.editing === "true";
    const t = d.term ? Number(d.term) : null;
    for (const key of ["name", "credits", "nature", "offered", "status", "score", "warning"]) {
      field(key).textContent = key === "credits" ? `${d.credits} 学分` : d[key] || "";
    }
    field("where").textContent = t ? `${stageOf(t)}（${labels[t - 1]}）` : "待安排";
    show("score", Boolean(d.score));
    show("warning", Boolean(d.warning));
    const canMove = editing || adding;
    show("move", canMove);
    show("view-hint", !canMove);
    show("remove", editing && "custom" in d && !("locked" in d));
    // 过去学期的课：编辑模式里可以改修读结果和成绩
    const past = t !== null && t < current;
    show("record", editing && past);
    if (editing && past) {
      dialog.querySelectorAll('[name="record-status"]').forEach((r) => (r.checked = r.value === (d.status === "未通过" ? "未通过" : "已修读")));
      field("record-score").value = d.scoreRaw || "";
    }
    field("move-title").textContent = adding ? "加入规划，安排到" : "换到";
    const box = field("terms");
    box.replaceChildren();
    for (const term of terms) {
      if (adding && term < current) continue; // 新加的课只能排到本学期及以后
      const sub = term < current ? "已完成" : term === current ? "本学期" : "";
      box.append(termButton(stageOf(term), sub, d.term === String(term), () => (adding ? add(d, term) : move(d, term))));
    }
    if (!adding) box.append(termButton("待安排", "", !d.term, () => move(d, "pending")));
  }

  function open(card) {
    opened = { ...card.dataset };
    fill(opened);
    loadSections(opened.code, opened.term);
    dialog.showModal();
  }

  dialog.querySelector("[data-save-record]").addEventListener("click", async () => {
    const status = dialog.querySelector('[name="record-status"]:checked')?.value || "已修读";
    const raw = field("record-score").value.trim();
    const score = raw === "" ? null : Number(raw);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
      field("record-score").focus();
      return;
    }
    dialog.close();
    await record(opened, status, score);
  });
  dialog.querySelector("[data-edit-from-dialog]").addEventListener("click", () => {
    setEditing(true);
    fill(opened);
  });
  dialog.querySelector("[data-remove]").addEventListener("click", async () => {
    dialog.close();
    await remove(opened);
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // 点遮罩关闭
  });

  document.addEventListener("click", (e) => {
    // 点菜单外面关掉菜单
    $$("details.menu[open]").forEach((m) => { if (!m.contains(e.target)) m.open = false; });
    if (e.target.closest("[data-edit-toggle]")) return setEditing(root.dataset.editing !== "true");
    if (e.target.closest("[data-library-toggle]")) return setLibrary(!libraryOpen);
    if (e.target.closest("[data-undo]")) return undo();
    const chip = e.target.closest("[data-filter-chip]");
    if (chip) { filter = chip.dataset.filterChip; applyFilter(); return; }
    const scroll = e.target.closest("[data-board-scroll]");
    if (scroll) {
      board().scrollBy({ left: Number(scroll.dataset.boardScroll) * columnWidth() * 2, behavior: reduced.matches ? "instant" : "smooth" });
      return;
    }
    if (e.target.closest("[data-board-jump]")) return jumpToCurrent(true);
    const card = e.target.closest("[data-card]");
    if (card && !dialog.contains(card)) open(card);
  });
  document.addEventListener("keydown", (e) => {
    // 编辑模式里 Ctrl/⌘ + Z 撤销（输入框里不拦截）
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && root.dataset.editing === "true"
        && !e.target.closest("input, textarea") && !dialog.open) {
      e.preventDefault();
      undo();
    }
    if (e.key === "Escape") $$("details.menu[open]").forEach((m) => (m.open = false));
  });

  function init() {
    const input = $("[data-search]");
    if (input) input.value = query;
    applyFilter();
    syncEditing();
    syncPrefs();
    renderHistory();
    setLibrary(libraryOpen);
    updateEdges();
  }

  init();
  jumpToCurrent(false);
  updateEdges();
  addEventListener("resize", updateEdges);
})();
