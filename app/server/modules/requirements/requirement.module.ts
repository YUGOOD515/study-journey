import { Router } from "express";
import { handle, ok } from "../../lib/response";
import { RequirementService } from "./requirement.service";

export const requirementRouter = Router();

requirementRouter.get(
  "/",
  handle((_req, res) => {
    const data = RequirementService.list();
    ok(res, data, { total: data.length });
  })
);

requirementRouter.put(
  "/:categoryCode/:requirementTypeCode",
  handle((req, res) => {
    const updated = RequirementService.updateThreshold(
      String(req.params.categoryCode),
      String(req.params.requirementTypeCode),
      req.body
    );
    ok(res, updated);
  })
);
