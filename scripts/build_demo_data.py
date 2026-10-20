#!/usr/bin/env python3
"""
生成「示例模式」用的演示数据：app/server/demo/demo-data.json。

输入：从生产库导出的一位真实用户的「我的计划」与课表（JSON，含 courses / meetings 两个数组，
字段同 my_plan_courses / user_course_meetings）。导出文件含个人数据，不入库。

规则：
  1. 必修课（培养方案 official 必修）保持原样：沿用该用户的学期安排；未落位的按培养方案默认学期。
  2. 选修课按毕业要求重新挑选：通识选修 16、大类平台选修 10、经法管融通 6、专业选修 20、素质选修 6。
  3. 成绩全部重新随机（不保留真实成绩），整体偏优：每学期学分加权均分 ≥ 86。
  4. 8 个学期都有课；课表沿用原课表的上课时间（教师匿名化），缺课表的课程按空闲时段合成。

用法：python3 scripts/build_demo_data.py --input /path/to/export.json
"""
import argparse
import json
import random
from collections import defaultdict
from pathlib import Path

SEED = 20240901
OUT = Path(__file__).resolve().parent.parent / "app" / "server" / "demo" / "demo-data.json"

# ---- 选修课挑选（课程号 → 学期）。official = 培养方案课程，其余为自定义课程（从导出数据取详情）。
OFFICIAL_ELECTIVES = {
    # 大类平台·选修 10
    "B0800243": 2,  # 会计学 3
    "B0290050": 3,  # 数字经济学 3
    "B0901470": 4,  # 应用随机过程 2
    "B1301960": 5,  # 机器学习基础与实践 2
    # 专业教育·选修 20
    "B0300633": 4,  # 商业银行经营管理 3
    "B0300580": 4,  # 金融中介学 2
    "B0300510": 5,  # 金融计量学(双语) 3
    "B0301870": 5,  # 金融科技导论 2
    "B0390090": 5,  # 证券投资分析(实验) 2
    "B0301890": 6,  # 行为金融 3
    "B0300560": 6,  # 金融衍生工具 2
    "B0301480": 7,  # 财务报表分析与证券定价(双语) 3（任意学期开课）
}
# 自定义课程：课程号 → (学期, 学分计入方向覆盖)
CUSTOM_ELECTIVES = {
    # 通识教育·选修 16（含跨专业、计入通识的经法管）
    "B1380110": (2, None),  # Python数据科学导论 2
    "B1080250": (2, None),  # 职场高情商工作技巧 1
    "B1580270": (3, None),  # 定向越野 1
    "M1885380": (3, None),  # 走进民航 2
    "B0902750": (4, None),  # Python数据分析 3
    "B1302680": (4, None),  # 机器学习与深度学习（跨专业）2
    "B1302670": (5, None),  # 计算机网络（跨专业）3
    "B0480090": (5, "通识教育-选修"),  # 商法与企业经营管理（经法管→通识）2
    # 大类平台·经法管融通 6
    "B0480240": (3, "大类平台-选修"),  # 金融创新与金融法典型案例分析 2
    "B0780020": (5, "大类平台-选修"),  # 税法（税）2
    "B0280080": (5, "大类平台-选修"),  # 生活中的经济学 2
    # 素质教育·选修 6
    "P001": (7, None),  # 课外素质教育 6
}
# 用户未落位的必修课：按培养方案默认学期放置
REQUIRED_TERM_FALLBACK = {"B1890120": 3}  # 社会实践

NO_SCHEDULE_CATEGORIES = {"practice_education"}
NO_SCHEDULE_CODES = {"P001"}

SURNAMES = list("王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕")
BLOCKS = [(1, 2), (3, 4), (6, 7), (8, 9), (10, 11)]
ROOMS = ["首义-文泽", "首义-文津", "首义-文瀚", "首义-文润"]


