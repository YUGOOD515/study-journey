/**
 * 学旅后端 v2 —— 对齐 course_planner_v2.sqlite。
 *
 * 数据模型（详见 db/README_database_v2.md）：
 *   plan_program_courses     —— 培养方案内课程（一行=一门课的完整生命周期）
 *   plan_custom_courses      —— 用户自加课程
 *   plan_program_requirements —— 毕业学分要求
 *   raw_*                    —— 学校原始课表（暂不对外暴露）
 *
 * 端点列表见 ENDPOINTS.md 注释段。
 */
import express, { type Request, type Response } from "express";
import cors from "cors";
import {
  db,
  CATEGORY_CODES,
  REQUIREMENT_TYPES,
  STUDY_STATUSES,
  CREDIT_COUNT_TO_VALUES,
  type CategoryCode,
  type RequirementType,
  type StudyStatus,
  type CreditCountTo,
} from "./db";

const app = express();
const PORT = Number(process.env.PORT ?? 5174);

app.use(cors());
app.use(express.json());

// ═════════════════════════════════════════════
// 健康检查
// ═════════════════════════════════════════════
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    message: "学旅后端 v2 运行正常",
    time: new Date().toISOString(),
  });
});

// ═════════════════════════════════════════════
// 培养方案课程：plan_program_courses
// ═════════════════════════════════════════════
const PLAN_COURSE_COLUMNS = `
  category_code, category_name, requirement_type, course_subcategory,
  course_code, section_code, course_name,
  official_term, planned_term,
  credits, total_hours, lecture_hours, experiment_hours, extra_hours,
  prerequisite_course_code, actual_term, study_status, score,
  credit_count_to, source_sheet, source_row, preference_level, note,
  created_at, updated_at
`;

app.get("/api/plan-courses", (_req, res) => {
  const rows = db
    .prepare(`SELECT ${PLAN_COURSE_COLUMNS} FROM plan_program_courses ORDER BY course_code`)
    .all();
  res.json(rows);
});

app.get("/api/plan-courses/:code", (req: Request, res: Response) => {
  const row = db
    .prepare(`SELECT ${PLAN_COURSE_COLUMNS} FROM plan_program_courses WHERE course_code = ?`)
    .get(String(req.params.code));
  if (!row) {
    res.status(404).json({ error: "未找到该课程" });
    return;
  }
  res.json(row);
});

/**
 * PATCH /api/plan-courses/:code
 * 可更新字段：planned_term / actual_term / study_status / score / credit_count_to / note / preference_level
 * 其他字段（学分、课程名等）不在本接口范围内。
 */
