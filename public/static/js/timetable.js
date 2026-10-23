// 学期课表：选教学班、挑班、找课、切换周次时只替换 #timetable 片段，不整页刷新。
// 侧栏在窄屏是底部抽屉：找课时自动展开；选中一门课时收起，好看课表上的虚线框。
// 点虚线框弹出那个时间的教学班卡片：宽屏贴在虚线框旁边，窄屏从底部浮起；点卡片就地展开详情。
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
      const want = box.dataset.mode === "find" || (box.dataset.mode !== "pick" && before.open);
      pop = null;
      setSheet(before.open); // 先保持原样，下一帧再展开，抽屉才有滑出的过渡
      if (want !== before.open) requestAnimationFrame(() => requestAnimationFrame(() => setSheet(want)));
      window.scrollTo(0, before.y);
      const grid = $(".tt-scroll");
      if (grid) grid.scrollLeft = before.gridLeft;
      const body = $("[data-side-body]"), aside = $("#tt-side");
      if (same || !box.dataset.pick) { if (body) body.scrollTop = before.sideTop; if (aside) aside.scrollTop = before.asideTop; }
      const open = $(".tt-course.is-open");
      if (open && !same) requestAnimationFrame(() => open.scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" }));
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

  // ---------- 教学班卡片 ----------
  let pop = null; // { el, anchor }
  function placePop() {
    if (!pop) return;
    const { el, anchor } = pop;
    el.style.left = el.style.top = "";
    if (narrow.matches) return; // 窄屏由 CSS 固定在底部
    const box = $("#timetable").getBoundingClientRect(), a = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight, gap = 8;
    let left = a.right + gap; // 优先放右边，放不下就放左边
    if (left + w > box.right && a.left - gap - w >= box.left) left = a.left - gap - w;
    left = Math.max(box.left, Math.min(left, box.right - w));
    let top = Math.min(a.top, innerHeight - 16 - h); // 尽量整个露在视口里
    top = Math.max(top, 16);
    el.style.left = `${left - box.left}px`;
    el.style.top = `${top - box.top}px`;
  }
  function openPop(id, anchor) {
    const el = document.getElementById(id);
    if (!el) return;
    closePop(false);
    pop = { el, anchor };
    el.hidden = false;
    $("[data-pop-backdrop]")?.removeAttribute("hidden");
    anchor.setAttribute("aria-expanded", "true");
    anchor.classList.add("is-active");
    const cards = $$("[data-option]", el);
    if (cards.length === 1) setCard(cards[0], true); // 只有一个班：直接展开它的详情
    placePop();
    el.scrollTop = 0;
    $("[data-opt-toggle]", el)?.focus({ preventScroll: true });
  }
  function closePop(refocus = true) {
    if (!pop) return;
    const { el, anchor } = pop;
    el.hidden = true;
    $("[data-pop-backdrop]")?.setAttribute("hidden", "");
    anchor.setAttribute("aria-expanded", "false");
    anchor.classList.remove("is-active");
    for (const card of $$("[data-option]", el)) setCard(card, false);
    pop = null;
    if (refocus) anchor.focus({ preventScroll: true });
  }
  function setCard(card, open) {
    card.dataset.open = String(open);
    $("[data-opt-toggle]", card)?.setAttribute("aria-expanded", String(open));
    $(".tt-opt-more", card).inert = !open;
  }
  function toggleCard(card) {
    const open = card.dataset.open !== "true";
    for (const other of $$("[data-option]", card.parentElement)) if (other !== card) setCard(other, false);
    setCard(card, open);
    if (open) setTimeout(() => card.scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" }), 210);
  }
  function searchCards(input) {
    const el = input.closest(".tt-pop"), q = input.value.trim();
    let any = false;
    for (const card of $$("[data-option]", el)) {
      card.hidden = Boolean(q) && !card.dataset.teacher.includes(q);
      any ||= !card.hidden;
    }
    $("[data-no-option]", el)?.classList.toggle("hidden", any);
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
    if (e.target.matches("[data-opt-search]")) return searchCards(e.target);
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
    const opener = e.target.closest("[data-pop-open]");
    if (opener) {
      if (pop?.anchor === opener) return closePop();
      return openPop(opener.dataset.popOpen, opener);
    }
    if (e.target.closest("[data-pop-close], [data-pop-backdrop]")) return closePop();
    const toggle = e.target.closest("[data-opt-toggle]");
    if (toggle) return toggleCard(toggle.closest("[data-option]"));
    if (pop && !pop.el.contains(e.target)) {
      closePop(false); // 点卡片外面：先只收起卡片
      if (e.target.closest("[data-cell]")) return e.preventDefault();
    }
    const link = e.target.closest("a[data-nav][href]");
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    swap(link.href).then(() => history.pushState(null, "", link.href));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (pop) return closePop();
    if (e.target.matches("input, select")) return;
    if ($("#timetable")?.dataset.mode) {
      const url = pageUrl();
      url.searchParams.delete("pick");
      swap(url).then(() => history.pushState(null, "", url));
    } else if (narrow.matches && sheetOpen()) setSheet(false);
  });
  window.addEventListener("popstate", () => swap(location.href));
  narrow.addEventListener("change", () => { setSheet(sheetOpen()); placePop(); });
  addEventListener("resize", placePop);
  setSheet(sheetOpen());
})();
