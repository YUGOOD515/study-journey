"""开课数据：学校每学期发布的开课表（只读、全校公开）。

数据来自 services/importers/offerings_xlsx.py 生成的 JSON，每学期一个文件，
外加一个 manifest.json 记录有哪些学期、各自的版本。和个人数据（计划、成绩）完全分开存放。
"""
from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

SCHEMA_VERSION = 1
DAY_NAMES = "一二三四五六日"


def semester_label(semester: str) -> str:
    """'2026-2027-1' → '2026 秋'，'2026-2027-2' → '2027 春'。"""
    start, end, half = semester.split("-")
    return f"{start} 秋" if half == "1" else f"{end} 春"


def compress(numbers: Iterable[int]) -> str:
    """[1,2,3,5,7,8] → '1–3, 5, 7–8'。"""
    nums = sorted(set(numbers))
    parts, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        parts.append(str(nums[i]) if i == j else f"{nums[i]}–{nums[j]}")
        i = j + 1
    return ", ".join(parts)


@dataclass(frozen=True)
class Meeting:
    weeks: tuple[int, ...]
    day: int  # 1 = 周一 … 7 = 周日
    periods: tuple[int, ...]
    location: str | None = None

    @property
    def label(self) -> str:
        weeks = f"{compress(self.weeks)} 周"
        gaps = {b - a for a, b in zip(self.weeks, self.weeks[1:])}
        if len(self.weeks) > 2 and gaps == {2}:  # 1,3,5,…,15 → 1–15 周（单周）
            weeks = f"{self.weeks[0]}–{self.weeks[-1]} 周（{'单' if self.weeks[0] % 2 else '双'}周）"
        return f"{weeks}，周{DAY_NAMES[self.day - 1]} 第 {compress(self.periods)} 节"

    @property
    def short(self) -> str:
        """'周二 3–5'，用在下拉选项这种放不下长文字的地方。"""
        return f"周{DAY_NAMES[self.day - 1]} {compress(self.periods)}"

    @property
    def weeks_label(self) -> str:
        return self.label.split("，")[0]


@dataclass(frozen=True)
class Section:
    """一个教学班（课程号 + 课序号）。"""

    code: str
    seq: str
    teachers: tuple[str, ...] = ()
    classes: tuple[str, ...] = ()
    campus: str | None = None
    attribute: str | None = None
    meetings: tuple[Meeting, ...] = ()
    source: str = "main"  # main = 正式选课表，adddrop = 补退选新增
    group: str | None = None
    note: str | None = None
    gender: str | None = None
    closed: bool = False
    platform: str | None = None
    remark: str | None = None

    @property
    def teacher_label(self) -> str:
        return "、".join(self.teachers) or self.platform or "教师待定"

    @property
    def option_label(self) -> str:
        times = "、".join(m.short for m in self.meetings) or "线上 / 时间待定"
        return f"{self.seq} · {self.teacher_label} · {times}"

    @classmethod
    def from_json(cls, raw: dict) -> "Section":
        raw = dict(raw)
        raw["teachers"] = tuple(raw.get("teachers", ()))
        raw["classes"] = tuple(raw.get("classes", ()))
        raw["meetings"] = tuple(
            Meeting(tuple(m["weeks"]), m["day"], tuple(m["periods"]), m.get("location"))
            for m in raw.get("meetings", ())
        )
        return cls(**raw)


@dataclass(frozen=True)
class OfferedCourse:
    code: str
    name: str
    credits: float = 0
    hours: float = 0
    department: str | None = None
    category: str | None = None
    attribute: str | None = None
    modules: tuple[tuple[str, str], ...] = ()

    def module(self, version: str) -> str | None:
        """所属模块（2022 版、2024 版培养方案的分类不同）。"""
        found = dict(self.modules)
        return found.get(version) or found.get("default")


@dataclass(frozen=True)
class Semester:
    id: str
    version: str
    updated: str
    courses: dict[str, OfferedCourse]
    sections: dict[str, tuple[Section, ...]]  # 按课程号分组

    @property
    def label(self) -> str:
        return semester_label(self.id)

    def offers(self, code: str) -> bool:
        return code in self.sections

    @classmethod
    def from_json(cls, raw: dict, version: str = "", updated: str = "") -> "Semester":
        if raw.get("schema_version") != SCHEMA_VERSION:
            raise ValueError(f"开课数据格式版本不支持：{raw.get('schema_version')}")
        courses = {
            code: OfferedCourse(
                code=code,
                name=c.get("name", code),
                credits=c.get("credits", 0),
                hours=c.get("hours", 0),
                department=c.get("department"),
                category=c.get("category"),
                attribute=c.get("attribute"),
                modules=tuple(sorted(c.get("modules", {}).items())),
            )
            for code, c in raw["courses"].items()
        }
        sections: dict[str, list[Section]] = {}
        for s in raw["sections"]:
            sections.setdefault(s["code"], []).append(Section.from_json(s))
        return cls(
            id=raw["semester"],
            version=version,
            updated=updated or raw.get("generated", ""),
            courses=courses,
            sections={k: tuple(v) for k, v in sections.items()},
        )


Loader = Callable[[str], str | None]  # 文件名 → 文本内容；没有这个文件返回 None


def directory_loader(path: Path) -> Loader:
    def load(name: str) -> str | None:
        f = path / name
        return f.read_text(encoding="utf-8") if f.is_file() else None

    return load


def memory_loader(files: dict[str, str]) -> Loader:
    return files.get


class OfferingStore:
    """按优先级合并多个数据来源（本机下载/导入的数据、仓库自带的数据）。

    同一学期在多个来源里都有时，取更新日期最新的；日期相同时取排在前面的来源。
    """

    def __init__(self, loaders: list[Loader]):
        self.loaders = loaders
        self._cache: dict[str, Semester] = {}
        self._entries: dict[str, tuple[dict, Loader]] | None = None

    def entries(self) -> dict[str, tuple[dict, Loader]]:
        if self._entries is None:
            found: dict[str, tuple[dict, Loader]] = {}
            for loader in self.loaders:
                text = loader("manifest.json")
                if not text:
                    continue
                for e in json.loads(text).get("semesters", []):
                    old = found.get(e["semester"])
                    if old is None or e.get("updated", "") > old[0].get("updated", ""):
                        found[e["semester"]] = (e, loader)
            self._entries = dict(sorted(found.items()))
        return self._entries

    def reset(self) -> None:
        self._entries = None
        self._cache.clear()

    def semesters(self) -> list[dict]:
        return [e for e, _ in self.entries().values()]

    def get(self, semester: str) -> Semester | None:
        if semester in self._cache:
            return self._cache[semester]
        found = self.entries().get(semester)
        if not found:
            return None
        entry, loader = found
        text = loader(entry["file"])
        if not text:
            return None
        data = Semester.from_json(json.loads(text), entry.get("version", ""), entry.get("updated", ""))
        self._cache[semester] = data
        return data

    def reference_id(self, semester: str) -> str | None:
        """这个学期的开课表还没发布时，用最近一个同季（秋/春）学期的作参考。"""
        if semester in self.entries():
            return semester
        half = semester[-1]
        earlier = [s for s in self.entries() if s.endswith(f"-{half}") and s < semester]
        return earlier[-1] if earlier else None

    def reference_for(self, semester: str) -> Semester | None:
        found = self.reference_id(semester)
        return self.get(found) if found else None