def term_of(c):
    return c.get("actual_term") or c.get("planned_term")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    args = ap.parse_args()
    src = json.loads(Path(args.input).read_text())
    rnd = random.Random(SEED)

    all_courses = {c["course_code"]: c for c in src["courses"]}
    # 官方课程不看用户是否删过：示例账号会重新复制一份完整的培养方案。
    official = [c for c in src["courses"] if c["origin_type"] == "official"]

    placed = []  # dict(code, term, credits, category, hours, name, kind)
    out_courses = []

    for c in official:
        code = c["course_code"]
        if c["requirement_type"] == "必修" or c["course_subcategory"] == "必修":
            term = term_of(c) or REQUIRED_TERM_FALLBACK.get(code)
            if term is None:
                continue
        elif code in OFFICIAL_ELECTIVES:
            term = OFFICIAL_ELECTIVES[code]
        else:
            continue
        out_courses.append({"origin": "official", "code": code, "term": term})
        placed.append(dict(code=code, term=term, credits=c["credits"], category=c["category_code"],
                           hours=c["total_hours"], name=c["course_name"], section=None))

    for code, (term, cct) in CUSTOM_ELECTIVES.items():
        c = all_courses[code]
        req = c["requirement_type"]
        sub = c["course_subcategory"]
        if req == "跨专业" and sub == "必修":
            sub = None
        section = c["section_code"] or "1"
        out_courses.append({
            "origin": c["origin_type"] if c["origin_type"] != "official" else "manual",
            "code": code,
            "term": term,
            "section": section,
            "name": c["course_name"],
            "categoryCode": c["category_code"],
            "categoryName": c["category_name"],
            "requirementType": req,
            "subcategory": sub,
            "credits": c["credits"],
            "lectureHours": c["lecture_hours"],
            "experimentHours": c["experiment_hours"],
            "extraHours": c["extra_hours"],
            "creditCountTo": cct if req == "经法管融通" else None,
        })
        placed.append(dict(code=code, term=term, credits=c["credits"], category=c["category_code"],
                           hours=c["total_hours"], name=c["course_name"], section=section))

    # ---- 成绩：每学期学分加权均分 ≥ 86，整体偏优
    by_term = defaultdict(list)
    for p in placed:
        by_term[p["term"]].append(p)
    scores = {}
    for t in sorted(by_term):
        rows = by_term[t]
        while True:
            cand = {p["code"]: max(74, min(99, round(rnd.gauss(89, 5)))) for p in rows}
            w = sum(p["credits"] for p in rows)
            avg = sum(cand[p["code"]] * p["credits"] for p in rows) / w if w else 90
            if 86 <= avg <= 92:
                scores.update(cand)
                break
    for oc in out_courses:
        oc["score"] = scores[oc["code"]]

    # ---- 课表：沿用原课表时间（同学期同课程），否则在空闲时段合成
    teacher_alias = {}

    def alias(name):
        if not name:
            return None
        parts = [p for p in name.replace("，", ",").split(",") if p]
        res = []
        for p in parts:
            if p not in teacher_alias:
                teacher_alias[p] = f"{SURNAMES[len(teacher_alias) % len(SURNAMES)]}老师"
            res.append(teacher_alias[p])
        return ",".join(res)

    meetings_src = defaultdict(list)
    for m in src["meetings"]:
        meetings_src[(m["term"], m["course_code"])].append(m)

    out_meetings = []
    occupied = defaultdict(set)  # term -> {(weekday, block_start)}
    pending = []
    for p in sorted(placed, key=lambda p: (p["term"], p["code"])):
        rows = meetings_src.get((p["term"], p["code"]))
        if rows:
            sec = p["section"] if p["section"] and any(r["section_code"] == p["section"] for r in rows) \
                else sorted({r["section_code"] for r in rows}, key=lambda s: (len(s), s))[0]
            p["section"] = p["section"] and sec  # 自定义课程的课序号要与课表一致
            for r in sorted((r for r in rows if r["section_code"] == sec), key=lambda r: r["meeting_no"]):
                out_meetings.append({
                    "term": p["term"], "code": p["code"], "section": sec, "no": r["meeting_no"],
                    "startWeek": r["start_week"], "endWeek": r["end_week"], "weekday": r["weekday"],
                    "startPeriod": r["start_period"], "endPeriod": r["end_period"],
                    "location": r["location_text"], "name": r["course_name"], "teacher": alias(r["teacher"]),
                    "nature": r["course_nature"], "attribute": r["course_attribute"],
                })
                for s in range(r["start_period"], r["end_period"] + 1):
                    occupied[p["term"]].add((r["weekday"], s))
        elif p["hours"] and p["category"] not in NO_SCHEDULE_CATEGORIES and p["code"] not in NO_SCHEDULE_CODES \
                and not p["name"].startswith("形势与政策"):
            pending.append(p)

    for p in pending:
        sessions = 1 if p["hours"] <= 32 else 2
        weeks = max(4, min(16, round(p["hours"] / (2 * sessions))))
        free = [(wd, b) for wd in range(1, 6) for b in BLOCKS
                if not any((wd, s) in occupied[p["term"]] for s in range(b[0], b[1] + 1))]
        rnd.shuffle(free)
        chosen = []
        for slot in free:
            if all(slot[0] != c[0] for c in chosen):
                chosen.append(slot)
            if len(chosen) == sessions:
                break
        room = f"{rnd.choice(ROOMS)}{rnd.randint(1, 5)}0{rnd.randint(1, 9)}"
        teacher = alias(f"__synthetic_{p['code']}")
        for i, (wd, (a, b)) in enumerate(sorted(chosen), start=1):
            out_meetings.append({
                "term": p["term"], "code": p["code"], "section": p["section"] or "1", "no": i,
                "startWeek": 1, "endWeek": weeks, "weekday": wd, "startPeriod": a, "endPeriod": b,
                "location": room, "name": p["name"], "teacher": teacher,
                "nature": "必修" if p["category"] != "professional_education" else "专业课",
                "attribute": None,
            })
            for s in range(a, b + 1):
                occupied[p["term"]].add((wd, s))

    section_by_code = {p["code"]: p["section"] for p in placed}
    for oc in out_courses:
        if oc["origin"] != "official":
            oc["section"] = section_by_code[oc["code"]] or "1"

    data = {
        "description": "示例模式数据：必修沿用真实培养计划安排，选修按毕业要求重选，成绩随机生成（每学期均分≥86），教师匿名。",
        "seed": SEED,
        "courses": out_courses,
        "meetings": out_meetings,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")

    # ---- 汇总
    print(f"courses={len(out_courses)} meetings={len(out_meetings)} synthesized={len(pending)}")
    for t in range(1, 9):
        rows = by_term[t]
        w = sum(p["credits"] for p in rows)
        avg = sum(scores[p["code"]] * p["credits"] for p in rows) / w if w else 0
        nm = len({m["code"] for m in out_meetings if m["term"] == t})
        print(f"term {t}: {len(rows)} 门 {w:g} 学分 均分 {avg:.1f} 有课表 {nm} 门")
    w = sum(p["credits"] for p in placed)
    print("全部加权均分", round(sum(scores[p['code']] * p['credits'] for p in placed) / w, 2), "总学分", w)


if __name__ == "__main__":
    main()
