// 四年规划的交互：拖拽排课（SortableJS）、课程库搜索与筛选、点击课程打开详情。
// 页面由服务器渲染；每次改动后服务器返回新的 #workspace 片段，这里整块替换，并恢复搜索、筛选、滚动位置。
(() => {
  const { terms, stages, urls } = window.PLAN;
  const dialog = document.getElementById("course-dialog");
  const PAST_KEY = "sj.showPast";
  let sortables = [];
  let filter = "all";
  let query = "";
  const openPlaced = new Set(); // 用户手动展开的“已安排”列表

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- 和服务器通信：发出改动，换上新的工作区 ----------
  async function post(url, body) {
    const library = $("#library");
    const scroll = library ? library.scrollTop : 0;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Fragment": "1" },
      body: JSON.stringify(body),
    });
    $("#workspace").outerHTML = await res.text();
    init();
    $("#library").scrollTop = scroll;
    if (query) searchOfferings(query);
  }
  const move = (code, term) => post(urls.move, { code, term });
  const add = (code, term) => post(urls.add, { code, term });
  const remove = (code) => post(urls.remove, { code });

  // ---------- 拖拽 ----------
  function initSortable() {
    sortables.forEach((s) => s.destroy());
    sortables = $$("[data-dropzone]").map((zone) =>
      Sortable.create(zone, {
        group: {
          name: "plan",
          // 待安排的课在课程库里各组之间挪没有意义，只接受从学期里拖回来的
          put: (to, from) => zone.dataset.accept === "true" && !(to.el.dataset.term === "pending" && from.el.dataset.term === "pending"),
        },
        sort: false,
        draggable: "[data-drag]",
        animation: 150,
        forceFallback: true, // 用指针事件模拟拖拽：触屏可用，各浏览器表现一致
        fallbackOnBody: true,
        delay: 120,
        delayOnTouchOnly: true, // 触屏上长按才开始拖，轻扫还能滚动页面
        onStart: () => document.body.classList.add("is-dragging"),
        onMove: (e) => {
          $$(".is-target").forEach((z) => z.classList.remove("is-target"));
          e.to.classList.add("is-target");
        },
        onEnd: (e) => {
          document.body.classList.remove("is-dragging");
          $$(".is-target").forEach((z) => z.classList.remove("is-target"));
          const from = e.from.dataset.term, to = e.to.dataset.term;
          if (from !== to) move(e.item.dataset.code, to);
        },
      })
    );
  }

  // ---------- 课程库：搜索、筛选 ----------
  function applyFilter() {
    const library = $("#library");
    if (!library) return;
    library.dataset.filter = filter;
    $$("[data-filter-chip]").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.filterChip === filter)));
    const q = query.toLowerCase();
    let any = false;
    for (const section of $$("[data-lib-section]")) {
      let sectionHit = false;
      for (const group of $$("[data-lib-group]", section)) {
        let groupHit = false;
        for (const card of $$("[data-card]", group)) {
          const hit = !q || card.dataset.name.toLowerCase().includes(q) || card.dataset.code.toLowerCase().includes(q);
          card.hidden = !hit;
          groupHit ||= hit;
        }
        group.hidden = Boolean(q) && !groupHit;
        // 搜索时自动展开有匹配的“已安排”列表，清空搜索后恢复用户自己的展开状态
        const placed = $("[data-placed]", group);
        if (placed) {
          const hitInside = Boolean(q) && $$("[data-card]", placed).some((c) => !c.hidden);
          placed.open = q ? hitInside : openPlaced.has(placed.dataset.key);
        }
        sectionHit ||= groupHit;
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

  document.addEventListener("toggle", (e) => {
    const el = e.target;
    if (!el.matches?.("[data-placed]") || query) return;
    if (el.open) openPlaced.add(el.dataset.key); else openPlaced.delete(el.dataset.key);
  }, true);

  document.addEventListener("input", (e) => {
    if (!e.target.matches("[data-search]")) return;
    query = e.target.value.trim();
    applyFilter();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchOfferings(query), 250);
  });

  // ---------- 已完成的学期：折叠 / 展开 ----------
  function applyPast() {
    const toggle = $("[data-past-toggle]");
    if (!toggle) return;
    const open = localStorage.getItem(PAST_KEY) === "1";
    toggle.setAttribute("aria-expanded", String(open));
    $("[data-past-label]").textContent = open ? "收起" : "展开";
    $("[data-past]").hidden = !open;
  }

  // ---------- 课程详情弹窗 ----------
  const field = (name) => dialog.querySelector(`[data-field="${name}"]`);
  const show = (name, visible) => dialog.querySelectorAll(`[data-show="${name}"]`).forEach((el) => (el.hidden = !visible));

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

  function termButton(label, active, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.disabled = active;
    btn.className = "rounded-md border px-2 py-2 text-xs " + (active ? "border-blue font-medium text-blue" : "border-line hover:border-ink-2");
    btn.addEventListener("click", async () => {
      dialog.close();
      await onClick();
    });
    return btn;
  }

  function open(card) {
    const d = card.dataset;
    const adding = "add" in d;
    dialog.dataset.code = d.code; // 给“移除”按钮用
    for (const key of ["name", "credits", "nature", "offered", "status", "score", "warning"]) {
      field(key).textContent = key === "credits" ? `${d.credits} 学分` : d[key] || "";
    }
    show("score", Boolean(d.score));
    show("warning", Boolean(d.warning));
    const locked = "locked" in d;
    show("move", !locked);
    show("locked", locked);
    show("remove", "custom" in d && !locked);
    field("move-title").textContent = adding ? "加入规划，安排到" : "安排到";
    const box = field("terms");
    box.replaceChildren();
    for (const t of terms) {
      box.append(termButton(stages[t - 1], d.term === String(t), () => (adding ? add(d.code, t) : move(d.code, t))));
    }
    if (!adding) box.append(termButton("待安排", !d.term, () => move(d.code, "pending")));
    loadSections(d.code, d.term);
    dialog.showModal();
  }

  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter-chip]");
    if (chip) { filter = chip.dataset.filterChip; applyFilter(); return; }
    if (e.target.closest("[data-past-toggle]")) {
      localStorage.setItem(PAST_KEY, localStorage.getItem(PAST_KEY) === "1" ? "0" : "1");
      applyPast();
      return;
    }
    const card = e.target.closest("[data-card]");
    if (card && !dialog.contains(card)) open(card);
  });
  dialog.querySelector("[data-remove]").addEventListener("click", async () => {
    const code = dialog.dataset.code;
    dialog.close();
    await remove(code);
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // 点遮罩关闭
  });

  function init() {
    initSortable();
    const input = $("[data-search]");
    if (input) input.value = query;
    applyFilter();
    applyPast();
    const summary = $("[data-summary]");
    if (summary) document.documentElement.style.setProperty("--summary-h", `${summary.offsetHeight}px`);
  }

  init();
  addEventListener("resize", () => {
    const summary = $("[data-summary]");
    if (summary) document.documentElement.style.setProperty("--summary-h", `${summary.offsetHeight}px`);
  });
})();
