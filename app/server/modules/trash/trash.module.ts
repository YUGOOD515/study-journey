import { Router } from "express";
import { handle, ok } from "../../lib/response";
import { TrashService } from "./trash.service";

/**
 * 单条 + 列表挂载在 /api/trash。
 * 批量动作（含冒号的 URL，如 /api/trash:empty）由 apiRouter 用正则路径直接注册。
 */
export const trashRouter = Router();

trashRouter.get(
  "/",
  handle((req, res) => {
    const data = TrashService.list(req.query as Record<string, unknown>);
    ok(res, data, { total: data.length });
  })
);

trashRouter.post(
  "/:code/restore",
  handle((req, res) => {
    const data = TrashService.restore(String(req.params.code));
    ok(res, data);
  })
);

trashRouter.delete(
  "/:code",
  handle((req, res) => {
    const data = TrashService.purge(String(req.params.code));
    ok(res, data);
  })
);

/** 挂载在 /api/courses 下：POST /:code/trash。 */
export const trashCourseRouter = Router({ mergeParams: true });

trashCourseRouter.post(
  "/:code/trash",
  handle((req, res) => {
    const data = TrashService.softDelete(String(req.params.code), req.body);
    ok(res, data);
  })
);

/**
 * AIP-136 风格批量动作。Express 4 把 ':' 当参数前缀，所以这里用正则路径
 * 直接在 apiRouter 上注册。
 */
export function registerTrashVerbRoutes(apiRouter: Router) {
  // POST /api/trash:restore-all
  apiRouter.post(
    /^\/trash:restore-all$/,
    handle((req, res) => {
      const scope = (req.body?.scope as "program" | "custom" | "all" | undefined) ?? "all";
      ok(res, TrashService.restoreAll(scope));
    })
  );

  // DELETE /api/trash:empty
  apiRouter.delete(
    /^\/trash:empty$/,
    handle((req, res) => {
      const scope = (req.body?.scope as "program" | "custom" | "all" | undefined) ?? "all";
      ok(res, TrashService.empty(scope));
    })
  );

  // POST /api/trash:batch-restore
  apiRouter.post(
    /^\/trash:batch-restore$/,
    handle((req, res) => {
      ok(res, TrashService.batchRestore(req.body));
    })
  );

  // DELETE /api/trash:batch-purge
  apiRouter.delete(
    /^\/trash:batch-purge$/,
    handle((req, res) => {
      ok(res, TrashService.batchPurge(req.body));
    })
  );
}
