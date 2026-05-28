import { Router } from "express";
import { handle, ok } from "../../lib/response";
import { StudyRecordService } from "./study-record.service";

export const studyRecordRouter = Router({ mergeParams: true });

studyRecordRouter.post(
  "/:code/study-record",
  handle((req, res) => {
    const data = StudyRecordService.upsert(String(req.params.code), req.body);
    ok(res, data);
  })
);

studyRecordRouter.delete(
  "/:code/study-record",
  handle((req, res) => {
    const fb = req.query.fallback === "plan" ? "plan" : "none";
    const data = StudyRecordService.clear(String(req.params.code), fb);
    ok(res, data);
  })
);
