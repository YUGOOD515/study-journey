"""Export curriculum HTML tables without guessing or correcting source values.

Dependencies: python -m pip install beautifulsoup4 html5lib
Offline: python scripts/export_curriculum_csv.py --html source.html --out outputs/csv
Online: python scripts/export_curriculum_csv.py --url URL --out outputs/csv
The online mode prompts for a cookie without echoing or saving it.
"""

import argparse
import csv
import getpass
import hashlib
import json
import re
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag


def visible_text(node):
    """Retain explicit line breaks, collapse HTML formatting whitespace."""
    parts = []

    def walk(item):
        if isinstance(item, NavigableString):
            parts.append(re.sub(r"[\t\r\n\f ]+", " ", str(item)))
        elif isinstance(item, Tag):
            if item.name in {"script", "style", "input", "button"}:
                return
            if item.name == "br":
                parts.append("\n")
            else:
                for child in item.children:
                    walk(child)
                if item.name in {"p", "div", "li", "h1", "h2", "h3"}:
                    parts.append("\n")

    walk(node)
    return "\n".join(line.strip() for line in "".join(parts).splitlines()).strip()


def table_grid(table):
    rows = [r for r in table.find_all("tr") if r.find_parent("table") is table]
    occupied, anchors = {}, []
    for y, row in enumerate(rows):
        x = 0
        for cell in row.find_all(["td", "th"], recursive=False):
            while (y, x) in occupied:
                x += 1
            rs = int(cell.get("rowspan", 1))
            if rs == 0:
                rs = sum(r.parent is row.parent for r in rows[y:])
            cs = max(1, int(cell.get("colspan", 1)))
            rs = max(1, min(rs, len(rows) - y))
            value = visible_text(cell)
            anchors.append(dict(row=y + 1, column=x + 1, rowspan=rs,
                                colspan=cs, text=value))
            for dy in range(rs):
                for dx in range(cs):
                    key = (y + dy, x + dx)
                    if key in occupied:
                        raise ValueError(f"Overlapping cells at {key}")
                    occupied[key] = value if dy == dx == 0 else ""
            x += cs
    width = max((x + 1 for y, x in occupied), default=0)
    grid = [[occupied.get((y, x), "") for x in range(width)] for y in range(len(rows))]
    return grid, anchors


def write_csv(path, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f).writerows(rows)
    with path.open(encoding="utf-8-sig", newline="") as f:
        if list(csv.reader(f)) != rows:
            raise ValueError(f"CSV round-trip verification failed: {path}")


def export(raw, out, encoding="utf-8", source=""):
    soup = BeautifulSoup(raw.decode(encoding), "html5lib")
    tables = [t for t in soup.find_all("table") if not t.find("table")]
    if not tables:
        raise ValueError("No tables found; verify the input or login cookie.")
    out.mkdir(parents=True, exist_ok=True)
    (out / "source.html").write_bytes(raw)
    manifest = {"source": source, "encoding": encoding,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "merged_cell_policy": "Value at top-left; covered cells empty.",
                "tables": []}
    for i, table in enumerate(tables, 1):
        filename = f"table_{i:02d}.csv"
        grid, anchors = table_grid(table)
        write_csv(out / filename, grid)
        manifest["tables"].append(dict(file=filename, rows=len(grid),
                                       columns=len(grid[0]) if grid else 0,
                                       cells=anchors))
        # Replace tables with references before extracting surrounding prose.
        marker = soup.new_tag("p")
        marker.string = f"[{filename}]"
        table.replace_with(marker)
    prose = visible_text(soup.body or soup)
    write_csv(out / "text.csv", [["正文（表格以文件名引用）"], [prose]])
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                                        encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--html", type=Path)
    source.add_argument("--url")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--encoding", default="utf-8")
    args = parser.parse_args()
    if args.html:
        raw = args.html.read_bytes()
    else:
        cookie = getpass.getpass("Cookie (hidden): ").strip()
        request = urllib.request.Request(args.url, headers={
            "Cookie": cookie, "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=40) as response:
            raw = response.read()
        if "培养" not in raw.decode(args.encoding):
            raise ValueError("Response does not appear to be a curriculum page.")
    result = export(raw, args.out, args.encoding, args.url or str(args.html))
    for item in result["tables"]:
        print(f"{item['file']}: {item['rows']} rows x {item['columns']} columns")
    print(f"Exported {len(result['tables'])} tables; CSV readback verified.")


if __name__ == "__main__":
    main()
