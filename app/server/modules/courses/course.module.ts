import { Router } from "express";
import { created, handle, ok } from "../../lib/response";
import { CourseService } from "./course.service";

export const courseRouter = Router();

courseRouter.get(
  "/",
  handle((req, res) => {
    const { data, total } = CourseService.list(req.query as Record<string, unknown>);
    ok(res, data, { total });
  })
);

courseRouter.get(
  "/:code",
  handle((req, res) => {
    const includeTrash = req.query.includeTrash === "true";
    const data = CourseService.getByCode(String(req.params.code), { includeTrash });
    ok(res, data);
  })
);

courseRouter.post(
  "/",
  handle((req, res) => {
    const data = CourseService.createCustom(req.body);
    created(res, data);
  })
);

courseRouter.patch(
  "/:code",
  handle((req, res) => {
    const data = CourseService.updateFields(String(req.params.code), req.body);
    ok(res, data);
  })
);
