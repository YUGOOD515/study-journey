// 时间轴交互：拖拽排课（SortableJS）+ 点击课程打开详情选择学期。
// 页面由服务器渲染；每次改动后服务器返回新的 #workspace 片段，这里直接替换。
(() => {
  const { currentTerm, moveUrl } = window.PLAN;
  const dialog = document.getElementById("course-dialog");
  let sortables = [];

  async function move(code, term) {
    const res = await fetch(moveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, term }),
    });
    document.getElementById("workspace").outerHTML = await res.text();
    init();
  }

  function init() {
    sortables.forEach((s) => s.destroy());
    sortables = [...document.querySelectorAll("[data-dropzone]")].map((zone) =>
      Sortable.create(zone, {
        group: { name: "plan", put: zone.dataset.accept === "true" },
        sort: false,
        draggable: "[data-movable]",
        animation: 150,
        forceFallback: true, // 用指针事件模拟拖拽：触屏可用，各浏览器表现一致
        fallbackOnBody: true,
        onMove: (e) => {
          document.querySelectorAll(".is-target").forEach((z) => z.classList.remove("is-target"));
          e.to.classList.add("is-target");
        },
        onEnd: (e) => {
          document.querySelectorAll(".is-target").forEach((z) => z.classList.remove("is-target"));
          if (e.from !== e.to) move(e.item.dataset.code, e.to.dataset.term);
        },
      })
    );
  }

  function field(name) {
    return dialog.querySelector(`[data-field="${name}"]`);
  }
  function show(name, visible) {
    dialog.querySelectorAll(`[data-show="${name}"]`).forEach((el) => (el.hidden = !visible));
  }

  function open(card) {
    const d = card.dataset;
    for (const key of ["name", "credits", "nature", "offered", "status", "score", "warning"]) {
      field(key).textContent = key === "credits" ? `${d.credits} 学分` : d[key] || "";
    }
    show("score", Boolean(d.score));
    show("warning", Boolean(d.warning));
    const locked = "locked" in d;
    show("move", !locked);
    show("locked", locked);
    const terms = field("terms");
    terms.replaceChildren();
    const options = [];
    for (let t = currentTerm; t <= 8; t++) options.push([String(t), `第 ${t} 学期`]);
    options.push(["pending", "待安排"]);
    for (const [value, label] of options) {
      const btn = document.createElement("button");
      const active = (d.term || "pending") === value;
      btn.type = "button";
      btn.textContent = label;
      btn.disabled = active;
      btn.className =
        "rounded-md border px-2 py-2 text-xs " +
        (active ? "border-blue text-blue" : "border-line hover:border-ink-2");
      btn.addEventListener("click", async () => {
        dialog.close();
        await move(d.code, value);
      });
      terms.append(btn);
    }
    dialog.showModal();
  }

  document.addEventListener("click", (e) => {
    const card = e.target.closest("[data-card]");
    if (card) open(card);
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // 点遮罩关闭
  });

  init();
  // 窄屏时把当前学年滚到眼前
  const board = document.querySelector(".board");
  const current = document.querySelector("[data-current-year]");
  if (board && current && board.scrollWidth > board.clientWidth) {
    board.scrollLeft = current.offsetLeft - board.offsetLeft - 24;
  }
})();
