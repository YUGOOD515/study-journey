// 四年规划的交互：拖拽排课（drag.js）、课程库搜索与筛选、点击课程打开详情、学期横向滚动。
// 页面由服务器渲染；每次改动后服务器返回新的 #workspace 片段，这里整块替换（支持的浏览器用 View Transitions 过渡），
// 并恢复搜索、筛选、展开状态和滚动位置。
(() => {
  const { terms, stages, urls } = window.PLAN;
  const dialog = document.getElementById("course-dialog");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let filter = "all";
  let query = "";
  const openPlaced = new Set(); // 用户手动展开的“已安排”列表

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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
  }
  const move = (code, term) => post(urls.move, { code, term });
  const add = (code, term) => post(urls.add, { code, term });
  const remove = (code) => post(urls.remove, { code });

  document.addEventListener("plan:drop", (e) => move(e.detail.code, e.detail.term));

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
        sectionHit ||= groupHit;
        // 搜索时自动展开有匹配的“已安排”列表，清空搜索后恢复用户自己的展开状态
        const placed = $("[data-placed]", group);
        if (placed) {
          const hitInside = Boolean(q) && $$("[data-card]", placed).some((c) => !c.hidden);
          placed.open = q ? hitInside : openPlaced.has(placed.dataset.key);
        }
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

  // ---------- 学期横向滚动 ----------
  function board() { return $("[data-board]"); }
  function columnWidth() {
    const col = $("[data-column]", board());
    return col ? col.getBoundingClientRect().width + 16 : 240;
  }
  function jumpToCurrent(smooth) {
    const b = board(), cur = $("[data-current]", b);
    if (!b || !cur) return;
    b.scrollTo({ left: cur.offsetLeft - b.offsetLeft - parseFloat(getComputedStyle(b).paddingLeft || 0), behavior: smooth && !reduced.matches ? "smooth" : "instant" });
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
    btn.className = "h-9 rounded-md border text-xs transition-colors duration-150 " +
      (active ? "border-blue bg-blue/10 font-medium text-blue" : "border-line hover:border-ink-2");
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
    const scroll = e.target.closest("[data-board-scroll]");
    if (scroll) {
      board().scrollBy({ left: Number(scroll.dataset.boardScroll) * columnWidth() * 2, behavior: reduced.matches ? "instant" : "smooth" });
      return;
    }
    if (e.target.closest("[data-board-jump]")) return jumpToCurrent(true);
    const card = e.target.closest("[data-card]");
    if (card && !dialog.contains(card)) open(card);
  });
  dialog.querySelector("[data-remove]").addEventListener("click", async () => {
    dialog.close();
    await remove(dialog.dataset.code);
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // 点遮罩关闭
  });

  function measure() {
    const summary = $("[data-summary]");
    if (summary) document.documentElement.style.setProperty("--summary-h", `${summary.offsetHeight}px`);
  }

  function init() {
    const input = $("[data-search]");
    if (input) input.value = query;
    applyFilter();
    measure();
    updateEdges();
  }

  init();
  jumpToCurrent(false);
  updateEdges();
  addEventListener("resize", () => { measure(); updateEdges(); });
})();
