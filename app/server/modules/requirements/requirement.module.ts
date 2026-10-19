import type { App } from "../../app-types";
import { ok, readJson } from "../../lib/response";
import { RequirementService } from "./requirement.service";

export function registerRequirementRoutes(app: App) {
  app.get("/requirements", async (c) => {
    const data = await RequirementService.list(c.var.ctx);
    return ok(c, data, { total: data.length });
  });

  /** 修改的是当前用户自己的学分要求，不影响其他用户。 */
  app.put("/requirements/:categoryCode/:requirementTypeCode", async (c) => {
    const updated = await RequirementService.updateThreshold(
      c.var.ctx,
      c.req.param("categoryCode"),
      c.req.param("requirementTypeCode"),
      await readJson(c)
    );
    return ok(c, updated);
  });
}
