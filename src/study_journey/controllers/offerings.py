"""开课数据：课程详情里的教学班列表；本地版的数据更新与导入。"""
from __future__ import annotations

import click
from flask import Blueprint, abort, current_app, flash, redirect, render_template, request, url_for

from ..models.catalog import load_catalog
from ..models.plan import TERMS
from . import module_version, offering_store, repository

bp = Blueprint("offerings", __name__)


@bp.get("/courses/<code>/sections")
def sections(code: str):
    """课程详情弹窗里的「开课情况」片段。term 为空（待安排）时看本学期。"""
    calendar = repository().calendar
    term = request.args.get("term", type=int) or calendar.current_term
    if term not in TERMS:
        abort(400)
    wanted = calendar.semester_id(term)
    semester = offering_store().reference_for(wanted)
    course = load_catalog().courses.get(code)
    return render_template(
        "_sections.html",
        code=code,
        course=course,
        term=term,
        wanted_label=calendar.label(term),
        semester=semester,
        is_reference=semester is not None and semester.id != wanted,
        sections=semester.sections.get(code, ()) if semester else (),
        offered=semester.courses.get(code) if semester else None,
        module_version=module_version(),
    )


@bp.post("/offerings/update")
def update():
    """本地版：从网上下载最新的开课数据。"""
    if current_app.config["MODE"] == "demo":
        abort(404)
    from ..services.offerings_sync import SyncError, sync

    target = current_app.config["OFFERINGS_DIRS"][0]
    current = {e["semester"]: e["version"] for e in offering_store().semesters()}
    try:
        updated = sync(target, current)
    except SyncError as e:
        flash(str(e).splitlines()[0] + " 可以稍后再试，或者用 git pull 更新整个项目。", "error")
    else:
        flash(f"已更新 {len(updated)} 个学期的开课数据。" if updated else "开课数据已经是最新的。")
    return redirect(url_for("timeline.index"))


@bp.cli.command("import")
@click.argument("source", type=click.Path(exists=True, file_okay=False))
@click.option("--out", type=click.Path(file_okay=False), help="输出目录，默认 instance/offerings（只给自己用）")
def import_command(source: str, out: str | None) -> None:
    """把学校发布的开课 Excel（一个文件夹）导入成开课数据。"""
    from pathlib import Path

    from ..services.importers.offerings_xlsx import import_directory

    target = Path(out) if out else current_app.config["OFFERINGS_DIRS"][0]
    for e in import_directory(Path(source), target):
        click.echo(f"{e['semester']}：{e['courses']} 门课程，{e['sections']} 个教学班（版本 {e['version']}）")
    click.echo(f"已写入 {target}")


@bp.cli.command("update")
def update_command() -> None:
    """从网上下载最新的开课数据（和页面上的「检查更新」一样）。"""
    from ..services.offerings_sync import sync

    target = current_app.config["OFFERINGS_DIRS"][0]
    current = {e["semester"]: e["version"] for e in offering_store().semesters()}
    updated = sync(target, current)
    click.echo("已更新：" + "、".join(updated) if updated else "开课数据已经是最新的。")
