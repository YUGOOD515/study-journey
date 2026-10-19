"""Export a saved or authenticated timetable page to JSON and CSV."""
import argparse
import copy
import getpass
import hashlib
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path

from bs4 import BeautifulSoup
from export_curriculum_csv import table_grid, visible_text, write_csv

URL = "https://jwxt.zuel.edu.cn/jsxsd/xskb/xskb_list.do"


def fetch(cookie, semester=None):
    payload = None
    if semester:
        payload = urllib.parse.urlencode({"xnxq01id": semester, "zc": "",
                                          "sfFD": "1", "wkbkc": "1"}).encode("ascii")
    request = urllib.request.Request(URL, data=payload,
                                    headers={"Cookie": cookie, "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=40) as response:
        raw = response.read()
    soup = BeautifulSoup(raw.decode("utf-8"), "html5lib")
    selected = soup.select_one("#xnxq01id option[selected]")
    if soup.select_one("#timetable") is None or selected is None:
        raise ValueError("Timetable missing; check login session")
    if semester and selected.get("value") != semester:
        raise ValueError("Response semester differs from requested semester")
    return raw


def records(table):
    rows = table.find_all("tr")
    headers = [visible_text(c) for c in rows[1].find_all(["td", "th"], recursive=False)]
    result = []
    for row in rows[2:]:
        values = [visible_text(c) for c in row.find_all(["td", "th"], recursive=False)]
        if len(values) != len(headers):
            raise ValueError("Course record width does not match source header")
        result.append(dict(zip(headers, values)))
    return result


def export(raw, out):
    soup = BeautifulSoup(raw.decode("utf-8"), "html5lib")
    original = soup.select_one("#timetable")
    if original is None:
        raise ValueError("Timetable missing; check login session")

    def selected(selector):
        node = soup.select_one(selector)
        option = node.select_one("option[selected]") or node.select_one("option")
        return {"value": option.get("value"), "label": visible_text(option)}

    detailed = soup.select_one("#sfFD").has_attr("checked")
    table = copy.deepcopy(original)
    details = []
    for y, row in enumerate(table.find_all("tr")):
        for x, cell in enumerate(row.find_all(["td", "th"], recursive=False)):
            variants = cell.find_all("div", recursive=False)
            if not variants:
                continue
            chosen = next((d for d in variants if d.get("id", "").endswith("-2" if detailed else "-1")), None)
            full = next((d for d in variants if d.get("id", "").endswith("-2")), None)
            details.append({"row": y + 1, "column": x + 1,
                            "full_text": visible_text(full) if full else ""})
            for variant in variants:
                if variant is not chosen:
                    variant.decompose()
            if chosen:
                # Match default display: keep selected variant, exclude hidden tooltip fields.
                for node in list(chosen.find_all(True)):
                    if node.parent is not None and ("item-box" in node.get("class", []) or
                            re.search(r"display\s*:\s*none", node.get("style", ""), re.I)):
                        node.decompose()
    grid, cells = table_grid(table)
    scheduled = records(soup.select_one("#dataTables2"))
    unscheduled = records(soup.select_one("#dataTables"))
    data = {"source_url": URL, "source_sha256": hashlib.sha256(raw).hexdigest(),
            "semester": selected("#xnxq01id"), "weeks": selected("#zc"),
            "period_mode": selected("#kbjcmsid"),
            "display_mode": "detailed" if detailed else "compact",
            "grid": grid, "cells": cells, "cell_details": details,
            "scheduled_courses": scheduled, "unscheduled_courses": unscheduled,
            "csv_policy": "Source grid order; merged values at top-left; covered cells empty. No visual styles in CSV."}
    out.mkdir(parents=True, exist_ok=True)
    (out / "source.html").write_bytes(raw)
    write_csv(out / "timetable.csv", grid)
    (out / "timetable.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    assert json.loads((out / "timetable.json").read_text(encoding="utf-8")) == data
    print(f"Semester: {data['semester']['value']}; courses: {len(scheduled)}; unscheduled: {len(unscheduled)}")
    print(f"CSV: {len(grid)} rows x {len(grid[0])} columns; JSON/CSV readback verified")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", type=Path, help="Use saved HTML instead of requesting URL")
    parser.add_argument("--semester", help="Requested semester, e.g. 2024-2025-1")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if args.semester and not re.fullmatch(r"\d{4}-\d{4}-[12]", args.semester):
        parser.error("--semester must have the form YYYY-YYYY-1 or YYYY-YYYY-2")
    if args.html and args.semester:
        parser.error("--semester applies to online requests; do not combine with --html")
    out = args.out or Path(__file__).resolve().parents[1] / "outputs/timetable"
    if args.out is None and args.semester:
        out = out / args.semester
    if args.html:
        raw = args.html.read_bytes()
    else:
        cookie = getpass.getpass("Cookie (hidden): ").strip()
        raw = fetch(cookie, args.semester)
    export(raw, out)


if __name__ == "__main__":
    main()
