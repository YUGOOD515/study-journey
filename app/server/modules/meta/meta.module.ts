import { Router } from "express";
import { handle, ok } from "../../lib/response";
import { MetaService } from "./meta.service";

export const metaRouter = Router();

metaRouter.get(
  "/categories",
  handle((_req, res) => {
    ok(res, MetaService.enums());
  })
);
