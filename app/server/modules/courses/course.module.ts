import type { App } from "../../app-types";
import { created, ok, queryObject, readJson } from "../../lib/response";
import { CourseService } from "./course.service";

export function registerCourseRoutes(app: App) {
  app.get("/courses", async (c) => {
    const { data, total } = await CourseService.list(c.var.ctx, queryObject(c));
    return ok(c, data, { total });
  });

  app.post("/courses/from-raw", async (c) => {
    return created(c, await CourseService.createCustomFromRaw(c.var.ctx, await readJson(c)));
  });

  app.post("/courses", async (c) => {
    return created(c, await CourseService.createCustom(c.var.ctx, await readJson(c)));
  });

  app.get("/courses/:code", async (c) => {
    const includeTrash = c.req.query("includeTrash") === "true";
    return ok(c, await CourseService.getByCode(c.var.ctx, c.req.param("code"), { includeTrash }));
  });

  app.patch("/courses/:code", async (c) => {
    return ok(c, await CourseService.updateFields(c.var.ctx, c.req.param("code"), await readJson(c)));
  });
}
