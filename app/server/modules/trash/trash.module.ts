import type { App } from "../../app-types";
import { ok, readJson } from "../../lib/response";
import { TrashService } from "./trash.service";

type Scope = "program" | "custom" | "all";

function scopeOf(body: Record<string, unknown>): Scope {
  const s = body.scope;
  return s === "program" || s === "custom" ? s : "all";
}

/**
 * 垃圾篓路由。AIP-136 风格批量动作（/trash:empty 等）在 Hono 中按静态路径注册，
 * 必须先于 /trash/:code 注册。
 */
export function registerTrashRoutes(app: App) {
  app.post("/trash:restore-all", async (c) => ok(c, await TrashService.restoreAll(c.var.ctx, scopeOf(await readJson(c)))));
  app.delete("/trash:empty", async (c) => ok(c, await TrashService.empty(c.var.ctx, scopeOf(await readJson(c)))));
  app.post("/trash:batch-restore", async (c) => ok(c, await TrashService.batchRestore(c.var.ctx, await readJson(c))));
  app.delete("/trash:batch-purge", async (c) => ok(c, await TrashService.batchPurge(c.var.ctx, await readJson(c))));

  app.get("/trash", async (c) => {
    const data = await TrashService.list(c.var.ctx, c.req.query() as Record<string, unknown>);
    return ok(c, data, { total: data.length });
  });
  app.post("/trash/:code/restore", async (c) => ok(c, await TrashService.restore(c.var.ctx, c.req.param("code"))));
  app.delete("/trash/:code", async (c) => ok(c, await TrashService.purge(c.var.ctx, c.req.param("code"))));

  app.post("/courses/:code/trash", async (c) =>
    ok(c, await TrashService.softDelete(c.var.ctx, c.req.param("code"), await readJson(c)))
  );
}