app.patch("/api/plan-courses/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  const existing: any = db
    .prepare("SELECT course_subcategory, requirement_type FROM plan_program_courses WHERE course_code = ?")
    .get(code);
  if (!existing) {
    res.status(404).json({ error: "未找到该课程" });
    return;
  }

  const updatable: Record<string, (v: unknown) => unknown> = {
    planned_term: validateTermOrNull,
    actual_term: validateTermOrNull,
    study_status: validateStudyStatus,
    score: validateScoreOrNull,
    credit_count_to: validateCreditCountToOrNull,
    note: validateStringOrNull,
    preference_level: validatePreferenceLevelOrNull,
  };

  const sets: string[] = [];
  const params: unknown[] = [];
  try {
    for (const [key, normalize] of Object.entries(updatable)) {
      if (req.body?.[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(normalize(req.body[key]));
      }
    }
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
    return;
  }

  if (sets.length === 0) {
    res.status(400).json({ error: "没有可更新字段" });
    return;
  }

  // 业务规则：credit_count_to 仅允许在 经法管融通课程 上设置；非经法管融通必须为 NULL
  if (req.body?.credit_count_to !== undefined) {
    const isInter =
      typeof existing.course_subcategory === "string" &&
      existing.course_subcategory.includes("经法管融通");
    const value = req.body.credit_count_to;
    if (!isInter && value !== null && value !== undefined) {
      res.status(400).json({ error: "非经法管融通课程的 credit_count_to 必须为 null" });
      return;
    }
    if (isInter && (value === null || value === undefined)) {
      res.status(400).json({ error: "经法管融通课程的 credit_count_to 不能为 null" });
      return;
    }
  }

  params.push(code);
  try {
    const info = db
      .prepare(`UPDATE plan_program_courses SET ${sets.join(", ")} WHERE course_code = ?`)
      .run(...(params as any[]));
    res.json({ ok: true, changes: info.changes });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

// ═════════════════════════════════════════════
// 用户自加课程：plan_custom_courses
// ═════════════════════════════════════════════
const CUSTOM_COURSE_COLUMNS = `
  category_code, category_name, requirement_type, course_subcategory,
  course_code, section_code, course_name,
  term_number,
  credits, total_hours, lecture_hours, experiment_hours, extra_hours,
  prerequisite_course_code, study_status, score,
  credit_count_to, note, created_at, updated_at
`;

app.get("/api/custom-courses", (_req, res) => {
  const rows = db
    .prepare(`SELECT ${CUSTOM_COURSE_COLUMNS} FROM plan_custom_courses ORDER BY course_code`)
    .all();
  res.json(rows);
});

app.get("/api/custom-courses/:code", (req: Request, res: Response) => {
  const row = db
    .prepare(`SELECT ${CUSTOM_COURSE_COLUMNS} FROM plan_custom_courses WHERE course_code = ?`)
    .get(String(req.params.code));
  if (!row) {
    res.status(404).json({ error: "未找到该自定义课程" });
    return;
  }
  res.json(row);
});

/**
 * POST /api/custom-courses
 * 创建一门自定义课。必填：course_code / course_name / category_code / requirement_type / credits。
 */
app.post("/api/custom-courses", (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const course_code = requireString(b.course_code, "course_code");
    const course_name = requireString(b.course_name, "course_name");
    const category_code = validateCategoryCode(b.category_code);
    const category_name = categoryNameOf(category_code);
    const requirement_type = validateRequirementType(b.requirement_type);
    const credits = validateCredits(b.credits);
    const lecture_hours = validateNonNegInt(b.lecture_hours ?? 0, "lecture_hours");
    const experiment_hours = validateNonNegInt(b.experiment_hours ?? 0, "experiment_hours");
    const extra_hours = validateNonNegInt(b.extra_hours ?? 0, "extra_hours");
    const total_hours = lecture_hours + experiment_hours + extra_hours;

    const term_number = validateTermOrNull(b.term_number ?? null);
    const study_status = b.study_status === undefined ? "未修读" : validateStudyStatus(b.study_status);
    const score = validateScoreOrNull(b.score ?? null);
    const credit_count_to = validateCreditCountToOrNull(b.credit_count_to ?? null);

    // 经法管融通 ⇔ credit_count_to 必填（custom 表 CHECK 是 XOR）
    if (requirement_type === "经法管融通" && credit_count_to == null) {
      throw new Error("requirement_type='经法管融通' 时 credit_count_to 不能为空");
    }
    if (requirement_type !== "经法管融通" && credit_count_to != null) {
      throw new Error("非经法管融通课程 credit_count_to 必须为 null");
    }

    const course_subcategory = validateStringOrNull(b.course_subcategory ?? null);
    const section_code = validateStringOrNull(b.section_code ?? null);
    const prerequisite_course_code = validateStringOrNull(b.prerequisite_course_code ?? null);
    const note = validateStringOrNull(b.note ?? null);

    const info = db
      .prepare(
        `INSERT INTO plan_custom_courses (
          category_code, category_name, requirement_type, course_subcategory,
          course_code, section_code, course_name,
          term_number,
          credits, total_hours, lecture_hours, experiment_hours, extra_hours,
          prerequisite_course_code, study_status, score, credit_count_to, note
        ) VALUES (?, ?, ?, ?,  ?, ?, ?,  ?,  ?, ?, ?, ?, ?,  ?, ?, ?, ?, ?)`
      )
      .run(
        category_code,
        category_name,
        requirement_type,
        course_subcategory,
        course_code,
        section_code,
        course_name,
        term_number,
        credits,
        total_hours,
        lecture_hours,
        experiment_hours,
        extra_hours,
        prerequisite_course_code,
        study_status,
        score,
        credit_count_to,
        note
      );
    res.json({ ok: true, course_code, changes: info.changes });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.patch("/api/custom-courses/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  const existing: any = db
    .prepare("SELECT requirement_type, lecture_hours, experiment_hours, extra_hours FROM plan_custom_courses WHERE course_code = ?")
    .get(code);
  if (!existing) {
    res.status(404).json({ error: "未找到该自定义课程" });
    return;
  }

  // 简单字段
  const fields: Record<string, (v: unknown) => unknown> = {
    course_name: requireStringValue,
    category_code: validateCategoryCode,
    requirement_type: validateRequirementType,
    course_subcategory: validateStringOrNull,
    section_code: validateStringOrNull,
    term_number: validateTermOrNull,
    credits: validateCredits,
    prerequisite_course_code: validateStringOrNull,
    study_status: validateStudyStatus,
    score: validateScoreOrNull,
    credit_count_to: validateCreditCountToOrNull,
    note: validateStringOrNull,
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  try {
    for (const [key, normalize] of Object.entries(fields)) {
      if (req.body?.[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(normalize(req.body[key]));
      }
    }
    // 联动 category_name
    if (req.body?.category_code !== undefined) {
      sets.push("category_name = ?");
      params.push(categoryNameOf(validateCategoryCode(req.body.category_code)));
    }
    // total_hours 由各分量合成
    const hoursChanged = ["lecture_hours", "experiment_hours", "extra_hours"].some(
      (k) => req.body?.[k] !== undefined
    );
    if (hoursChanged) {
      const lecture = validateNonNegInt(
        req.body?.lecture_hours ?? existing.lecture_hours, "lecture_hours"
      );
      const exp = validateNonNegInt(
        req.body?.experiment_hours ?? existing.experiment_hours, "experiment_hours"
      );
      const extra = validateNonNegInt(
        req.body?.extra_hours ?? existing.extra_hours, "extra_hours"
      );
      sets.push("lecture_hours = ?", "experiment_hours = ?", "extra_hours = ?", "total_hours = ?");
      params.push(lecture, exp, extra, lecture + exp + extra);
    }

    // 业务规则：经法管融通 ⇔ credit_count_to
    const newReqType: RequirementType =
      req.body?.requirement_type !== undefined
        ? validateRequirementType(req.body.requirement_type)
        : (existing.requirement_type as RequirementType);
    if (req.body?.credit_count_to !== undefined || req.body?.requirement_type !== undefined) {
      const newCct =
        req.body?.credit_count_to !== undefined
          ? validateCreditCountToOrNull(req.body.credit_count_to)
          : null;
      if (newReqType === "经法管融通" && newCct == null) {
        throw new Error("requirement_type='经法管融通' 时 credit_count_to 不能为空");
      }
      if (newReqType !== "经法管融通" && newCct != null) {
        throw new Error("非经法管融通课程 credit_count_to 必须为 null");
      }
    }
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
    return;
  }

  if (sets.length === 0) {
    res.status(400).json({ error: "没有可更新字段" });
    return;
  }

  params.push(code);
  try {
    const info = db
      .prepare(`UPDATE plan_custom_courses SET ${sets.join(", ")} WHERE course_code = ?`)
      .run(...(params as any[]));
    res.json({ ok: true, changes: info.changes });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

/**
 * DELETE /api/custom-courses/:code
 * 软删除：写入 plan_trash 后从主表删除。
 */
app.delete("/api/custom-courses/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  try {
    moveToTrash("plan_custom_courses", code);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === "NOT_FOUND") {
      res.status(404).json({ error: "未找到该自定义课程" });
      return;
    }
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

/**
 * DELETE /api/plan-courses/:code
 * 仅允许用户自加性质的培养方案行（通识·选修/跨专业/经法管融通）被删除；
 * 必修与其他板块拒绝。删除时走 plan_trash。
 */
app.delete("/api/plan-courses/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  const existing: any = db
    .prepare(
      "SELECT category_code, requirement_type FROM plan_program_courses WHERE course_code = ?"
    )
    .get(code);
  if (!existing) {
    res.status(404).json({ error: "未找到该课程" });
    return;
  }
  if (!isUserDeletable(existing.category_code, existing.requirement_type)) {
    res
      .status(400)
      .json({ error: "只允许删除「通识·选修/跨专业/经法管融通」类课程" });
    return;
  }
  try {
    moveToTrash("plan_program_courses", code);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

function isUserDeletable(category: string, requirementType: string): boolean {
  if (category !== "general_education") return false;
  return ["选修", "跨专业", "经法管融通"].includes(requirementType);
}

// ═════════════════════════════════════════════
// 垃圾篓：plan_trash
// ═════════════════════════════════════════════
function moveToTrash(
  sourceTable: "plan_program_courses" | "plan_custom_courses",
  courseCode: string
): void {
  const row: any = db
    .prepare(`SELECT * FROM ${sourceTable} WHERE course_code = ?`)
    .get(courseCode);
  if (!row) {
    const err: any = new Error("未找到");
    err.code = "NOT_FOUND";
    throw err;
  }
  db.prepare(
    `INSERT INTO plan_trash (source_table, course_code, course_name, payload)
     VALUES (?, ?, ?, ?)`
  ).run(sourceTable, courseCode, row.course_name, JSON.stringify(row));
  db.prepare(`DELETE FROM ${sourceTable} WHERE course_code = ?`).run(courseCode);
}

app.get("/api/trash", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, source_table, course_code, course_name, payload, deleted_at
         FROM plan_trash
         ORDER BY deleted_at DESC`
    )
    .all() as any[];
  // 把 payload 反序列化方便前端使用
  const out = rows.map((r) => ({
    id: r.id,
    source_table: r.source_table,
    course_code: r.course_code,
    course_name: r.course_name,
    deleted_at: r.deleted_at,
    snapshot: safeParseJSON(r.payload),
  }));
  res.json(out);
});

app.post("/api/trash/:id/restore", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id 必须为整数" });
    return;
  }
  const row: any = db
    .prepare("SELECT source_table, course_code, payload FROM plan_trash WHERE id = ?")
    .get(id);
  if (!row) {
    res.status(404).json({ error: "未找到该垃圾篓项" });
    return;
  }

  const sourceTable = row.source_table as "plan_program_courses" | "plan_custom_courses";
  const snapshot = safeParseJSON(row.payload);
  if (!snapshot || typeof snapshot !== "object") {
    res.status(400).json({ error: "payload 解析失败，无法还原" });
    return;
  }

  // 主表里已有同 course_code 就拒绝（避免冲突）
  const dup = db
    .prepare(`SELECT 1 FROM ${sourceTable} WHERE course_code = ? LIMIT 1`)
    .get(row.course_code);
  if (dup) {
    res
      .status(409)
      .json({ error: `${sourceTable} 中已存在 course_code=${row.course_code}` });
    return;
  }

  try {
    insertSnapshot(sourceTable, snapshot as Record<string, unknown>);
    db.prepare("DELETE FROM plan_trash WHERE id = ?").run(id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.delete("/api/trash/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id 必须为整数" });
    return;
  }
  const info = db.prepare("DELETE FROM plan_trash WHERE id = ?").run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "未找到该垃圾篓项" });
    return;
  }
  res.json({ ok: true });
});

/** 清空垃圾篓（永久删除全部） */
app.delete("/api/trash", (_req, res) => {
  const info = db.prepare("DELETE FROM plan_trash").run();
  res.json({ ok: true, changes: info.changes });
});

function safeParseJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function insertSnapshot(
  table: "plan_program_courses" | "plan_custom_courses",
  snapshot: Record<string, unknown>
): void {
  const keys = Object.keys(snapshot);
  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
  const values = keys.map((k) => snapshot[k] as any);
  db.prepare(sql).run(...values);
}

// ═════════════════════════════════════════════
// 培养方案学分要求
// ═════════════════════════════════════════════
app.get("/api/program-requirements", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT category_code, category_name, requirement_type_code,
              requirement_name, required_credits, source, note,
              created_at, updated_at
         FROM plan_program_requirements
         ORDER BY category_code, requirement_type_code`
    )
    .all();
  res.json(rows);
});

// ═════════════════════════════════════════════
// 校验工具
// ═════════════════════════════════════════════
function validateTermOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 8) {
    throw new Error("term 必须为 1-8 整数或 null");
  }
  return v as number;
}
function validateStudyStatus(v: unknown): StudyStatus {
  if (typeof v !== "string" || !(STUDY_STATUSES as readonly string[]).includes(v)) {
    throw new Error(`study_status 必须在 ${STUDY_STATUSES.join("/")} 之中`);
  }
  return v as StudyStatus;
}
function validateScoreOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 100) {
    throw new Error("score 必须为 0-100 或 null");
  }
  return v;
}
function validateCreditCountToOrNull(v: unknown): CreditCountTo | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" || !(CREDIT_COUNT_TO_VALUES as readonly string[]).includes(v)) {
    throw new Error(`credit_count_to 必须在 ${CREDIT_COUNT_TO_VALUES.join("/")} 之中或 null`);
  }
  return v as CreditCountTo;
}
function validateStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new Error("字段必须为字符串或 null");
  return v;
}
function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${field} 必填`);
  return v.trim();
}
function requireStringValue(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) throw new Error("字段必填");
  return v.trim();
}
function validatePreferenceLevelOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 5) {
    throw new Error("preference_level 必须为 1-5 整数或 null");
  }
  return v as number;
}
function validateCategoryCode(v: unknown): CategoryCode {
  if (typeof v !== "string" || !(CATEGORY_CODES as readonly string[]).includes(v)) {
    throw new Error(`category_code 必须在 ${CATEGORY_CODES.join("/")} 之中`);
  }
  return v as CategoryCode;
}
function validateRequirementType(v: unknown): RequirementType {
  if (typeof v !== "string" || !(REQUIREMENT_TYPES as readonly string[]).includes(v)) {
    throw new Error(`requirement_type 必须在 ${REQUIREMENT_TYPES.join("/")} 之中`);
  }
  return v as RequirementType;
}
function validateCredits(v: unknown): number {
  if (typeof v !== "number" || Number.isNaN(v) || v < 0) {
    throw new Error("credits 必须为非负数");
  }
  return v;
}
function validateNonNegInt(v: unknown, field: string): number {
  if (!Number.isInteger(v) || (v as number) < 0) {
    throw new Error(`${field} 必须为非负整数`);
  }
  return v as number;
}
function categoryNameOf(code: CategoryCode): string {
  return {
    general_education: "通识教育",
    major_platform: "大类平台",
    professional_education: "专业教育",
    quality_education: "素质教育",
    practice_education: "实践教育",
  }[code];
}

// ═════════════════════════════════════════════
// 启动
// ═════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`[api] 学旅后端 v2 启动：http://localhost:${PORT}`);
});
