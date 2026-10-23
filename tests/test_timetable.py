import json

from study_journey import create_app
from study_journey.models.catalog import load_catalog
from study_journey.models.offerings import Meeting, OfferingStore, Section, memory_loader
from study_journey.models.plan import Calendar
from study_journey.models.sqlite_repository import SqliteRepository
from study_journey.models.timetable import (
    Block,
    assign_lanes,
    auto_arrange,
    find_conflicts,
    in_class,
    overlap,
    shift_class,
)


def sec(seq, day, periods, weeks=range(1, 17), classes=(), code="X"):
    return Section(code, seq, ("老师",), tuple(classes), meetings=(Meeting(tuple(weeks), day, tuple(periods)),))


def test_class_matching():
    assert in_class(("数金2401班", "金融2401班"), "数金2401班")
    assert in_class(("首数金2401班",), "数金2401班")  # 首义校区
    assert in_class(("数金[2401-2403]班",), "数金2402班")
    assert not in_class(("数金（双）2401班",), "数金2401班")
    assert not in_class(("数金2401班",), None)
    assert shift_class("数金2401班", 1) == "数金2301班" and shift_class("数金2401班", 0) == "数金2401班"


def test_overlap_needs_same_day_periods_and_weeks():
    a = Meeting(tuple(range(1, 9)), 2, (3, 4, 5))
    assert overlap(a, Meeting(tuple(range(5, 17)), 2, (5, 6))) == (5, 6, 7, 8)
    assert overlap(a, Meeting(tuple(range(9, 17)), 2, (3, 4))) == ()  # 前八周和后八周
    assert overlap(a, Meeting(tuple(range(1, 9)), 3, (3, 4))) == ()
    conflicts = find_conflicts({"A": sec("1", 1, (1, 2)), "B": sec("1", 1, (2, 3)), "C": sec("1", 2, (1, 2))})
    assert [(c.first, c.second, c.periods) for c in conflicts] == [("A", "B", (2,))]
    assert conflicts[0].when == "周一 第 2 节（第 1–16 周）"


def test_auto_arrange_avoids_conflicts_and_prefers_my_class():
    fixed = {"A": sec("1", 1, (1, 2))}
    candidates = {
        "B": (sec("1", 1, (1, 2), classes=("数金2401班",)), sec("2", 3, (1, 2)), sec("3", 4, (1, 2), classes=("数金2401班",))),
        "C": (sec("1", 3, (1, 2)), sec("2", 5, (6, 7))),
    }
    picks = auto_arrange(candidates, fixed, "数金2401班")
    assert picks["B"].seq == "3"  # 本班有两个，第一个和 A 冲突
    assert picks["C"].seq in ("1", "2")
    assert not find_conflicts({**fixed, **picks})


def test_lanes_for_overlapping_blocks():
    def block(code, periods):
        return Block(code, code, "major_platform", sec("1", 1, periods), Meeting((1,), 1, tuple(periods)), False)

    lanes = {b.code: (b.lane, b.lanes) for b in assign_lanes([block("A", (1, 2)), block("B", (2, 3)), block("C", (6, 7))])}
    assert lanes == {"A": (0, 2), "B": (1, 2), "C": (0, 1)}


def test_sqlite_choices(tmp_path):
    repo = SqliteRepository(load_catalog(), tmp_path / "t.sqlite3", Calendar(2024, 5))
    assert repo.choices(5) is None
    repo.choose(5, {"B1": "2", "B2": "1"})
    repo.choose(5, {"B2": None})
    assert repo.choices(5) == {"B1": "2"}
    repo.clear_choices(5)
    assert repo.choices(5) == {}  # 清空后不再自动套用默认选择


def offering_files():
    data = {"schema_version": 1, "semester": "2026-2027-1", "courses": {}, "sections": [
        {"code": "B0390090", "seq": "1", "teachers": ["甲"], "classes": ["数金2401班"],
         "meetings": [{"weeks": list(range(1, 17)), "day": 2, "periods": [3, 4, 5]}]},
        {"code": "B0390090", "seq": "2", "teachers": ["乙"], "classes": ["金融2401班"],
         "meetings": [{"weeks": list(range(1, 17)), "day": 4, "periods": [1, 2]}]},
        {"code": "B0301870", "seq": "1", "teachers": ["丙"], "classes": ["其他班"],
         "meetings": [{"weeks": list(range(1, 17)), "day": 2, "periods": [4, 5]}]},
    ]}
    manifest = {"schema_version": 1, "semesters": [{"semester": "2026-2027-1", "file": "a.json", "version": "v", "updated": "2026-10-01"}]}
    return {"manifest.json": json.dumps(manifest), "a.json": json.dumps(data)}


