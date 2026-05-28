import { Router } from "express";
import { handle, ok } from "../../lib/response";
import { RawService } from "./raw.service";

/** 挂载在 /api/raw。 */
export const rawRouter = Router();

rawRouter.get(
  "/batches",
  handle((req, res) => {
    const data = RawService.listBatches(req.query as Record<string, unknown>);
    ok(res, data, { total: data.length });
  })
);

rawRouter.get(
  "/sections",
  handle((req, res) => {
    const data = RawService.listSections(req.query as Record<string, unknown>);
    ok(res, data, { total: data.length });
  })
);

rawRouter.get(
  "/added-courses",
  handle((req, res) => {
    const data = RawService.listAddedCourses(req.query as Record<string, unknown>);
    ok(res, data, { total: data.length });
  })
);

rawRouter.get(
  "/catalog-previews",
  handle((req, res) => {
    const data = RawService.listCatalogPreviews(req.query as Record<string, unknown>);
    ok(res, data, { total: data.length });
  })
);

rawRouter.get(
  "/actual-course-meetings",
  handle((req, res) => {
    const data = RawService.listActualCourseMeetings(req.query as Record<string, unknown>);
    ok(res, data, { total: data.length });
  })
);

/** 挂载在 /api/courses：GET /:code/openings。 */
export const courseOpeningsRouter = Router({ mergeParams: true });

courseOpeningsRouter.get(
  "/:code/openings",
  handle((req, res) => {
    const code = String(req.params.code);
    ok(res, { courseCode: code, openings: RawService.findOpeningsByCode(code) });
  })
);
