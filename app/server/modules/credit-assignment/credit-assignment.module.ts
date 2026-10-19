import type { App } from "../../app-types";
import { ok, readJson } from "../../lib/response";
import { CreditAssignmentService } from "./credit-assignment.service";

export function registerCreditAssignmentRoutes(app: App) {
  app.post("/courses/:code/credit-assignment", async (c) => {
    return ok(c, await CreditAssignmentService.set(c.var.ctx, c.req.param("code"), await readJson(c)));
  });

  app.delete("/courses/:code/credit-assignment", async (c) => {
    return ok(c, await CreditAssignmentService.clear(c.var.ctx, c.req.param("code")));
  });
}
