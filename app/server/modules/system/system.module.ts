import { Router } from "express";
import { db, DB_PATH } from "../../db";
import { handle, ok } from "../../lib/response";

export const systemRouter = Router();

systemRouter.get(
  "/health",
  handle((_req, res) => {
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'plan_%' OR name LIKE 'raw_%') ORDER BY name"
        )
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    ok(res, {
      ok: true,
      db: "ok",
      dbPath: DB_PATH,
      tables,
      time: new Date().toISOString(),
    });
  })
);
