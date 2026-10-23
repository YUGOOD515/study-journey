import json
from pathlib import Path

import pytest

from study_journey import create_app
from study_journey.models.catalog import load_catalog
from study_journey.models.offerings import OfferingStore, Semester, compress, memory_loader
from study_journey.models.plan import Calendar, PlanItem
from study_journey.models.timeline import warning_for
from study_journey.services.importers.offerings_digest import content_version, dumps
from study_journey.services.importers.offerings_xlsx import (
    Sheet,
    build_semester,
    import_directory,
    parse_meetings,
    parse_weeks,
    semester_of,
)
from study_journey.services.offerings_sync import SyncError, sync

ROOT = Path(__file__).resolve().parents[1]


def test_parse_weeks_and_meetings():
    assert parse_weeks("1-3,9,11-12") == [1, 2, 3, 9, 11, 12]
    # 周次和时间一一对应；同一时间地点的两段周次合并
    meetings = parse_meetings("15周 ,9-14,16周 ,15周 ", "星期二 0102节,星期二 0102节,星期一 0102节")
    assert meetings == [
        {"weeks": list(range(9, 17)), "day": 2, "periods": [1, 2]},
        {"weeks": [15], "day": 1, "periods": [1, 2]},
    ]
    # 补退选表：周次写在时间里
    assert parse_meetings("", "5-12周 星期天 1011节") == [{"weeks": list(range(5, 13)), "day": 7, "periods": [10, 11]}]
    # 单双周与地点
    m = parse_meetings("4-14周 ,5,7,9周 ", "星期二 0102节,星期五 0809节", "文泰101,文泰102")
    assert m[1] == {"weeks": [5, 7, 9], "day": 5, "periods": [8, 9], "location": "文泰102"}


def test_semester_of():
    assert semester_of("2025-2026学年第2学期本科生选课.xlsx") == "2025-2026-2"
    assert semester_of("2024-2025学年第一学期课程一览表.xls") == "2024-2025-1"


def make_semester(tmp_path) -> dict:
    f = tmp_path / "x.xlsx"
    f.write_bytes(b"x")
    main = Sheet(f, "main", "2026-2027-1",
                 ["课程编号", "课序号", "课程名称", "学分", "上课教师", "上课周次", "上课时间", "合班名称", "选课开放", "性别要求", "分组名称"],
                 [["B0300404", "1", "货币金融学", "3", "周奕,张三", "1-16周 ", "星期二 0102节", "数金2401班,金融2401班", "开放", "全部", ""],
                  ["B0300404", "2", "货币金融学", "3", "李四", "1-16周 ", "星期四 0304节", "数金2402班", "关闭", "女", "网球"]])
    adddrop = Sheet(f, "adddrop", "2026-2027-1",
                    ["课程编码", "课程名称", "学分", "上课时间", "选课限制说明", "学习平台", "通选课类别"],
                    [["M1881470", "大语言模型与创意写作", "1", "5-12周 星期天 1011节", "新增Mooc通识选修", "超星", "科学思维与人文精神"]] * 2)
    modules = Sheet(f, "modules", "2026-2027-1",
                    ["序号", "课程编号", "课程名称", "所属模块（适用2022版）", "所属模块（适用2024版）", "课程类别"],
                    [["1", "B0300404", "货币金融学", "A", "大类平台（经法管融通）", "专业教育课程"]])
    return build_semester("2026-2027-1", [main, adddrop, modules])


def test_build_semester(tmp_path):
    data = make_semester(tmp_path)
    assert [s["seq"] for s in data["sections"]] == ["1", "2", "补1"]  # 重复的补退选行只留一条
    first, second, mooc = data["sections"]
    assert first["teachers"] == ["周奕", "张三"] and first["classes"] == ["数金2401班", "金融2401班"]
    assert "closed" not in first and second["closed"] and second["gender"] == "女" and second["group"] == "网球"
    assert mooc["platform"] == "超星" and mooc["source"] == "adddrop"
    course = data["courses"]["B0300404"]
    assert course["credits"] == 3 and course["modules"]["2024"] == "大类平台（经法管融通）"
    assert data["courses"]["M1881470"]["modules"] == {"default": "科学思维与人文精神"}

    sem = Semester.from_json(data)
    assert sem.label == "2026 秋" and sem.offers("B0300404") and not sem.offers("B0000000")
    assert sem.courses["M1881470"].module("2024") == "科学思维与人文精神"
    assert sem.sections["B0300404"][0].meetings[0].label == "1–16 周，周二 第 1–2 节"


def test_meeting_label_odd_weeks():
    assert compress([1, 2, 3, 5, 7, 8]) == "1–3, 5, 7–8"
    sem = Semester.from_json({"schema_version": 1, "semester": "2026-2027-2", "courses": {},
                              "sections": [{"code": "X", "seq": "1", "meetings": [{"weeks": [1, 3, 5, 7], "day": 3, "periods": [3, 4, 5]}]}]})
    assert sem.label == "2027 春"
    assert sem.sections["X"][0].meetings[0].label == "1–7 周（单周），周三 第 3–5 节"


