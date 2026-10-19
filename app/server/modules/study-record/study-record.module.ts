import type { App } from "../../app-types";
import { ok, readJson } from "../../lib/response";
import { StudyRecordService } from "./study-record.service";

export function registerStudyRecordRoutes(app: App) {
  app.post("/courses/:code/study-record", async (c) => {
    return ok(c, await StudyRecordService.upsert(c.var.ctx, c.req.param("code"), await readJson(c)));
  });

  app.delete("/courses/:code/study-record", async (c) => {
    const fallback = c.req.query("fallback") === "plan" ? "plan" : "none";
    return ok(c, await StudyRecordService.clear(c.var.ctx, c.req.param("code"), fallback));
  });
}
