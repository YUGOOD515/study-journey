"""Cloudflare Workers entry: demo mode only, no database, no login.

Offerings data lives in static assets (public/static/data/offerings). Flask runs
synchronously, so the files it needs are fetched from the ASSETS binding first
and kept in memory for the lifetime of the isolate.
"""
from urllib.parse import urlparse

from workers import WorkerEntrypoint, wsgi

from study_journey import create_app
from study_journey.models.demo_repository import demo_calendar
from study_journey.models.offerings import OfferingStore, memory_loader

OFFERINGS_PATH = "/static/data/offerings/"
files: dict[str, str] = {}
store = OfferingStore([memory_loader(files)])
app = create_app({"MODE": "demo", "SESSION_COOKIE_SECURE": True})
app.extensions["offerings"] = store


async def read_asset(env, origin: str, name: str) -> str | None:
    res = await env.ASSETS.fetch(origin + OFFERINGS_PATH + name)
    return await res.text() if res.ok else None


async def preload(env, url: str) -> None:
    """Load the manifest, plus each semester the demo student may look at (current term to term 8)."""
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if "manifest.json" not in files:
        text = await read_asset(env, origin, "manifest.json")
        files["manifest.json"] = text or '{"schema_version": 1, "semesters": []}'
        store.reset()
    calendar = demo_calendar()
    for term in range(calendar.current_term, 9):
        semester = store.reference_id(calendar.semester_id(term))
        entry = store.entries().get(semester, ({}, None))[0] if semester else {}
        name = entry.get("file")
        if name and name not in files:
            files[name] = await read_asset(env, origin, name) or ""


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        secret = getattr(self.env, "SECRET_KEY", None)
        if secret:
            app.secret_key = secret
        if not urlparse(request.url).path.startswith("/static/"):
            await preload(self.env, request.url)
        return await wsgi.fetch(app, request, self.env)
