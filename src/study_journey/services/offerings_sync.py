"""本地版：从网上下载最新的开课数据到 instance/offerings/。

数据就是仓库里 public/static/data/offerings/ 下的文件，维护者每学期导入后提交。
这里按顺序尝试几个镜像（jsDelivr 在国内通常更快），下载后校验版本指纹再保存。
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from .importers.offerings_digest import content_version

DEFAULT_SOURCES = (
    "https://cdn.jsdelivr.net/gh/YUGOOD515/study-journey@HEAD/public/static/data/offerings/",
    "https://raw.githubusercontent.com/YUGOOD515/study-journey/HEAD/public/static/data/offerings/",
)
TIMEOUT = 20


class SyncError(RuntimeError):
    pass


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "study-journey"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return res.read().decode("utf-8")


def sync(target: Path, current: dict[str, str], sources: tuple[str, ...] = DEFAULT_SOURCES, fetch=fetch_text) -> list[str]:
    """下载有更新的学期。current = 本机已有的 {学期: 版本}。返回更新了的学期列表。"""
    errors = []
    for base in sources:
        try:
            manifest = json.loads(fetch(base + "manifest.json"))
            updated = []
            for entry in manifest.get("semesters", []):
                if current.get(entry["semester"]) == entry["version"]:
                    continue
                text = fetch(base + entry["file"])
                if content_version(json.loads(text)) != entry["version"]:
                    raise SyncError(f"{entry['file']} 校验失败")
                target.mkdir(parents=True, exist_ok=True)
                (target / entry["file"]).write_text(text, encoding="utf-8")
                updated.append(entry["semester"])
            merge_manifest(target, [e for e in manifest["semesters"] if e["semester"] in updated])
            return updated
        except Exception as e:  # 换下一个镜像
            errors.append(f"{base}：{e}")
    raise SyncError("所有下载地址都失败了：\n" + "\n".join(errors))


def merge_manifest(target: Path, entries: list[dict]) -> None:
    path = target / "manifest.json"
    manifest = json.loads(path.read_text("utf-8")) if path.exists() else {"schema_version": 1, "semesters": []}
    by_id = {e["semester"]: e for e in manifest["semesters"]}
    by_id.update({e["semester"]: e for e in entries})
    manifest["semesters"] = [by_id[k] for k in sorted(by_id)]
    target.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
