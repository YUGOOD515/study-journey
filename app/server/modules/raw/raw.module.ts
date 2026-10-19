import type { App } from "../../app-types";
import { ok, queryObject } from "../../lib/response";
import { RawService } from "./raw.service";

export function registerRawRoutes(app: App) {
  app.get("/raw/batches", async (c) => {
    const data = await RawService.listBatches(c.var.ctx, queryObject(c));
    return ok(c, data, { total: data.length });
  });

  app.get("/raw/sections", async (c) => {
    const data = await RawService.listSections(c.var.ctx, queryObject(c));
    return ok(c, data, { total: data.length });
  });

  app.get("/raw/added-courses", async (c) => {
    const data = await RawService.listAddedCourses(c.var.ctx, queryObject(c));
    return ok(c, data, { total: data.length });
  });

  app.get("/raw/catalog-previews", async (c) => {
    const data = await RawService.listCatalogPreviews(c.var.ctx, queryObject(c));
    return ok(c, data, { total: data.length });
  });

  app.get("/raw/actual-course-meetings", async (c) => {
    const data = await RawService.listActualCourseMeetings(c.var.ctx, queryObject(c));
    return ok(c, data, { total: data.length });
  });

  app.get("/raw/course-search", async (c) => {
    const data = await RawService.searchCourses(c.var.ctx, queryObject(c));
    return ok(c, data, { total: data.length });
  });

  app.get("/courses/:code/openings", async (c) => {
    const code = c.req.param("code");
    return ok(c, { courseCode: code, openings: await RawService.findOpeningsByCode(c.var.ctx, code) });
  });
}
