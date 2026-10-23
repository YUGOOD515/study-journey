// 学期课表：选教学班、挑班、找课、切换周次时只替换 #timetable 片段，不整页刷新。
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  async function swap(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { "X-Fragment": "1" } });
    if (!res.ok && res.status !== 409) return (location.href = url); // 409 = 操作被拒绝，片段里带着原因
    const hadPanel = Boolean($("#panel"));
    const y = window.scrollY;
    $("#timetable").outerHTML = await res.text();
    window.scrollTo(0, y);
    const panel = $("#panel");
    // 新打开的面板不在视线里（窄屏时面板在课表上方）就滚过去
    if (panel && !hadPanel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: "start" });
    applyFilters();
  }

  function pageUrl() {
    const box = $("#timetable");
    const url = new URL("/timetable", location.origin);
    url.searchParams.set("term", box.dataset.term);
    if (box.dataset.week) url.searchParams.set("week", box.dataset.week);
    return url;
  }

  // ---------- 挑班面板：只看不冲突 / 只看本班 / 搜教师 ----------
  const filters = { free: false, mine: false, teacher: "" };
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

  // ---------- 找课面板：输入课程名时只换结果 ----------
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
    await swap(form.action, { method: "POST", body: new FormData(form) });
    history.replaceState(null, "", pageUrl());
  });

  document.addEventListener("click", (e) => {
    // 课表上的多班虚线块：在面板里定位到这组教学班
    const ghost = e.target.closest("[data-focus-group]");
    if (ghost) {
      e.preventDefault();
      const group = document.getElementById(ghost.dataset.focusGroup);
      if (!group) return;
      if (group.hidden) { Object.assign(filters, { free: false, mine: false, teacher: "" }); applyFilters(); }
      group.scrollIntoView({ block: "nearest", behavior: "smooth" });
      group.classList.add("is-flash");
      setTimeout(() => group.classList.remove("is-flash"), 1200);
      return;
    }
    const link = e.target.closest("a[data-nav][href]");
    if (!link || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (!link.search.includes("pick=")) Object.assign(filters, { free: false, mine: false, teacher: "" });
    swap(link.href).then(() => history.pushState(null, "", link.href));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !$("#panel") || e.target.matches("input")) return;
    const url = pageUrl();
    swap(url).then(() => history.pushState(null, "", url));
  });
  window.addEventListener("popstate", () => swap(location.href));
  applyFilters();
})();
