// 学期课表：选教学班、挑班、找课、切换周次时只替换 #timetable 片段，不整页刷新。
// 侧栏在窄屏是底部抽屉：打开挑班 / 找课时自动展开，用户手动收起后保持收起。
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const narrow = matchMedia("(max-width: 1023px)");
  const calm = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- 抽屉 ----------
  function setSheet(open) {
    const side = $("#tt-side");
    if (!side) return;
    side.dataset.open = String(open);
    $("[data-sheet-toggle]", side)?.setAttribute("aria-expanded", String(open));
    const body = $("[data-side-body]", side);
    if (body) body.inert = narrow.matches && !open; // 收起时里面的内容不能被 Tab 到
  }
  const sheetOpen = () => $("#tt-side")?.dataset.open === "true";

  // ---------- 片段替换 ----------
  async function swap(url, options = {}, after) {
    const res = await fetch(url, { ...options, headers: { "X-Fragment": "1" } });
    if (!res.ok && res.status !== 409) return (location.href = url); // 409 = 操作被拒绝，片段里带着原因
    const html = await res.text();
    const old = $("#timetable");
    const before = { mode: old.dataset.mode, pick: old.dataset.pick, open: sheetOpen(), y: window.scrollY,
                     sideTop: $("[data-side-body]")?.scrollTop ?? 0, asideTop: $("#tt-side")?.scrollTop ?? 0,
                     gridLeft: $(".tt-scroll")?.scrollLeft ?? 0 };
    const replace = () => {
      $("#timetable").outerHTML = html;
      const box = $("#timetable");
      const same = box.dataset.mode === before.mode && box.dataset.pick === before.pick;
      if (same) box.classList.add("is-settled"); // 同一个面板里的操作：不重复播放浮现动画
      const want = Boolean(box.dataset.mode) || before.open;
      setSheet(before.open); // 先保持原样，下一帧再展开，抽屉才有滑出的过渡
      if (want !== before.open) requestAnimationFrame(() => requestAnimationFrame(() => setSheet(want)));
      window.scrollTo(0, before.y);
      const grid = $(".tt-scroll");
      if (grid) grid.scrollLeft = before.gridLeft;
      const body = $("[data-side-body]"), aside = $("#tt-side");
      if (same || !box.dataset.pick) { if (body) body.scrollTop = before.sideTop; if (aside) aside.scrollTop = before.asideTop; }
      const open = $(".tt-course.is-open");
      if (open && !same) requestAnimationFrame(() => open.scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" }));
      applyFilters();
      after?.(box);
    };
    // 课块用 view-transition-name 标记，换教学班时会滑到新位置
    if (document.startViewTransition && !calm.matches) await document.startViewTransition(replace).updateCallbackDone;
    else replace();
  }

  function pageUrl() {
    const box = $("#timetable");
    const url = new URL("/timetable", location.origin);
    url.searchParams.set("term", box.dataset.term);
    if (box.dataset.week) url.searchParams.set("week", box.dataset.week);
    if (box.dataset.pick) url.searchParams.set("pick", box.dataset.pick);
    return url;
  }

  function flash(el) {
    if (!el) return;
    el.classList.remove("is-flash");
    void el.offsetWidth; // 重新触发动画
    el.classList.add("is-flash");
    setTimeout(() => el.classList.remove("is-flash"), 1300);
  }

  // ---------- 挑班：只看不冲突 / 只看本班 / 搜教师 ----------
  const filters = { free: false, mine: false, teacher: "" };
  const resetFilters = () => Object.assign(filters, { free: false, mine: false, teacher: "" });
  function applyFilters() {
    const panel = $("[data-pick-panel]");
    if (!panel) return;
    for (const input of $$("[data-f]", panel)) {
      if (input.type === "checkbox") input.checked = filters[input.dataset.f];
      else input.value = filters.teacher;
    }
    let any = false;
    for (const group of $$("[data-group]", panel)) {
      let hit = false;
      for (const li of $$("[data-option]", group)) {
        const ok = (!filters.free || li.dataset.free === "1") && (!filters.mine || li.dataset.mine === "1") &&
          (!filters.teacher || li.dataset.teacher.includes(filters.teacher));
        li.hidden = !ok;
        hit ||= ok;
      }
      group.hidden = !hit;
      any ||= hit;
    }
    $("[data-no-option]", panel)?.classList.toggle("hidden", any);
  }

  // ---------- 找课：输入课程名时只换结果 ----------
  let finderTimer = 0, finderId = 0;
  async function searchFinder(form) {
    const url = new URL(form.action, location.origin);
    for (const [k, v] of new FormData(form)) if (v) url.searchParams.set(k, v);
    const id = ++finderId;
    const res = await fetch(url, { headers: { "X-Fragment": "finder" } });
    if (!res.ok || id !== finderId) return;
    $("[data-finder-results]").innerHTML = await res.text();
    history.replaceState(null, "", url);
  }

  document.addEventListener("input", (e) => {
    const f = e.target.closest("[data-f]");
    if (f) {
      filters[f.dataset.f] = f.type === "checkbox" ? f.checked : f.value.trim();
      applyFilters();
      return;
    }
    if (e.target.matches("[data-finder-q]")) {
      clearTimeout(finderTimer);
      finderTimer = setTimeout(() => searchFinder(e.target.form), 250);
    }
  });

  document.addEventListener("change", (e) => {
    const form = e.target.closest("form");
    if (form?.matches("[data-week-form]")) {
      const url = new URL(form.action, location.origin);
      for (const [k, v] of new FormData(form)) if (v) url.searchParams.set(k, v);
      swap(url).then(() => history.replaceState(null, "", url));
    }
  });

  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (form.matches("[data-finder-form]")) {
      e.preventDefault();
      clearTimeout(finderTimer);
      return searchFinder(form);
    }
    if (!form.matches("[data-fragment]")) return;
    e.preventDefault();
    const data = new FormData(form);
    for (const b of $$("button", form)) b.disabled = true;
    const added = form.action.endsWith("/timetable/add") ? data.get("code") : null;
    await swap(form.action, { method: "POST", body: data }, (box) => {
      if (!added) return;
      // 刚从找课加进来的课：回到课程列表，高亮它和它的课块
      const row = $(`[data-course="${CSS.escape(added)}"]`, box);
      row?.scrollIntoView({ block: "nearest" });
      flash(row);
      $$(`[data-block="${CSS.escape(added)}"]`, box).forEach(flash);
    });
    history.replaceState(null, "", pageUrl());
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-sheet-toggle]")) return setSheet(!sheetOpen());
    // 课表上的多班虚线块：在侧栏里定位到这组教学班
    const ghost = e.target.closest("[data-focus-group]");
    if (ghost) {
      e.preventDefault();
      const group = document.getElementById(ghost.dataset.focusGroup);
      if (!group) return;
      if (group.hidden) { resetFilters(); applyFilters(); }
      setSheet(true);
      group.scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" });
      flash(group);
      return;
    }
    const link = e.target.closest("a[data-nav][href]");
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (new URL(link.href).searchParams.get("pick") !== $("#timetable").dataset.pick) resetFilters();
    swap(link.href).then(() => history.pushState(null, "", link.href));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.target.matches("input, select")) return;
    if ($("#timetable")?.dataset.mode) {
      const url = pageUrl();
      url.searchParams.delete("pick");
      swap(url).then(() => history.pushState(null, "", url));
    } else if (narrow.matches && sheetOpen()) setSheet(false);
  });
  window.addEventListener("popstate", () => swap(location.href));
  narrow.addEventListener("change", () => setSheet(sheetOpen()));
  setSheet(sheetOpen());
  applyFilters();
})();
