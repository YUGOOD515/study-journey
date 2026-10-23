from __future__ import annotations

from flask import Blueprint, current_app, redirect, render_template, request, url_for

from ..models import progress, timeline
from ..models.catalog import load_catalog
from ..models.plan import MoveError
from ..models.offerings import semester_label
from . import offering_store, published_offerings, repository

bp = Blueprint("timeline", __name__)


def context() -> dict:
    repo = repository()
    catalog = load_catalog()
    items = repo.items()
    return {
        "catalog": catalog,
        "calendar": repo.calendar,
        "progress": progress.compute(items, catalog),
        "timeline": timeline.build(items, repo.calendar, published_offerings(repo.calendar)),
        "is_demo": current_app.config["MODE"] == "demo",
        "offering_semesters": offering_semesters(),
    }


def offering_semesters() -> list[dict]:
    return [dict(e, label=semester_label(e["semester"])) for e in offering_store().semesters()]


@bp.get("/")
def index():
    return render_template("timeline.html", **context())


@bp.post("/plan/move")
def move():
    data = request.get_json(silent=True) or request.form
    term = data.get("term")
    term = int(term) if term not in (None, "", "pending") else None
    try:
        repository().move(str(data.get("code", "")), term)
    except MoveError as e:
        return render_template("_workspace.html", error=str(e), **context()), 409
    return render_template("_workspace.html", **context())


@bp.post("/plan/reset")
def reset():
    repository().reset()
    return redirect(url_for("timeline.index"))
