import { Router } from "express";
import { handle, ok } from "../../lib/response";
import { PlanService } from "./plan.service";

/**
 * 挂载在 /api/courses 下，分别响应 POST/DELETE /:code/plan。
 */
export const planRouter = Router({ mergeParams: true });

planRouter.post(
  "/:code/plan",
  handle((req, res) => {
    const data = PlanService.setPlan(String(req.params.code), req.body);
    ok(res, data);
  })
);

planRouter.delete(
  "/:code/plan",
  handle((req, res) => {
    const data = PlanService.removeFromPlan(String(req.params.code));
    ok(res, data);
  })
);
