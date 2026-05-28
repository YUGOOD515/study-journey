import { Router } from "express";
import { registerCourseBatchRoutes } from "./modules/courses/batch.module";
import { courseRouter } from "./modules/courses/course.module";
import { creditAssignmentRouter } from "./modules/credit-assignment/credit-assignment.module";
import { metaRouter } from "./modules/meta/meta.module";
import { planRouter } from "./modules/plan/plan.module";
import { progressRouter } from "./modules/progress/progress.module";
import { courseOpeningsRouter, rawRouter } from "./modules/raw/raw.module";
import { requirementRouter } from "./modules/requirements/requirement.module";
import { studyRecordRouter } from "./modules/study-record/study-record.module";
import { systemRouter } from "./modules/system/system.module";
import {
  registerTrashVerbRoutes,
  trashCourseRouter,
  trashRouter,
} from "./modules/trash/trash.module";

/**
 * 所有 /api/* 路由的聚合点。新模块在此挂载。
 * 旧 index.ts 内联路由在迁移期保留，最终被这里取代。
 */
export const apiRouter = Router();

// 含冒号的批量动作必须在 sub-router 挂载前注册，否则会被 :code 参数路由抢匹配。
registerTrashVerbRoutes(apiRouter);
registerCourseBatchRoutes(apiRouter);

apiRouter.use("/", systemRouter); // /api/health
apiRouter.use("/meta", metaRouter);
apiRouter.use("/requirements", requirementRouter);
apiRouter.use("/trash", trashRouter);
apiRouter.use("/progress", progressRouter);
apiRouter.use("/raw", rawRouter);

// /api/courses/* — 顺序无所谓，因为业务子动作路径与 courseRouter 自身不冲突
apiRouter.use("/courses", planRouter);
apiRouter.use("/courses", studyRecordRouter);
apiRouter.use("/courses", creditAssignmentRouter);
apiRouter.use("/courses", trashCourseRouter);
apiRouter.use("/courses", courseOpeningsRouter);
apiRouter.use("/courses", courseRouter);
