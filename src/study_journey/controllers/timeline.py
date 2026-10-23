"""四年规划：左栏毕业要求与课程库，右侧八个学期。"""
from __future__ import annotations

from flask import Blueprint, abort, current_app, redirect, render_template, request, url_for

from ..models import progress, timeline
from ..models.catalog import TERMS, course_from_offering, load_catalog
from ..models.offerings import semester_label
from ..models.plan import MoveError
from . import module_version, offering_store, published_offerings, repository

bp = Blueprint("timeline", __name__)


def context() -> dict:
    repo = repository()
    catalog = load_catalog()
    items = repo.items()
    prog = progress.compute(items, catalog)
    offered = published_offerings(repo.calendar)
    return {
        "catalog": catalog,
        "calendar": repo.calendar,
        "progress": prog,
        "timeline": timeline.build(items, repo.calendar, offered),
        "library": timeline.library(prog),
        "offered_now": offered.get(repo.calendar.current_term),
        "is_demo": current_app.config["MODE"] == "demo",
        "offering_semesters": offering_semesters(),
    }


def offering_semesters() -> list[dict]:
    return [dict(e, label=semester_label(e["semester"])) for e in offering_store().semesters()]


def workspace(error: str | None = None, status: int = 200):
    if request.headers.get("X-Fragment") or request.is_json:
        return render_template("_workspace.html", error=error, **context()), status
    return redirect(url_for("timeline.index"))


@bp.get("/")
def index():
    return render_template("timeline.html", **context())


def term_value(raw) -> int | None:
    return int(raw) if raw not in (None, "", "pending") and str(raw).isdigit() else None


@bp.post("/plan/move")
def move():
    data = request.get_json(silent=True) or request.form
    try:
        repository().move(str(data.get("code", "")), term_value(data.get("term")))
    except MoveError as e:
        return workspace(str(e), 409)
    return workspace()


def find_offered(code: str):
    """在开课数据里找这门课（从最新的学期往前找）。"""
    store = offering_store()
    for entry in reversed(store.semesters()):
        semester = store.get(entry["semester"])
        if semester and code in semester.courses:
            return semester.courses[code]
    return None


@bp.post("/plan/add")
def add():
    """把开课表里的课（培养方案以外的）加进某个学期。"""
    data = request.get_json(silent=True) or request.form
    code, term = str(data.get("code", "")), term_value(data.get("term"))
    repo = repository()
    catalog_course = load_catalog().courses.get(code)
    offered = None if catalog_course else find_offered(code)
    if catalog_course is None and offered is None:
        abort(404)
    course = catalog_course or course_from_offering(offered, module_version())
    try:
        repo.add(course, term)
    except MoveError as e:
        return workspace(str(e), 409)
    return workspace()


@bp.post("/plan/remove")
def remove():
    data = request.get_json(silent=True) or request.form
    try:
        repository().remove(str(data.get("code", "")))
    except MoveError as e:
        return workspace(str(e), 409)
    return workspace()


@bp.get("/courses/search")
def search():
    """在开课表里搜培养方案以外的课程（通识选修、经法管融通、跨专业……）。"""
    q = request.args.get("q", "").strip()
    repo = repository()
    term = request.args.get("term", type=int) or repo.calendar.current_term
    if term not in TERMS:
        abort(400)
    wanted = repo.calendar.semester_id(term)
    semester = offering_store().reference_for(wanted)
    taken = {i.course.code for i in repo.items()}
    results = []
    if q and semester:
        for code, c in semester.courses.items():
            if code in taken or code not in semester.sections:
                continue
            if q.lower() in c.name.lower() or q.upper() in code:
                results.append(course_from_offering(c, module_version()))
        results.sort(key=lambda c: (not c.name.startswith(q), c.name))
    return render_template(
        "_search_results.html", q=q, results=results[:30], total=len(results),
        semester=semester, is_reference=semester is not None and semester.id != wanted,
    )


@bp.post("/plan/reset")
def reset():
    repository().reset()
    return redirect(url_for("timeline.index"))
