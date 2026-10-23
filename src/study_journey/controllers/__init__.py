"""Controller 层：接收请求，调用 Model，选择 View。"""
from __future__ import annotations

from flask import current_app, g, session

from ..models.catalog import load_catalog
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
