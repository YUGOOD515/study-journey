"""培养方案：课程目录与毕业学分要求（只读）。"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TERMS = range(1, 9)
CATEGORY_ORDER = [
    "general_education",
    "major_platform",
    "professional_education",
    "quality_education",
    "practice_education",
]


@dataclass(frozen=True)
class Course:
    code: str
    name: str
    category: str
    nature: str  # 必修 / 选修 / 跨专业 / 经法管融通
    credits: float
    offered_term: str | None = None
    subcategory: str | None = None
    lecture_hours: int = 0
    experiment_hours: int = 0
    extra_hours: int = 0
    prerequisite_code: str | None = None
    credit_count_to: str | None = None  # 经法管融通课程的学分计入方向
    in_program: bool = True  # False = 自选课程（不在培养方案里）

    @property
    def is_required(self) -> bool:
        return self.nature == "必修"

    @property
    def allowed_terms(self) -> list[int]:
        """培养方案建议的开课学期；'1-8'、'5-7' 是范围，'A' 或空表示不限。"""
        s = self.offered_term or ""
        if m := re.fullmatch(r"(\d)-(\d)", s):
            return list(range(int(m[1]), int(m[2]) + 1))
        if s.isdigit() and int(s) in TERMS:
            return [int(s)]
        return list(TERMS)


@dataclass(frozen=True)
class Requirement:
    category: str
    type: str  # required / elective / interdisciplinary
    name: str
    credits: float


@dataclass(frozen=True)
class Catalog:
    program: str
    category_names: dict[str, str]
    requirements: tuple[Requirement, ...]
    courses: dict[str, Course]

    @property
    def total_required(self) -> float:
        return sum(r.credits for r in self.requirements)

    def category_required(self, category: str) -> float:
        return sum(r.credits for r in self.requirements if r.category == category)


@lru_cache(maxsize=1)
def load_catalog(path: Path = DATA_DIR / "program.json") -> Catalog:
    raw = json.loads(path.read_text(encoding="utf-8"))
    courses = {}
    for c in raw["courses"]:
        c = {k: v for k, v in c.items() if k != "source"}
        courses[c["code"]] = Course(**c)
    return Catalog(
        program=raw["program"],
        category_names=raw["categories"],
        requirements=tuple(Requirement(**r) for r in raw["requirements"]),
        courses=courses,
    )


def course_from_offering(offered, module_version: str) -> Course:
    """把开课表里、培养方案以外的课程变成自选课程，并按学分规则归类（docs/16 §2）。

    - 所属模块是「经法管融通」→ 大类平台·经法管融通（上限 6 学分，超出计入通识选修）
    - 通识教育课程、MOOC 通识选修 → 通识教育·选修
    - 素质教育课程 → 素质教育·选修
    - 其他专业的专业课 → 跨专业（计入通识选修）
    """
    module = offered.module(module_version)
    if module and "经法管融通" in module:
        category, nature = "major_platform", "经法管融通"
    elif offered.category == "素质教育课程":
        category, nature = "quality_education", "选修"
    elif offered.category == "通识教育课程" or (module and offered.category is None):
        category, nature = "general_education", "选修"
    else:
        category, nature = "general_education", "跨专业"
    return Course(
        code=offered.code,
        name=offered.name,
        category=category,
        nature=nature,
        credits=float(offered.credits or 0),
        subcategory=module,
        in_program=False,
    )
