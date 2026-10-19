import type { App } from "../../app-types";
import { ok } from "../../lib/response";
import { MetaService } from "./meta.service";

export function registerMetaRoutes(app: App) {
  app.get("/meta/categories", (c) => ok(c, MetaService.enums()));
}
