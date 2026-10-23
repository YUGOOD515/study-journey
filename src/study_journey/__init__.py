"""学旅 Study Journey：Flask 应用工厂。"""
from __future__ import annotations

from pathlib import Path

from flask import Flask

from .config import ROOT, Config


def create_app(overrides: dict | None = None) -> Flask:
    app = Flask(
        __name__,
        static_folder=str(ROOT / "public" / "static"),
        static_url_path="/static",
    )
    app.config.from_object(Config)
    app.config.update(overrides or {})

    from .controllers import offerings, timeline, timetable
    from .models.timeline import stage_name, stage_range

    app.register_blueprint(timeline.bp)
    app.register_blueprint(offerings.bp)
    app.register_blueprint(timetable.bp)
    app.jinja_env.filters["credits"] = format_credits
    app.jinja_env.filters["stage"] = stage_name
    app.jinja_env.filters["stage_range"] = stage_range
    return app


def format_credits(value: float) -> str:
    """学分显示：去掉多余的 0，比如 3.0 → 3、2.50 → 2.5、0.25 → 0.25。"""
    return f"{value:.2f}".rstrip("0").rstrip(".")
