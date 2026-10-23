"""学期课表：选教学班、自动排课、按周查看。"""
from __future__ import annotations

from flask import Blueprint, abort, current_app, redirect, render_template, request, url_for

from ..models import timetable
from ..models.catalog import TERMS, load_catalog
from ..models.offerings import semester_label
from ..models.timetable import auto_arrange, in_class, shift_class
from . import offering_store, repository

bp = Blueprint("timetable", __name__)


def my_class(repo) -> str | None:
    if current_app.config["MODE"] == "demo":
        return repo.my_class
    return current_app.config.get("CLASS_NAME")


def term_arg(source) -> int:
    repo = repository()
    raw = source.get("term")
    term = int(raw) if raw and str(raw).isdigit() else repo.calendar.current_term
    if term not in TERMS:
        abort(400)
    return term


def week_arg(source) -> int | None:
    raw = source.get("week")
    return int(raw) if raw and str(raw).isdigit() and 1 <= int(raw) <= 30 else None


def semester_for(term: int):
    """(开课数据, 是否为参考学期, 该数据里对应本人年级的班级名)。"""
    repo = repository()
    wanted = repo.calendar.semester_id(term)
    semester = offering_store().reference_for(wanted)
    years = int(wanted[:4]) - int(semester.id[:4]) if semester else 0
    return semester, semester is not None and semester.id != wanted, shift_class(my_class(repo), years)


def default_choices(items, semester, cls) -> dict[str, str]:
    """从没排过的学期：先把有本班教学班的课选上本班的，其余留给用户。"""
    picks = {}
    for item in items:
        sections = semester.sections.get(item.course.code, ()) if semester else ()
        mine = [s for s in sections if in_class(s.classes, cls)]
        if mine:
            picks[item.course.code] = mine[0].seq
    return picks


def context(term: int, week: int | None) -> dict:
    repo = repository()
    items = [i for i in repo.items() if i.term == term]
    semester, is_reference, cls = semester_for(term)
    choices = repo.choices(term)
    if choices is None:
        choices = default_choices(items, semester, cls)
    table = timetable.build(term, repo.calendar.label(term), items, semester, is_reference, choices, cls, week)
    return {
        "table": table,
        "calendar": repo.calendar,
        "is_demo": current_app.config["MODE"] == "demo",
        "periods": timetable.PERIODS,
        "period_groups": timetable.PERIOD_GROUPS,
        "semester_label": semester_label,
        "term_credits": {t: sum(i.course.credits for i in repo.items() if i.term == t) for t in TERMS},
    }


def respond(term: int, week: int | None):
    if request.headers.get("X-Fragment"):
        return render_template("_timetable.html", **context(term, week))
    return redirect(url_for("timetable.show", term=term, week=week))


@bp.get("/timetable")
def show():
    term, week = term_arg(request.args), week_arg(request.args)
    template = "_timetable.html" if request.headers.get("X-Fragment") else "timetable.html"
    return render_template(template, catalog=load_catalog(), **context(term, week))


def current_choices(term: int) -> dict[str, str]:
    """当前生效的选择（包括还没保存过的默认选择），改动在它的基础上进行。"""
    return {r.item.course.code: r.chosen.seq for r in context(term, None)["table"].rows if r.chosen}


@bp.post("/timetable/choose")
def choose():
    term, week = term_arg(request.form), week_arg(request.form)
    code, seq = request.form.get("code", ""), request.form.get("seq") or None
    repo = repository()
    picks = current_choices(term)
    picks[code] = seq
    repo.clear_choices(term)
    repo.choose(term, {k: v for k, v in picks.items() if v})
    return respond(term, week)


@bp.post("/timetable/auto")
def auto():
    """只给还没选教学班的课自动挑，已选的保持不动。"""
    term, week = term_arg(request.form), week_arg(request.form)
    table = context(term, None)["table"]
    fixed = {r.item.course.code: r.chosen for r in table.rows if r.chosen}
    candidates = {r.item.course.code: r.sections for r in table.unplaced}
    picks = auto_arrange(candidates, fixed, table.my_class)
    repo = repository()
    repo.clear_choices(term)
    repo.choose(term, {**{k: s.seq for k, s in fixed.items()}, **{k: s.seq for k, s in picks.items()}})
    return respond(term, week)


@bp.post("/timetable/clear")
def clear():
    term, week = term_arg(request.form), week_arg(request.form)
    repository().clear_choices(term)
    return respond(term, week)
