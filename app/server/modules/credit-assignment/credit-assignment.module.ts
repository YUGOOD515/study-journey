import { Router } from "express";
import { handle, ok } from "../../lib/response";
import { CreditAssignmentService } from "./credit-assignment.service";

export const creditAssignmentRouter = Router({ mergeParams: true });

creditAssignmentRouter.post(
  "/:code/credit-assignment",
  handle((req, res) => {
    const data = CreditAssignmentService.set(String(req.params.code), req.body);
    ok(res, data);
  })
);

creditAssignmentRouter.delete(
  "/:code/credit-assignment",
  handle((req, res) => {
    const data = CreditAssignmentService.clear(String(req.params.code));
    ok(res, data);
  })
);
