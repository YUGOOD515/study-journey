import type { App } from "../../app-types";
import { ok, readJson } from "../../lib/response";
import { PlanService } from "./plan.service";

/** POST/DELETE /courses/:code/plan */
export function registerPlanRoutes(app: App) {
  app.post("/courses/:code/plan", async (c) => {
    return ok(c, await PlanService.setPlan(c.var.ctx, c.req.param("code"), await readJson(c)));
  });

  app.delete("/courses/:code/plan", async (c) => {
    return ok(c, await PlanService.removeFromPlan(c.var.ctx, c.req.param("code")));
  });
}