def manifest(*entries):
    return json.dumps({"schema_version": 1, "semesters": [
        {"semester": s, "file": f"{s}.json", "version": v, "updated": u} for s, v, u in entries]})


def semester_json(semester, code="B1"):
    return json.dumps({"schema_version": 1, "semester": semester, "courses": {code: {"name": "课"}},
                       "sections": [{"code": code, "seq": "1"}]})


def test_store_priority_and_reference():
    local = memory_loader({"manifest.json": manifest(("2025-2026-1", "new", "2026-01-02")),
                           "2025-2026-1.json": semester_json("2025-2026-1", "LOCAL")})
    bundled = memory_loader({"manifest.json": manifest(("2025-2026-1", "old", "2026-01-01"), ("2025-2026-2", "b", "2026-01-01")),
                             "2025-2026-1.json": semester_json("2025-2026-1", "BUNDLED"),
                             "2025-2026-2.json": semester_json("2025-2026-2")})
    store = OfferingStore([local, bundled])
    assert store.get("2025-2026-1").offers("LOCAL")
    assert store.reference_id("2026-2027-1") == "2025-2026-1"  # 同季、最近的
    assert store.reference_id("2027-2028-2") == "2025-2026-2"
    assert store.reference_id("2024-2025-1") is None
    assert store.get("2030-2031-1") is None


def test_calendar_semester_id():
    cal = Calendar(2024, 5)
    assert cal.semester_id(1) == "2024-2025-1" and cal.semester_id(5) == "2026-2027-1" and cal.semester_id(6) == "2026-2027-2"


def test_timeline_warns_when_not_offered(tmp_path):
    catalog = load_catalog()
    course = next(c for c in catalog.courses.values() if c.category != "practice_education")
    sem = Semester.from_json(json.loads(semester_json("2026-2027-1", "OTHER")))
    item = PlanItem(course, 5, "计划修读")
    assert "开课表里没有找到" in warning_for(item, {}, {}, {5: sem})
    sem2 = Semester.from_json(json.loads(semester_json("2026-2027-1", course.code)))
    assert (warning_for(item, {}, {}, {5: sem2}) or "").find("开课表") < 0


def test_sync_downloads_and_verifies(tmp_path):
    data = json.loads(semester_json("2026-2027-1"))
    version = content_version(data)
    remote = {"https://a/manifest.json": manifest(("2026-2027-1", version, "2026-10-01")),
              "https://a/2026-2027-1.json": dumps(data)}
    assert sync(tmp_path, {}, ("https://a/",), remote.__getitem__) == ["2026-2027-1"]
    assert sync(tmp_path, {"2026-2027-1": version}, ("https://a/",), remote.__getitem__) == []
    assert json.loads((tmp_path / "manifest.json").read_text("utf-8"))["semesters"][0]["version"] == version

    bad = dict(remote, **{"https://a/manifest.json": manifest(("2026-2027-1", "tampered", "2026-10-01"))})
    with pytest.raises(SyncError):
        sync(tmp_path / "b", {}, ("https://a/",), bad.__getitem__)


@pytest.mark.skipif(not (ROOT / "src_data").is_dir(), reason="没有样本 Excel")
def test_import_real_files(tmp_path):
    pytest.importorskip("xlrd")
    pytest.importorskip("openpyxl")
    entries = import_directory(ROOT / "src_data", tmp_path)
    assert len(entries) >= 1 and all(e["sections"] > 1000 for e in entries)
    again = import_directory(ROOT / "src_data", tmp_path)
    assert [e["version"] for e in again] == [e["version"] for e in entries]  # 内容不变，版本不变


def demo_client(tmp_path, files):
    app = create_app({"MODE": "demo", "TESTING": True})
    app.extensions["offerings"] = OfferingStore([memory_loader(files)])
    return app.test_client()


def test_sections_endpoint(tmp_path):
    data = json.loads(semester_json("2026-2027-1", "B0300404"))
    data["sections"][0].update(teachers=["周奕"], meetings=[{"weeks": [1, 2], "day": 2, "periods": [1, 2]}])
    files = {"manifest.json": manifest(("2026-2027-1", "v", "2026-10-01")), "2026-2027-1.json": json.dumps(data)}
    c = demo_client(tmp_path, files)
    r = c.get("/courses/B0300404/sections?term=5")
    assert r.status_code == 200 and "周奕" in r.text and "1 个教学班" in r.text
    r = c.get("/courses/B0300404/sections?term=7")  # 2027 秋还没发布 → 用 2026 秋参考
    assert "仅供参考" in r.text
    r = c.get("/courses/NOPE/sections?term=5")
    assert "没有找到这门课" in r.text
    assert c.get("/courses/B0300404/sections?term=9").status_code == 400
    assert "开课数据：已收录 1 个学期" in c.get("/").text
    assert c.post("/offerings/update").status_code == 404  # 演示版不能更新
