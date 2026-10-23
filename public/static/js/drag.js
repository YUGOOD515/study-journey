// 拖拽排课（只在编辑模式里生效：<html data-editing="true">）：指针事件实现，鼠标、触屏都能用（触屏长按 200ms 开始拖，轻扫照常滚动页面）。
// 拖动时只移动一个浮起的副本，页面布局不变；只有松手时指针正下方是可以放的区域才算数，
// 否则副本飞回原处，课程留在原来的位置。
//   <x data-dropzone data-term="5" data-accept="true">  放置区（学期列、课程库）
//   <x data-drag data-code="…">                         可拖的课程卡
(() => {
  const MOVE_THRESHOLD = 5; // 鼠标移动超过这么多像素才算开始拖
  const LONG_PRESS = 200;
  const EDGE = 56; // 靠近滚动区域边缘时自动滚动
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let drag = null;
  let suppressClick = false;

  function zoneAt(x, y, d = drag) {
    const el = document.elementFromPoint(x, y);
    const zone = el && el.closest("[data-dropzone]");
    if (!zone || zone.dataset.accept !== "true") return null;
    return zone.dataset.term === d.from.dataset.term ? null : zone;
  }

  function start() {
    const { card } = drag;
    const r = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.removeAttribute("style");
    ghost.classList.add("drag-ghost");
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.append(ghost);
    Object.assign(drag, { started: true, ghost, rect: r });
    card.classList.add("is-drag-source");
    document.body.classList.add("is-dragging");
    navigator.vibrate?.(10);
    loop();
  }

  function autoscroll() {
    const { x, y } = drag;
    // 横向：指针所在的横向滚动区域（学期列）
    const el = document.elementFromPoint(x, y);
    const strip = el && el.closest("[data-board]");
    if (strip) {
      const r = strip.getBoundingClientRect();
      if (x < r.left + EDGE) strip.scrollLeft -= Math.ceil((r.left + EDGE - x) / 4);
      else if (x > r.right - EDGE) strip.scrollLeft += Math.ceil((x - r.right + EDGE) / 4);
    }
    // 纵向：课程库自己的滚动，或者整页
    const pane = el && el.closest("#library");
    const scroller = pane && pane.scrollHeight > pane.clientHeight ? pane : null;
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    const bottom = scroller ? scroller.getBoundingClientRect().bottom : innerHeight;
    const dy = y < top + EDGE ? -Math.ceil((top + EDGE - y) / 4) : y > bottom - EDGE ? Math.ceil((y - bottom + EDGE) / 4) : 0;
    if (dy) (scroller || window).scrollBy(0, dy);
  }

  function loop() {
    if (!drag || !drag.started) return;
    const { ghost, x, y, x0, y0 } = drag;
    ghost.style.transform = `translate(${x - x0}px, ${y - y0}px) scale(1.03)`;
    autoscroll();
    const zone = zoneAt(x, y);
    if (zone !== drag.zone) {
      drag.zone?.classList.remove("is-target");
      zone?.classList.add("is-target");
      drag.zone = zone;
    }
    drag.frame = requestAnimationFrame(loop);
  }

  function flyTo(ghost, rect, done) {
    if (reduced.matches) return done();
    ghost.style.transition = "transform 180ms cubic-bezier(.2, .8, .2, 1), box-shadow 180ms";
    ghost.style.transform = `translate(${rect.left - parseFloat(ghost.style.left)}px, ${rect.top - parseFloat(ghost.style.top)}px)`;
    ghost.classList.add("is-landing");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ghost.removeEventListener("transitionend", finish);
      done();
    };
    ghost.addEventListener("transitionend", finish);
    setTimeout(finish, 240);
  }

  function end(commit) {
    const d = drag;
    drag = null;
    clearTimeout(d.timer);
    if (!d.started) return;
    cancelAnimationFrame(d.frame);
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    document.body.classList.remove("is-dragging");
    d.zone?.classList.remove("is-target");
    // 以松手那一刻指针下的区域为准（动画帧可能还没来得及更新）
    const zone = commit ? zoneAt(d.x, d.y, d) : null;
    let landed = false;
    const cleanup = () => {
      if (landed) return;
      landed = true;
      d.ghost.remove();
      d.card.classList.remove("is-drag-source");
    };
    if (!zone) return flyTo(d.ghost, d.card.getBoundingClientRect(), cleanup); // 没放到可以放的地方：回到原处
    const before = { ...d.card.dataset }; // 改动前的学期、状态、成绩（给撤销用）
    const notify = () => document.dispatchEvent(new CustomEvent("plan:drop", { detail: { code: before.code, term: zone.dataset.term, before } }));
    if (!zone.querySelector("[data-list]") || zone.dataset.term === "pending") {
      // 放回课程库：副本淡出，课程在服务器返回的新片段里回到它的分组
      d.card.hidden = true;
      d.ghost.classList.add("is-vanishing");
      setTimeout(() => { cleanup(); notify(); }, reduced.matches ? 0 : 160);
      return;
    }
    // 先在页面上把卡片放进去（服务器返回新片段前就能看到结果），再通知服务器
    const list = zone.querySelector("[data-list]");
    list.querySelector("[data-empty]")?.remove();
    list.append(d.card);
    d.card.scrollIntoView({ block: "nearest", inline: "nearest" });
    flyTo(d.ghost, d.card.getBoundingClientRect(), () => { cleanup(); notify(); });
  }

  document.addEventListener("pointerdown", (e) => {
    const card = e.target.closest("[data-drag]");
    if (!card || e.button !== 0 || drag || document.documentElement.dataset.editing !== "true") return;
    const from = card.closest("[data-dropzone]");
    if (!from) return;
    const touch = e.pointerType !== "mouse";
    drag = { card, from, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, touch, zone: null };
    if (touch) drag.timer = setTimeout(() => drag && !drag.started && start(), LONG_PRESS);
  });

  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.started) return;
    const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
    if (drag.touch) {
      if (moved > 8) { clearTimeout(drag.timer); drag = null; } // 是在滚动页面
    } else if (moved > MOVE_THRESHOLD) {
      start();
    }
  });

  // 开始拖之后阻止触屏滚动
  document.addEventListener("touchmove", (e) => { if (drag?.started) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (e) => { if (drag) e.preventDefault(); });
  document.addEventListener("pointerup", () => drag && end(true));
  document.addEventListener("pointercancel", () => drag && end(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drag) end(false); });
  // 拖完松手时浏览器还会补发一次 click，不要因此打开课程详情
  document.addEventListener("click", (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
})();
