import type { App } from "../../app-types";
import { ok } from "../../lib/response";
import { ProgressService } from "./progress.service";

export function registerProgressRoutes(app: App) {
  app.get("/progress", async (c) => ok(c, await ProgressService.compute(c.var.ctx)));
  app.get("/progress/timeline", async (c) => ok(c, await ProgressService.timeline(c.var.ctx)));
}
