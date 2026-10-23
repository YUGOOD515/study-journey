"""Controller 层：接收请求，调用 Model，选择 View。"""
from __future__ import annotations

from flask import current_app, g, session

from ..models.catalog import load_catalog
from ..models.offerings import OfferingStore, directory_loader
from ..models.plan import calendar_for


def repository():
    """按运行模式取当前请求的数据仓库。"""
    if "repo" not in g:
        catalog = load_catalog()
        if current_app.config["MODE"] == "demo":
            from ..models.demo_repository import DemoRepository

            g.repo = DemoRepository(catalog, session)
        else:
            from ..models.sqlite_repository import SqliteRepository

            calendar = calendar_for(current_app.config["ENROLLMENT_YEAR"])
            g.repo = SqliteRepository(catalog, current_app.config["DATABASE"], calendar)
    return g.repo


def offering_store() -> OfferingStore:
    """开课数据。本地版每个请求重新读 manifest（下载或导入后立即生效）；演示版由 worker.py 预先放好。"""
    store = current_app.extensions.get("offerings")
    if store is not None:
        return store
    dirs = current_app.config["OFFERINGS_DIRS"]
    stamp = tuple((d / "manifest.json").stat().st_mtime if (d / "manifest.json").exists() else 0 for d in dirs)
    cached = current_app.extensions.get("offerings_local")
    if cached is None or cached[0] != stamp:
        cached = (stamp, OfferingStore([directory_loader(d) for d in dirs]))
        current_app.extensions["offerings_local"] = cached
    return cached[1]


def published_offerings(calendar) -> dict:
    """本学期及以后、已经发布了开课表的学期：{学期序号: Semester}。"""
    store = offering_store()
    found = {}
    for term in range(calendar.current_term, 9):
        if semester := store.get(calendar.semester_id(term)):
            found[term] = semester
    return found


def module_version() -> str:
    """2024 级起用 2024 版培养方案的模块划分。"""
    return "2024" if current_app.config["ENROLLMENT_YEAR"] >= 2024 else "2022"