def test_timetable_pages():
    app = create_app({"MODE": "demo", "TESTING": True})
    app.extensions["offerings"] = OfferingStore([memory_loader(offering_files())])
    c = app.test_client()
    r = c.get("/timetable?term=5")
    assert r.status_code == 200 and "2026 秋课表" in r.text
    assert r.text.count("tt-block ") == 1  # 默认选上本班的教学班
    r = c.post("/timetable/choose", data={"term": 5, "code": "B0301870", "seq": "1"}, headers={"X-Fragment": "1"})
    assert "1 处时间冲突" in r.text and r.text.count("tt-conflict") == 2
    r = c.post("/timetable/choose", data={"term": 5, "code": "B0390090", "seq": "2"}, headers={"X-Fragment": "1"})
    assert "时间冲突" not in r.text
    r = c.post("/timetable/clear", data={"term": 5})
    assert r.status_code == 302
    assert c.get("/timetable?term=5").text.count("tt-block ") == 0
    r = c.post("/timetable/auto", data={"term": 5}, headers={"X-Fragment": "1"})
    assert r.text.count("tt-block ") == 2 and "时间冲突" not in r.text
    assert c.get("/timetable?term=5&week=3", headers={"X-Fragment": "1"}).text.startswith("{#") is False
    assert c.get("/timetable?term=9").status_code == 400
    assert "四年规划" in c.get("/").text


def test_pick_finder_add_remove():
    files = offering_files()
    data = json.loads(files["a.json"])
    data["courses"] = {
        "B0390090": {"name": "课甲", "credits": 2},
        "B0301870": {"name": "课乙", "credits": 2},
        "X0000001": {"name": "电影赏析", "credits": 2, "category": "通识教育课程"},
    }
    data["sections"].append({"code": "X0000001", "seq": "1", "teachers": ["丁"], "classes": [],
                             "meetings": [{"weeks": list(range(1, 17)), "day": 3, "periods": [6, 7]}]})
    data["sections"].append({"code": "X0000001", "seq": "2", "teachers": ["戊"], "classes": [],
                             "meetings": [{"weeks": list(range(1, 17)), "day": 2, "periods": [3, 4]}]})
    files["a.json"] = json.dumps(data)
    app = create_app({"MODE": "demo", "TESTING": True})
    app.extensions["offerings"] = OfferingStore([memory_loader(files)])
    c = app.test_client()

    # 挑班：两个教学班两种时间，周二那组和已选的课乙冲突
    c.post("/timetable/choose", data={"term": 5, "code": "B0301870", "seq": "1"})
    r = c.get("/timetable?term=5&pick=B0390090")
    assert 'data-pick-panel' in r.text and r.text.count("tt-ghost ") == 2 and "tt-ghost-conflict" in r.text

    # 找课：周三第 6 节能上电影赏析；周二第 3 节的班和已选的课冲突，不列出
    r = c.get("/timetable?term=5&slot=3-6")
    assert "周三第 6 节能上的课" in r.text and "电影赏析" in r.text and "通识选修" in r.text
    assert "电影赏析" not in c.get("/timetable?term=5&slot=2-3", headers={"X-Fragment": "finder"}).text
    assert "电影赏析" in c.get("/timetable?term=5&find=1&q=电影", headers={"X-Fragment": "finder"}).text

    # 加入本学期：成为自选课程，并选上那个教学班；在四年规划里也能看到
    r = c.post("/timetable/add", data={"term": 5, "code": "X0000001", "seq": "1"}, headers={"X-Fragment": "1"})
    assert r.status_code == 200 and "电影赏析" in r.text and r.text.count("tt-block ") >= 2
    assert "电影赏析" in c.get("/").text
    r = c.post("/timetable/remove", data={"term": 5, "code": "X0000001"}, headers={"X-Fragment": "1"})
    assert "电影赏析" not in r.text
    assert c.post("/timetable/add", data={"term": 5, "code": "NOPE"}).status_code == 404


def test_plan_add_search_remove():
    app = create_app({"MODE": "demo", "TESTING": True})
    app.extensions["offerings"] = OfferingStore([memory_loader(offering_files())])
    c = app.test_client()
    r = c.get("/")
    assert "课程库" in r.text and "排课表 →" in r.text and "已完成" in r.text
    assert c.get("/courses/search?q=").text.strip() == ""
    r = c.post("/plan/add", json={"code": "NOPE", "term": 6})
    assert r.status_code == 404
