"""运行配置。MODE=local 用本机 SQLite；MODE=demo 用内置演示数据（Cloudflare 上就是这个模式）。"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class Config:
    MODE = os.environ.get("STUDY_JOURNEY_MODE", "local")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-not-secret")
    DATABASE = Path(os.environ.get("STUDY_JOURNEY_DB", ROOT / "instance" / "study_journey.sqlite3"))
    ENROLLMENT_YEAR = int(os.environ.get("ENROLLMENT_YEAR", "2024"))
    # 开课数据：先找本机下载/导入的（instance/offerings），再找仓库自带的
    OFFERINGS_DIRS = [ROOT / "instance" / "offerings", ROOT / "public" / "static" / "data" / "offerings"]
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = MODE == "demo"
