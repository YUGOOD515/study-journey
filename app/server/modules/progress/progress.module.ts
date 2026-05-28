import { Router } from "express";
import { handle, ok } from "../../lib/response";
import { ProgressService } from "./progress.service";

export const progressRouter = Router();

progressRouter.get(
  "/",
  handle((_req, res) => {
    ok(res, ProgressService.compute());
  })
);

progressRouter.get(
  "/timeline",
  handle((_req, res) => {
    ok(res, ProgressService.timeline());
  })
);
