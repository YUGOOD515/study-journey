"""Cloudflare Workers 入口：只跑演示模式，不连数据库，不需要登录。"""
from workers import WorkerEntrypoint, wsgi

from study_journey import create_app

app = create_app({"MODE": "demo", "SESSION_COOKIE_SECURE": True})


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        secret = getattr(self.env, "SECRET_KEY", None)
        if secret:
            app.secret_key = secret
        return await wsgi.fetch(app, request, self.env)
