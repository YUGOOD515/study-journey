"""学期课表：选教学班、自动排课、按周查看。"""
from __future__ import annotations

from flask import Blueprint, abort, current_app, flash, redirect, render_template, request, url_for

from ..models import timetable
from ..models.catalog import TERMS, course_from_offering, load_catalog
from ..models.offerings import semester_label
from ..models.plan import MoveError
from ..models.timetable import auto_arrange, find_courses, in_class, shift_class
from . import module_version, offering_store, repository

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


def slot_arg(source) -> tuple[int, int] | None:
    """'3-6' → 周三第 6 节。"""
    raw = str(source.get("slot") or "")
    day, _, period = raw.partition("-")
    if day.isdigit() and period.isdigit() and 1 <= int(day) <= 7 and int(period) in timetable.PERIODS:
        return int(day), int(period)
    return None


def candidates(term: int, semester) -> dict:
    """本学期还能加进来的课：开课表里有、没修过、也不在本学期的课。"""
    repo = repository()
    catalog = load_catalog()
    items = {i.course.code: i for i in repo.items()}
    version = module_version()
    result = {}
    for code, offered in semester.courses.items():
        item = items.get(code)
        if item is not None:
            if item.locked or item.term == term or item.course.category == "practice_education":
                continue
            note = f"原计划在{repo.calendar.label(item.term)}" if item.term else "待安排"
            result[code] = (item.course, note)
        elif code not in catalog.courses:
            result[code] = (course_from_offering(offered, version), None)
    return result


def context(term: int, week: int | None, pick: str | None = None, finder: dict | None = None) -> dict:
    """finder：{'slot': (星期, 节次) 或 None, 'q': 搜索词}，打开找课面板时传。"""
    repo = repository()
    items = [i for i in repo.items() if i.term == term]
    semester, is_reference, cls = semester_for(term)
    choices = repo.choices(term)
    if choices is None:
        choices = default_choices(items, semester, cls)
    table = timetable.build(term, repo.calendar.label(term), items, semester, is_reference, choices, cls, week, pick)
    found = None
    if finder is not None:
        day, period = finder["slot"] or (None, None)
        found = find_courses(semester, candidates(term, semester) if semester else {}, table.chosen, day, period, finder["q"])
    return {
        "table": table,
        "finder": found,
        "can_edit": term >= repo.calendar.current_term,
        "calendar": repo.calendar,
        "is_demo": current_app.config["MODE"] == "demo",
        "periods": timetable.PERIODS,
        "period_groups": timetable.PERIOD_GROUPS,
        "semester_label": semester_label,
        "term_credits": {t: sum(i.course.credits for i in repo.items() if i.term == t) for t in TERMS},
    }


def respond(term: int, week: int | None, error: str | None = None, pick: str | None = None):
    """操作完成后的课表。pick：继续展开这门课的挑班面板（比如刚换了教学班）。"""
    if request.headers.get("X-Fragment"):
        return render_template("_timetable.html", error=error, slot=None, **context(term, week, pick)), 409 if error else 200
    if error:
        flash(error, "error")
    return redirect(url_for("timetable.show", term=term, week=week, pick=pick))


@bp.get("/timetable")
def show():
    args = request.args
    term, week = term_arg(args), week_arg(args)
    slot = slot_arg(args)
    finder = {"slot": slot, "q": args.get("q", "")} if slot or "find" in args or args.get("q") else None
    pick = None if finder else args.get("pick")
    template = "_timetable.html" if request.headers.get("X-Fragment") else "timetable.html"
    if request.headers.get("X-Fragment") == "finder" and finder is not None:
        template = "_finder.html"
    return render_template(template, catalog=load_catalog(), slot=slot, **context(term, week, pick, finder))


def current_choices(term: int) -> dict[str, str]:
    """当前生效的选择（包括还没保存过的默认选择），改动在它的基础上进行。"""
    return {r.item.course.code: r.chosen.seq for r in context(term, None)["table"].rows if r.chosen}


def save_choice(term: int, code: str, seq: str | None) -> None:
    repo = repository()
    picks = current_choices(term)
    picks[code] = seq
    repo.clear_choices(term)
    repo.choose(term, {k: v for k, v in picks.items() if v})


@bp.post("/timetable/choose")
def choose():
    term, week = term_arg(request.form), week_arg(request.form)
    save_choice(term, request.form.get("code", ""), request.form.get("seq") or None)
    return respond(term, week, pick=request.form.get("pick") or None)


@bp.post("/timetable/add")
def add():
    """从找课面板把一门课加进本学期，并选上指定的教学班。培养方案以外的课作为自选课程加入规划。"""
    term, week = term_arg(request.form), week_arg(request.form)
    code, seq = request.form.get("code", ""), request.form.get("seq") or None
    semester, _, _ = semester_for(term)
    found = candidates(term, semester).get(code) if semester else None
    if found is None:
        abort(404)
    repo = repository()
    course = found[0]
    try:
        if any(i.course.code == code for i in repo.items()):
            repo.move(code, term)
        else:
            repo.add(course, term)
    except MoveError as e:
        return respond(term, week, str(e))
    save_choice(term, code, seq)
    return respond(term, week)


@bp.post("/timetable/remove")
def remove():
    """把课移出本学期：培养方案里的课回到待安排，自选课程从规划里删掉。"""
    term, week = term_arg(request.form), week_arg(request.form)
    try:
        repository().remove(request.form.get("code", ""))
    except MoveError as e:
        return respond(term, week, str(e))
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
