// 学期课表：选教学班、自动排课、切换周次时只替换 #timetable 片段，不整页刷新。
(() => {
  async function swap(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { "X-Fragment": "1" } });
    if (!res.ok) return (location.href = url);
    const box = document.getElementById("timetable");
    const y = window.scrollY;
    box.outerHTML = await res.text();
    window.scrollTo(0, y);
  }

  function pageUrl() {
    const box = document.getElementById("timetable");
    const url = new URL("/timetable", location.origin);
    url.searchParams.set("term", box.dataset.term);
    if (box.dataset.week) url.searchParams.set("week", box.dataset.week);
    return url;
  }

  document.addEventListener("change", (e) => {
    const form = e.target.closest("form");
    if (!form) return;
    if (form.matches("[data-choose]")) {
      swap(form.action, { method: "POST", body: new FormData(form) });
    } else if (form.matches("[data-week-form]")) {
      const url = new URL(form.action, location.origin);
      for (const [k, v] of new FormData(form)) if (v) url.searchParams.set(k, v);
      swap(url).then(() => history.replaceState(null, "", url));
    }
  });

  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!form.matches("[data-fragment]")) return;
    e.preventDefault();
    await swap(form.action, { method: "POST", body: new FormData(form) });
    history.replaceState(null, "", pageUrl());
  });

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-nav][href]");
    if (!link || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    swap(link.href).then(() => history.pushState(null, "", link.href));
  });
  window.addEventListener("popstate", () => swap(location.href));
})();
