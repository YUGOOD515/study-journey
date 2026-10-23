"""学校每学期发布的开课 Excel → 每学期一个开课数据 JSON。

一个学期通常有 2～3 份文件，按文件名和表头自动识别：
- 「本科生选课」：全校开课班级（课程号、课序号、教师、周次、时间……）
- 「补退选」：补退选阶段新增的课程（MOOC、新增专业课）
- 「…课程一览表」：通识选修、经法管融通、素质教育课程所属模块

「有课表课程」是个人课表导出，属于个人数据，这里会跳过。

用法：uv run --group importers python -m study_journey.services.importers.offerings_xlsx \
        src_data public/data/offerings
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from .offerings_digest import content_version, dumps

SCHEMA_VERSION = 1
DAYS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7}

# 不同学期的表头叫法不一样，统一成内部字段名
MAIN_COLUMNS = {
    "code": ("课程编号", "课程号", "课程编码"),
    "seq": ("课序号",),
    "name": ("课程名称", "课程名"),
    "group": ("分组名称",),
    "note": ("选课限制说明",),
    "classes": ("合班名称",),
    "campus": ("上课校区",),
    "department": ("开课单位",),
    "hours": ("学时",),
    "credits": ("学分",),
    "attribute": ("课程属性",),
    "teachers": ("上课教师",),
    "weeks": ("上课周次",),
    "times": ("上课时间",),
    "location": ("上课地点",),
    "gender": ("性别要求",),
    "open": ("选课开放",),
    "platform": ("学习平台",),
    "remark": ("备注", "备注1"),
}
MODULE_COLUMNS = {
    "code": ("课程编号",),
    "name": ("课程名称",),
    "department": ("开课单位",),
    "category": ("课程类别",),
    "attribute": ("课程性质", "课程属性"),
    "hours": ("学时",),
    "credits": ("学分",),
}


class OfferingsFileError(ValueError):
    pass


@dataclass
class Sheet:
    path: Path
    kind: str  # main / adddrop / modules / personal
    semester: str
    header: list[str]
    rows: list[list[str]] = field(default_factory=list)


# ---------- 读取 ----------

def cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return re.sub(r"\s+", " ", str(value)).strip()


def read_rows(path: Path) -> list[list[str]]:
    """读出第一个非空工作表的所有行（.xls 用 xlrd，.xlsx 用 openpyxl）。"""
    if path.suffix.lower() == ".xls":
        import xlrd

        book = xlrd.open_workbook(path)
        for sheet in book.sheets():
            if sheet.nrows:
                return [[cell_text(v) for v in sheet.row_values(i)] for i in range(sheet.nrows)]
        return []
    from openpyxl import load_workbook

    book = load_workbook(path, read_only=True, data_only=True)
    for sheet in book.worksheets:
        rows = [[cell_text(v) for v in row] for row in sheet.iter_rows(values_only=True)]
        if any(any(r) for r in rows):
            return rows
    return []


def semester_of(name: str) -> str:
    """文件名 → 学期编号，如 2025-2026学年第2学期 → 2025-2026-2。"""
    if m := re.search(r"(\d{4})-(\d{4})学年第([12一二])学期", name):
        half = {"一": "1", "二": "2"}.get(m[3], m[3])
        return f"{m[1]}-{m[2]}-{half}"
    if m := re.search(r"(\d{4})-(\d{4})-([12])", name):
        return f"{m[1]}-{m[2]}-{m[3]}"
    raise OfferingsFileError(f"无法从文件名识别学期：{name}")


def kind_of(name: str, header: list[str]) -> str:
    if "有课表课程" in name or "上课班级" in header:
        return "personal"
    if "补退选" in name:
        return "adddrop"
    if "一览表" in name or any(h.startswith("所属模块") for h in header) and "课序号" not in header:
        return "modules"
    if "课序号" in header:
        return "main"
    raise OfferingsFileError(f"无法识别表格类型：{name}")


def load_sheet(path: Path) -> Sheet:
    rows = read_rows(path)
    for i, row in enumerate(rows[:10]):
        if any(h in row for h in ("课程编号", "课程号", "课程编码")):
            header = row
            body = [r for r in rows[i + 1 :] if any(r)]
            return Sheet(path, kind_of(path.name, header), semester_of(path.name), header, body)
    raise OfferingsFileError(f"找不到表头：{path.name}")


def pick(row: list[str], header: list[str], names: tuple[str, ...]) -> str:
    for n in names:
        if n in header:
            i = header.index(n)
            return row[i] if i < len(row) else ""
    return ""


def module_columns(header: list[str]) -> dict[str, int]:
    """所属模块列：带「2022」「2024」字样的按版本存，只有一列的记为 default。"""
    found = {}
    for i, h in enumerate(header):
        if h.startswith("所属模块") or h == "通选课类别":
            version = m[0] if (m := re.search(r"20\d\d", h)) else "default"
            found[version] = i
    return found


# ---------- 解析字段 ----------

def parse_weeks(spec: str) -> list[int]:
    """'1-4,9-16' → [1,2,3,4,9,...,16]；'2,4,6' → [2,4,6]。"""
    weeks: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if m := re.fullmatch(r"(\d+)-(\d+)", part):
            weeks.update(range(int(m[1]), int(m[2]) + 1))
        elif part.isdigit():
            weeks.add(int(part))
    return sorted(weeks)


def week_specs(text: str) -> list[str]:
    """'4-14周 ,5,7,9,11,13周 ' → ['4-14', '5,7,9,11,13']。"""
    return re.findall(r"([\d,\-]+)周", text.replace(" ", ""))


def parse_slot(text: str) -> tuple[int, list[int]] | None:
    """'星期三 030405节' → (3, [3,4,5])。"""
    if m := re.search(r"星期([一二三四五六日天])\s*((?:\d\d)+)节", text):
        return DAYS[m[1]], [int(m[2][i : i + 2]) for i in range(0, len(m[2]), 2)]
    return None


def parse_meetings(weeks_text: str, times_text: str, location_text: str = "") -> list[dict]:
    """周次、时间、地点是三列逗号分隔、一一对应的列表；也兼容「4-11周 星期天 1011节」写在一列里。"""
    times = [t for t in times_text.split(",") if t.strip()]
    if not weeks_text:  # 补退选表：周次写在时间里
        specs = [week_specs(t)[0] if week_specs(t) else "" for t in times]
    else:
        specs = week_specs(weeks_text)
    if len(specs) == 1 and len(times) > 1:
        specs *= len(times)
    places = [p.strip() for p in location_text.split(",")] if location_text else []
    merged: dict[tuple, set[int]] = {}  # 同一时间、同一地点的几段周次合并成一条
    for i, t in enumerate(times):
        slot = parse_slot(t)
        if slot is None:
            continue
        weeks = parse_weeks(specs[i]) if i < len(specs) else []
        place = places[i] if i < len(places) else (places[0] if len(places) == 1 else "")
        merged.setdefault((slot[0], tuple(slot[1]), place), set()).update(weeks)
    meetings = []
    for (day, periods, place), weeks in merged.items():
        meeting = {"weeks": sorted(weeks), "day": day, "periods": list(periods)}
        if place:
            meeting["location"] = place
        meetings.append(meeting)
    return meetings


def split_list(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"[,，]", text) if p.strip()]


def number(text: str) -> float:
    try:
        return float(text)
    except ValueError:
        return 0.0


# ---------- 组装 ----------

def build_semester(semester: str, sheets: list[Sheet]) -> dict:
    courses: dict[str, dict] = {}
    sections: list[dict] = []
    seen: set[str] = set()

    def course(code: str, row: list[str], header: list[str], columns: dict) -> dict:
        c = courses.setdefault(code, {"code": code})
        for key in ("name", "department", "attribute", "category"):
            if key in columns and not c.get(key) and (v := pick(row, header, columns[key])):
                c[key] = v
        for key in ("credits", "hours"):
            if key in columns and not c.get(key) and (v := pick(row, header, columns[key])):
                c[key] = number(v)
        return c

    for sheet in sorted(sheets, key=lambda s: ("modules", "main", "adddrop").index(s.kind)):
        h = sheet.header
        if sheet.kind == "modules":
            mods = module_columns(h)
            for row in sheet.rows:
                code = pick(row, h, MODULE_COLUMNS["code"])
                if not code:
                    continue
                c = course(code, row, h, MODULE_COLUMNS)
                for version, i in mods.items():
                    if i < len(row) and row[i]:
                        c.setdefault("modules", {})[version] = row[i]
            continue

        mods = module_columns(h)
        extra = 0
        for row in sheet.rows:
            code = pick(row, h, MAIN_COLUMNS["code"])
            if not code:
                continue
            c = course(code, row, h, MAIN_COLUMNS)
            for version, i in mods.items():
                if i < len(row) and row[i]:
                    c.setdefault("modules", {}).setdefault(version, row[i])
            seq = pick(row, h, MAIN_COLUMNS["seq"])
            if not seq:
                extra += 1
                seq = f"补{extra}"
            note = pick(row, h, MAIN_COLUMNS["note"])
            group = pick(row, h, MAIN_COLUMNS["group"])
            if not group and note and sheet.kind == "main" and "分组名称" not in h:
                group, note = note, ""  # 早期表格把分组写在「选课限制说明」里
            section = {
                "code": code,
                "seq": seq,
                "teachers": split_list(pick(row, h, MAIN_COLUMNS["teachers"])),
                "classes": split_list(pick(row, h, MAIN_COLUMNS["classes"])),
                "campus": pick(row, h, MAIN_COLUMNS["campus"]),
                "attribute": pick(row, h, MAIN_COLUMNS["attribute"]),
                "meetings": parse_meetings(
                    pick(row, h, MAIN_COLUMNS["weeks"]),
                    pick(row, h, MAIN_COLUMNS["times"]),
                    pick(row, h, MAIN_COLUMNS["location"]),
                ),
                "source": sheet.kind,
            }
            optional = {
                "group": group,
                "note": note,
                "gender": "" if (g := pick(row, h, MAIN_COLUMNS["gender"])) in ("", "全部") else g,
                "closed": pick(row, h, MAIN_COLUMNS["open"]) == "关闭",
                "platform": pick(row, h, MAIN_COLUMNS["platform"]),
                "remark": pick(row, h, MAIN_COLUMNS["remark"]),
            }
            section.update({k: v for k, v in optional.items() if v})
            section = {k: v for k, v in section.items() if v not in ("", [])}
            fingerprint = dumps({k: v for k, v in section.items() if k != "seq"})
            if sheet.kind == "adddrop" and fingerprint in seen:
                continue  # 补退选表里偶尔有完全重复的行
            seen.add(fingerprint)
            sections.append(section)

    sections.sort(key=lambda s: (s["code"], s["source"] != "main", natural(s["seq"])))
    return {
        "schema_version": SCHEMA_VERSION,
        "semester": semester,
        "generated": date.today().isoformat(),
        "sources": [
            {"file": s.path.name, "kind": s.kind, "sha256": sha256(s.path)}
            for s in sorted(sheets, key=lambda s: s.path.name)
        ],
        "courses": dict(sorted(courses.items())),
        "sections": sections,
    }


def natural(seq: str) -> tuple:
    return (0, int(seq)) if seq.isdigit() else (1, seq)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def import_directory(src: Path, out: Path) -> list[dict]:
    """导入 src 里的全部开课 Excel，每学期写一个 JSON，并更新 manifest.json。"""
    by_semester: dict[str, list[Sheet]] = {}
    skipped = []
    for path in sorted(src.iterdir()):
        if path.suffix.lower() not in (".xls", ".xlsx") or path.name.startswith(("~$", "培养方案")):
            continue
        sheet = load_sheet(path)
        if sheet.kind == "personal":
            skipped.append(path.name)
            continue
        by_semester.setdefault(sheet.semester, []).append(sheet)

    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf-8")) if manifest_path.exists() else {}
    entries = {e["semester"]: e for e in manifest.get("semesters", [])}
    for semester, sheets in sorted(by_semester.items()):
        data = build_semester(semester, sheets)
        version = content_version(data)
        old = entries.get(semester)
        if old and old["version"] == version:
            continue  # 内容没变，不重写文件
        (out / f"{semester}.json").write_text(dumps(data), encoding="utf-8")
        entries[semester] = {
            "semester": semester,
            "file": f"{semester}.json",
            "version": version,
            "updated": data["generated"],
            "courses": len(data["courses"]),
            "sections": len(data["sections"]),
        }
    manifest = {"schema_version": SCHEMA_VERSION, "semesters": [entries[k] for k in sorted(entries)]}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name in skipped:
        print(f"跳过个人课表：{name}")
    return manifest["semesters"]


def main(src: str, out: str) -> None:
    for e in import_directory(Path(src), Path(out)):
        print(f"{e['semester']}：{e['courses']} 门课程，{e['sections']} 个教学班（版本 {e['version']}）")


if __name__ == "__main__":
    main(*sys.argv[1:3])
