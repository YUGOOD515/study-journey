from datetime import date

import pytest

from study_journey.models import progress, timeline
from study_journey.models.catalog import load_catalog
from study_journey.models.demo_repository import DemoRepository, demo_calendar
from study_journey.models.plan import Calendar, MoveError, PlanItem, calendar_for
from study_journey.models.sqlite_repository import SqliteRepository


@pytest.fixture
def catalog():
    return load_catalog()


def test_program_required_credits_match_requirements(catalog):
    for r in catalog.requirements:
        if r.type == "required":
            total = sum(c.credits for c in catalog.courses.values() if c.category == r.category and c.is_required)
            assert total == r.credits, r
    assert catalog.total_required == 160


def test_calendar():
    assert calendar_for(2024, date(2026, 10, 23)).current_term == 5
    assert calendar_for(2024, date(2027, 3, 1)).current_term == 6
    assert calendar_for(2024, date(2025, 1, 10)).current_term == 1
    cal = Calendar(2024, 5)
    assert (cal.label(1), cal.label(2)) == ("2024 秋", "2025 春")
    assert demo_calendar(date(2027, 3, 1)).current_term == 6


def test_demo_progress_and_locks(catalog):
    repo = DemoRepository(catalog, {})
    p = progress.compute(repo.items(), catalog)
    assert p.total("earned") == 107
    assert p.total("earned") + p.total("in_progress") + p.total("planned") == 160
    with pytest.raises(MoveError):
        repo.move("B0200193", 6)  # 微观经济学已修读
    with pytest.raises(MoveError):
        repo.move("B0300350", 3)  # 不能排到过去的学期
    repo.move("B0300350", 6)
    assert {i.course.code: i.term for i in repo.items()}["B0300350"] == 6
    repo.reset()
    assert {i.course.code: i.term for i in repo.items()}["B0300350"] is None


def test_interdisciplinary_cap_overflows_to_general_elective(catalog):
    base = catalog.courses["B0200193"]
    def course(code, credits):
        return base.__class__(code=code, name=code, category="general_education", nature="经法管融通",
                              credits=credits, credit_count_to="大类平台-选修", in_program=False)
    items = [PlanItem(course(f"X{i}", 2), 1, "已修读") for i in range(4)]
    p = progress.compute(items, catalog)
    major = next(c for c in p.categories if c.code == "major_platform")
    general = next(c for c in p.categories if c.code == "general_education")
    assert next(b for b in major.buckets if b.type == "interdisciplinary").earned == 6
    assert next(b for b in general.buckets if b.type == "elective").earned == 2
    assert len(p.overflow) == 1


def test_timeline_warns_on_prerequisite_order(catalog):
    items = [
        PlanItem(catalog.courses["B0300404"], 6),  # 货币金融学
        PlanItem(catalog.courses["B0300883"], 6),  # 证券投资学，先修货币金融学
    ]
    t = timeline.build(items, Calendar(2024, 5))
    cards = {c.item.course.code: c for c in t.columns[5].cards}
    assert "先修课「货币金融学」" in cards["B0300883"].warning


def test_sqlite_repository_defaults_and_move(catalog, tmp_path):
    repo = SqliteRepository(catalog, tmp_path / "t.sqlite3", Calendar(2024, 1))
    items = {i.course.code: i for i in repo.items()}
    assert items["B0900470"].term == 1  # 高等数学(1) 按建议学期
    assert items["B0300633"].term is None  # 选修课待安排
    repo.move("B0300633", 4)
    repo2 = SqliteRepository(catalog, tmp_path / "t.sqlite3", Calendar(2024, 1))
    assert {i.course.code: i.term for i in repo2.items()}["B0300633"] == 4


def test_timeline_past_and_library(catalog):
    repo = DemoRepository(catalog, {})
    items = repo.items()
    t = timeline.build(items, repo.calendar)
    assert [c.term for c in t.upcoming] == list(range(repo.calendar.current_term, 9))
    assert t.past_names == "大一、大二" and t.past_count == sum(len(c.cards) for c in t.past)
    assert timeline.stage_name(5) == "大三上" and timeline.stage_name(8) == "大四下"
    lib = timeline.library(progress.compute(items, catalog))
    assert [s.name for s in lib] == ["通识教育", "大类平台", "专业教育", "素质教育", "实践教育"]
    for section in lib:
        for g in section.groups:
            terms = [c.item.term is None for c in g.cards]
            assert terms == sorted(terms, reverse=True)  # 待安排的在前


def test_add_and_remove_custom_course(catalog, tmp_path):
    from study_journey.models.catalog import course_from_offering
    from study_journey.models.offerings import OfferedCourse

    offered = OfferedCourse("X0000001", "电影赏析", 2, category="通识教育课程", modules=(("v", "人文素养"),))
    course = course_from_offering(offered, "v")
    assert (course.category, course.nature, course.in_program) == ("general_education", "选修", False)
    jfg = course_from_offering(OfferedCourse("X0000002", "法律与金融", 2, modules=(("v", "经法管融通"),)), "v")
    assert jfg.nature == "经法管融通"
    for repo in (SqliteRepository(catalog, tmp_path / "t.sqlite3", Calendar(2024, 5)), DemoRepository(catalog, {})):
        repo.add(course, 6)
        assert {i.course.code: i.term for i in repo.items()}["X0000001"] == 6
        with pytest.raises(MoveError):
            repo.add(course, 7)  # 已经安排过
        repo.remove("X0000001")
        assert "X0000001" not in {i.course.code for i in repo.items()}
        pending = next(i.course for i in repo.items() if i.term is None)
        repo.add(pending, 6)  # 培养方案里的课 = 挪学期
        assert {i.course.code: i.term for i in repo.items()}[pending.code] == 6
        repo.remove(pending.code)
        assert {i.course.code: i.term for i in repo.items()}[pending.code] is None
