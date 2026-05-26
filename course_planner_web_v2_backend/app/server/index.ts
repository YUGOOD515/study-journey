import express, { type Request, type Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { db, CATEGORIES, CATEGORY_NAME_BY_CODE, type CategoryCode } from "./db";

const app = express();
const PORT = Number(process.env.PORT ?? 5174);

app.use(cors());
app.use(express.json());

const VALID_CATEGORIES = new Set(CATEGORIES.map((c) => c.code));
const VALID_REQUIREMENT_TYPES = new Set(["必修", "选修", "跨专业"]);
const VALID_ASSIGNMENTS = new Set(["interdisciplinary", "elective"]);

function isCategoryCode(value: unknown): value is CategoryCode {
  return typeof value === "string" && VALID_CATEGORIES.has(value as CategoryCode);
}

function categoryNameOf(code: string): string {
  return CATEGORY_NAME_BY_CODE[code as CategoryCode] ?? code;
}

function scoreToStudyStatus(score: unknown, fallbackWhenNoScore: "正在修读" | "计划修读" | "未修读") {
  if (score === null || score === undefined || score === "") return fallbackWhenNoScore;
  const n = Number(score);
  return n >= 60 ? "已修读" : "未通过";
}

function validateTerm(value: unknown, field = "term_number", allowNull = false): string | null {
  if (allowNull && (value === null || value === undefined)) return null;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 8) {
    return `${field} 必须为 1-8 整数${allowNull ? "或 null" : ""}`;
  }
  return null;
}

function validateCredits(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "credits 必须为非负数";
  }
  return null;
}

function validateScore(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    return "score 必须为 0-100 之间的数字，或 null";
  }
  return null;
}

function assignmentToCreditCountTo(assignedTo: "interdisciplinary" | "elective"): string {
  return assignedTo === "elective" ? "通识教育-选修" : "大类平台-选修";
}

function creditCountToToAssignment(value: unknown): "interdisciplinary" | "elective" {
  return value === "通识教育-选修" ? "elective" : "interdisciplinary";
}

function isInterdisciplinaryFromRow(row: any): number {
  const sub = String(row.course_subcategory ?? row.course_category ?? "");
  const countTo = row.credit_count_to;
  return sub.includes("经法管融通") || countTo ? 1 : 0;
}

function buildCustomCode(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  for (let i = 0; i < 20; i += 1) {
    const code = `CUSTOM-${y}${m}${d}-${String(Date.now() % 1000000).padStart(6, "0")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
    const exists = db.prepare("SELECT 1 FROM plan_custom_courses WHERE course_code = ?").get(code);
    if (!exists) return code;
  }
  return `CUSTOM-${randomUUID()}`;
}

function courseSelectSql(tableName: "plan_program_courses" | "plan_custom_courses", alias = "pc") {
  const offeredExpr = tableName === "plan_program_courses" ? `${alias}.official_term` : "NULL";
  return `
    SELECT
      ${alias}.rowid AS id,
      ${alias}.course_code,
      ${alias}.section_code,
      ${alias}.course_name,
      ${alias}.credits,
      ${alias}.total_hours,
      ${alias}.lecture_hours,
      ${alias}.experiment_hours,
      ${alias}.extra_hours,
      ${alias}.prerequisite_course_code,
      pre.course_name AS prerequisite_course_name,
      ${alias}.category_code,
      ${alias}.category_name,
      ${alias}.requirement_type AS course_nature,
      ${offeredExpr} AS offered_term,
      ${alias}.course_subcategory AS course_category,
      ${alias}.credit_count_to,
      ${alias}.note,
      ${alias}.study_status,
      ${tableName === "plan_program_courses" ? `${alias}.planned_term` : `${alias}.term_number`} AS planned_term,
      ${tableName === "plan_program_courses" ? `${alias}.actual_term` : `${alias}.term_number`} AS actual_term,
      ${alias}.score
    FROM ${tableName} ${alias}
    LEFT JOIN plan_program_courses pre ON pre.course_code = ${alias}.prerequisite_course_code
  `;
}

function sendDbError(res: Response, e: unknown) {
  res.status(400).json({ error: String((e as any)?.message ?? e) });
}

// ─────────────────────────────────────────────
// 健康检查
// ─────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'plan_%' OR name LIKE 'raw_%') ORDER BY name")
    .all()
    .map((r: any) => r.name);
  res.json({
    ok: true,
    message: "学旅后端运行正常，已连接 v2 数据库",
    time: new Date().toISOString(),
    tables,
  });
});

// ─────────────────────────────────────────────
// 课程基础信息：v2 中培养方案课程来自 plan_program_courses
// ─────────────────────────────────────────────
app.get("/api/courses", (_req, res) => {
  const rows = db.prepare(`${courseSelectSql("plan_program_courses")} ORDER BY pc.course_code`).all();
  res.json(rows);
});

app.get("/api/courses/:code", (req: Request, res: Response) => {
  const row = db
    .prepare(`${courseSelectSql("plan_program_courses")} WHERE pc.course_code = ?`)
    .get(String(req.params.code));
  if (!row) {
    res.status(404).json({ error: "未找到该课程" });
    return;
  }
  res.json(row);
});

// ─────────────────────────────────────────────
// 培养方案学分要求
// ─────────────────────────────────────────────
app.get("/api/program-requirements", (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT
        category_code,
        category_name,
        requirement_type_code AS requirement_type,
        requirement_name,
        required_credits,
        source,
        note
      FROM plan_program_requirements
      ORDER BY
        CASE category_code
          WHEN 'general_education' THEN 1
          WHEN 'major_platform' THEN 2
          WHEN 'professional_education' THEN 3
          WHEN 'quality_education' THEN 4
          WHEN 'practice_education' THEN 5
          ELSE 99
        END,
        CASE requirement_type_code
          WHEN 'required' THEN 1
          WHEN 'elective' THEN 2
          WHEN 'interdisciplinary' THEN 3
          ELSE 99
        END
      `
    )
    .all();
  res.json(rows);
});

// ─────────────────────────────────────────────
// 已修/正在修读记录：官方课 + 自定义课统一返回
// ─────────────────────────────────────────────
app.get("/api/semester-courses", (_req, res) => {
  const official = db
    .prepare(
      `
      SELECT
        'official' AS source,
        NULL AS id,
        pc.actual_term AS term_number,
        pc.course_code,
        pc.score,
        pc.course_name,
        pc.credits,
        pc.category_code,
        pc.requirement_type AS course_nature,
        pc.note,
        0 AS is_interdisciplinary,
        NULL AS assigned_to
      FROM plan_program_courses pc
      WHERE pc.actual_term IS NOT NULL
         OR pc.score IS NOT NULL
         OR pc.study_status IN ('正在修读', '已修读', '未通过')
      `
    )
    .all();

  const manual = db
    .prepare(
      `
      SELECT
        'manual' AS source,
        pc.rowid AS id,
        pc.term_number,
        NULL AS course_code,
        pc.score,
        pc.course_name,
        pc.credits,
        pc.category_code,
        pc.requirement_type AS course_nature,
        pc.note,
        CASE
          WHEN pc.course_subcategory LIKE '%经法管融通%' OR pc.credit_count_to IS NOT NULL THEN 1
          ELSE 0
        END AS is_interdisciplinary,
        CASE
          WHEN pc.credit_count_to = '通识教育-选修' THEN 'elective'
          ELSE 'interdisciplinary'
        END AS assigned_to
      FROM plan_custom_courses pc
      WHERE pc.study_status IN ('正在修读', '已修读', '未通过')
         OR pc.score IS NOT NULL
      `
    )
    .all();

  const all = [...official, ...manual]
    .filter((row: any) => row.term_number != null)
    .sort(
      (a: any, b: any) =>
        Number(a.term_number) - Number(b.term_number) ||
        String(a.course_name).localeCompare(String(b.course_name), "zh-Hans-CN")
    );

  res.json(all);
});

// ── 写入：官方课程（培养方案内） ────────────────
app.post("/api/semester-courses/official", (req: Request, res: Response) => {
  const { term_number, course_code, score } = req.body ?? {};
  const termErr = validateTerm(term_number);
  const scoreErr = validateScore(score);
  if (termErr) { res.status(400).json({ error: termErr }); return; }
  if (scoreErr) { res.status(400).json({ error: scoreErr }); return; }
  if (typeof course_code !== "string" || !course_code.trim()) {
    res.status(400).json({ error: "course_code 必填" });
    return;
  }

  const code = course_code.trim();
  const status = scoreToStudyStatus(score, "正在修读");
  try {
    const info = db
      .prepare(
        `
        UPDATE plan_program_courses
        SET actual_term = ?,
            score = ?,
            study_status = ?
        WHERE course_code = ?
        `
      )
      .run(term_number, score ?? null, status, code);
    if (info.changes === 0) {
      res.status(404).json({ error: "未找到该培养方案课程" });
      return;
    }
    res.json({ ok: true, term_number, course_code: code, score: score ?? null });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.patch("/api/semester-courses/official/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  const current: any = db
    .prepare("SELECT actual_term, planned_term, score FROM plan_program_courses WHERE course_code = ?")
    .get(code);
  if (!current) {
    res.status(404).json({ error: "未找到该培养方案课程" });
    return;
  }

  const { term_number, score } = req.body ?? {};
  if (term_number !== undefined) {
    const termErr = validateTerm(term_number);
    if (termErr) { res.status(400).json({ error: termErr }); return; }
  }
  if (score !== undefined) {
    const scoreErr = validateScore(score);
    if (scoreErr) { res.status(400).json({ error: scoreErr }); return; }
  }
  if (term_number === undefined && score === undefined) {
    res.status(400).json({ error: "没有可更新字段" });
    return;
  }

  const nextActualTerm = term_number !== undefined ? term_number : current.actual_term;
  const nextScore = score !== undefined ? score : current.score;
  const fallback = nextActualTerm != null ? "正在修读" : current.planned_term != null ? "计划修读" : "未修读";
  const status = scoreToStudyStatus(nextScore, fallback);

  try {
    const info = db
      .prepare(
        `
        UPDATE plan_program_courses
        SET actual_term = ?,
            score = ?,
            study_status = ?
        WHERE course_code = ?
        `
      )
      .run(nextActualTerm, nextScore ?? null, status, code);
    res.json({ ok: true, course_code: code, changes: info.changes });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.delete("/api/semester-courses/official/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  try {
    const row: any = db
      .prepare("SELECT planned_term FROM plan_program_courses WHERE course_code = ?")
      .get(code);
    if (!row) {
      res.status(404).json({ error: "未找到该培养方案课程" });
      return;
    }
    const status = row.planned_term == null ? "未修读" : "计划修读";
    const info = db
      .prepare(
        `
        UPDATE plan_program_courses
        SET actual_term = NULL,
            score = NULL,
            study_status = ?
        WHERE course_code = ?
        `
      )
      .run(status, code);
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    sendDbError(res, e);
  }
});

// ── 写入：自定义课程（培养方案外） ────────────────
function validateManualBase(input: any, requireTerm: boolean): string | null {
  if (requireTerm) {
    const termErr = validateTerm(input.term_number);
    if (termErr) return termErr;
  }
  if (typeof input.course_name !== "string" || !input.course_name.trim()) return "course_name 必填";
  const creditErr = validateCredits(input.credits);
  if (creditErr) return creditErr;
  if (!isCategoryCode(input.category_code)) return `category_code 无效: ${input.category_code}`;
  if (input.course_nature !== "必修" && input.course_nature !== "选修") return "course_nature 仅支持 必修/选修";
  const scoreErr = validateScore(input.score);
  if (scoreErr) return scoreErr;
  if (input.is_interdisciplinary !== undefined && input.is_interdisciplinary !== null) {
    const n = Number(input.is_interdisciplinary);
    if (n !== 0 && n !== 1) return "is_interdisciplinary 必须为 0 或 1";
    if (n === 1 && input.category_code !== "general_education" && input.category_code !== "major_platform") {
      return "is_interdisciplinary=1 仅允许在 通识教育 或 大类平台 上";
    }
  }
  if (input.assigned_to !== undefined && input.assigned_to !== null && !VALID_ASSIGNMENTS.has(input.assigned_to)) {
    return "assigned_to 必须为 interdisciplinary 或 elective";
  }
  return null;
}

function insertCustomCourse(input: any, mode: "record" | "plan") {
  const isInter = Number(input.is_interdisciplinary ?? 0) === 1;
  const assignedTo = (input.assigned_to ?? "interdisciplinary") as "interdisciplinary" | "elective";
  const score = input.score ?? null;
  const studyStatus = mode === "plan" ? "计划修读" : scoreToStudyStatus(score, "正在修读");
  const courseCode = typeof input.course_code === "string" && input.course_code.trim()
    ? input.course_code.trim()
    : buildCustomCode();

  const info = db
    .prepare(
      `
      INSERT INTO plan_custom_courses (
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
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.category_code,
      categoryNameOf(input.category_code),
      input.course_nature,
      isInter ? "大类平台（经法管融通）" : null,
      courseCode,
      input.section_code ?? null,
      input.course_name.trim(),
      input.term_number ?? input.planned_term ?? null,
      input.credits,
      input.total_hours ?? 0,
      input.lecture_hours ?? 0,
      input.experiment_hours ?? 0,
      input.extra_hours ?? 0,
      input.prerequisite_course_code ?? null,
      studyStatus,
      score,
      isInter ? assignmentToCreditCountTo(assignedTo) : null,
      input.note ?? null
    );

  return { rowid: Number(info.lastInsertRowid), course_code: courseCode };
}

app.post("/api/semester-courses/manual", (req: Request, res: Response) => {
  const input = req.body ?? {};
  const err = validateManualBase(input, true);
  if (err) { res.status(400).json({ error: err }); return; }

  try {
    const result = insertCustomCourse(input, "record");
    res.json({ ok: true, id: result.rowid, course_code: result.course_code });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.patch("/api/semester-courses/manual/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id 必须为整数" });
    return;
  }

  const current: any = db.prepare("SELECT * FROM plan_custom_courses WHERE rowid = ?").get(id);
  if (!current) {
    res.status(404).json({ error: "未找到该自定义课程" });
    return;
  }

  const patch = req.body ?? {};
  const next = {
    term_number: current.term_number,
    course_name: current.course_name,
    credits: current.credits,
    category_code: current.category_code,
    course_nature: current.requirement_type,
    score: current.score,
    note: current.note,
    is_interdisciplinary: isInterdisciplinaryFromRow(current),
    assigned_to: creditCountToToAssignment(current.credit_count_to),
  } as any;
  if (patch.term_number !== undefined) next.term_number = patch.term_number;
  if (patch.course_name !== undefined) next.course_name = patch.course_name;
  if (patch.credits !== undefined) next.credits = patch.credits;
  if (patch.category_code !== undefined) next.category_code = patch.category_code;
  if (patch.course_nature !== undefined) next.course_nature = patch.course_nature;
  if (patch.score !== undefined) next.score = patch.score;
  if (patch.note !== undefined) next.note = patch.note;
  if (patch.is_interdisciplinary !== undefined) next.is_interdisciplinary = patch.is_interdisciplinary;
  if (patch.assigned_to !== undefined) next.assigned_to = patch.assigned_to;

  const err = validateManualBase(next, false);
  if (err) { res.status(400).json({ error: err }); return; }
  if (patch.term_number !== undefined) {
    const termErr = validateTerm(patch.term_number);
    if (termErr) { res.status(400).json({ error: termErr }); return; }
  }

  const sets: string[] = [];
  const params: any[] = [];
  const add = (column: string, value: unknown) => { sets.push(`${column} = ?`); params.push(value); };

  if (patch.term_number !== undefined) add("term_number", patch.term_number);
  if (patch.course_name !== undefined) add("course_name", String(patch.course_name).trim());
  if (patch.credits !== undefined) add("credits", patch.credits);
  if (patch.category_code !== undefined) {
    add("category_code", patch.category_code);
    add("category_name", categoryNameOf(patch.category_code));
  }
  if (patch.course_nature !== undefined) add("requirement_type", patch.course_nature);
  if (patch.score !== undefined) add("score", patch.score ?? null);
  if (patch.note !== undefined) add("note", patch.note ?? null);

  if (patch.is_interdisciplinary !== undefined || patch.assigned_to !== undefined) {
    const isInter = Number(next.is_interdisciplinary ?? 0) === 1;
    add("course_subcategory", isInter ? "大类平台（经法管融通）" : null);
    add("credit_count_to", isInter ? assignmentToCreditCountTo(next.assigned_to) : null);
  }

  if (patch.score !== undefined || patch.term_number !== undefined) {
    const fallback = next.term_number != null ? "正在修读" : "计划修读";
    add("study_status", scoreToStudyStatus(next.score, fallback));
  }

  if (sets.length === 0) {
    res.status(400).json({ error: "没有可更新字段" });
    return;
  }
  params.push(id);

  try {
    const info = db
      .prepare(`UPDATE plan_custom_courses SET ${sets.join(", ")} WHERE rowid = ?`)
      .run(...params);
    res.json({ ok: true, id, changes: info.changes });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.delete("/api/semester-courses/manual/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM plan_custom_courses WHERE rowid = ?").run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "未找到该自定义课程" });
    return;
  }
  res.json({ ok: true, changes: info.changes });
});

// ─────────────────────────────────────────────
// 我的计划：官方课的 planned_term + 自定义计划课
// ─────────────────────────────────────────────
app.get("/api/personal-plan", (_req, res) => {
  const official = db
    .prepare(
      `
      SELECT
        pc.rowid AS id,
        'official' AS item_type,
        pc.course_code,
        pc.planned_term,
        pc.course_name,
        pc.credits,
        pc.lecture_hours,
        pc.experiment_hours,
        pc.extra_hours,
        pc.prerequisite_course_code,
        pre.course_name AS prerequisite_course_name,
        pc.category_code,
        pc.category_name,
        pc.requirement_type AS course_nature,
        pc.official_term AS offered_term,
        pc.course_subcategory AS course_category,
        pc.note,
        0 AS is_interdisciplinary,
        NULL AS assigned_to
      FROM plan_program_courses pc
      LEFT JOIN plan_program_courses pre ON pre.course_code = pc.prerequisite_course_code
      WHERE pc.planned_term IS NOT NULL
         OR (
          pc.planned_term IS NULL
          AND pc.actual_term IS NULL
          AND pc.score IS NULL
          AND pc.study_status = '计划修读'
         )
      `
    )
    .all();

  const manual = db
    .prepare(
      `
      SELECT
        pc.rowid AS id,
        'manual' AS item_type,
        NULL AS course_code,
        pc.term_number AS planned_term,
        pc.course_name,
        pc.credits,
        pc.lecture_hours,
        pc.experiment_hours,
        pc.extra_hours,
        pc.prerequisite_course_code,
        pre.course_name AS prerequisite_course_name,
        pc.category_code,
        pc.category_name,
        pc.requirement_type AS course_nature,
        NULL AS offered_term,
        pc.course_subcategory AS course_category,
        pc.note,
        CASE
          WHEN pc.course_subcategory LIKE '%经法管融通%' OR pc.credit_count_to IS NOT NULL THEN 1
          ELSE 0
        END AS is_interdisciplinary,
        CASE
          WHEN pc.credit_count_to = '通识教育-选修' THEN 'elective'
          ELSE 'interdisciplinary'
        END AS assigned_to
      FROM plan_custom_courses pc
      LEFT JOIN plan_program_courses pre ON pre.course_code = pc.prerequisite_course_code
      WHERE pc.study_status = '计划修读'
      `
    )
    .all();

  const rows = [...official, ...manual].sort((a: any, b: any) => {
    const at = a.planned_term ?? 99;
    const bt = b.planned_term ?? 99;
    return at - bt || String(a.course_name).localeCompare(String(b.course_name), "zh-Hans-CN");
  });
  res.json(rows);
});

function isOfficialCompleted(courseCode: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM plan_program_courses WHERE course_code = ? AND score IS NOT NULL LIMIT 1")
    .get(courseCode);
  return !!row;
}

app.post("/api/personal-plan/official", (req: Request, res: Response) => {
  const { course_code, planned_term, note } = req.body ?? {};
  if (typeof course_code !== "string" || !course_code.trim()) {
    res.status(400).json({ error: "course_code 必填" });
    return;
  }
  const isNull = planned_term === null || planned_term === undefined;
  const termErr = validateTerm(planned_term, "planned_term", true);
  if (!isNull && termErr) { res.status(400).json({ error: termErr }); return; }
  if (isNull && isOfficialCompleted(course_code.trim())) {
    res.status(400).json({ error: "该课已修（有成绩），无法放入待安排抽屉" });
    return;
  }

  const code = course_code.trim();
  try {
    const current: any = db
      .prepare("SELECT rowid AS id, actual_term, score FROM plan_program_courses WHERE course_code = ?")
      .get(code);
    if (!current) {
      res.status(404).json({ error: "未找到该培养方案课程" });
      return;
    }
    const status = current.score != null
      ? scoreToStudyStatus(current.score, "正在修读")
      : current.actual_term != null
      ? "正在修读"
      : "计划修读";
    db
      .prepare(
        `
        UPDATE plan_program_courses
        SET planned_term = ?,
            note = ?,
            study_status = ?
        WHERE course_code = ?
        `
      )
      .run(isNull ? null : planned_term, note ?? null, status, code);
    res.json({ ok: true, id: Number(current.id), course_code: code, planned_term: isNull ? null : planned_term });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.delete("/api/personal-plan/official/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  try {
    const current: any = db
      .prepare("SELECT actual_term, score FROM plan_program_courses WHERE course_code = ?")
      .get(code);
    if (!current) {
      res.status(404).json({ error: "未找到该培养方案课程" });
      return;
    }
    const status = current.score != null
      ? scoreToStudyStatus(current.score, "正在修读")
      : current.actual_term != null
      ? "正在修读"
      : "未修读";
    const info = db
      .prepare(
        `
        UPDATE plan_program_courses
        SET planned_term = NULL,
            study_status = ?,
            note = NULL
        WHERE course_code = ?
        `
      )
      .run(status, code);
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.post("/api/personal-plan/manual", (req: Request, res: Response) => {
  const input = req.body ?? {};
  const termErr = validateTerm(input.planned_term, "planned_term", true);
  if (termErr) { res.status(400).json({ error: termErr }); return; }
  const err = validateManualBase({ ...input, term_number: input.planned_term ?? 1 }, false);
  if (err) { res.status(400).json({ error: err }); return; }

  try {
    const result = insertCustomCourse({ ...input, term_number: input.planned_term ?? null }, "plan");
    res.json({ ok: true, id: result.rowid, course_code: result.course_code });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.patch("/api/personal-plan/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id 必须为整数" });
    return;
  }

  const current: any = db.prepare("SELECT * FROM plan_custom_courses WHERE rowid = ?").get(id);
  if (!current) {
    res.status(404).json({ error: "未找到该计划记录；官方课程计划请使用 /api/personal-plan/official" });
    return;
  }

  const patch = req.body ?? {};
  if (patch.planned_term !== undefined) {
    const termErr = validateTerm(patch.planned_term, "planned_term", true);
    if (termErr) { res.status(400).json({ error: termErr }); return; }
  }
  if (patch.credits !== undefined) {
    const creditErr = validateCredits(patch.credits);
    if (creditErr) { res.status(400).json({ error: creditErr }); return; }
  }
  if (patch.category_code !== undefined && !isCategoryCode(patch.category_code)) {
    res.status(400).json({ error: `category_code 无效: ${patch.category_code}` });
    return;
  }
  if (patch.course_nature !== undefined && patch.course_nature !== "必修" && patch.course_nature !== "选修") {
    res.status(400).json({ error: "course_nature 仅支持 必修/选修" });
    return;
  }
  if (patch.assigned_to !== undefined && !VALID_ASSIGNMENTS.has(patch.assigned_to)) {
    res.status(400).json({ error: "assigned_to 必须为 interdisciplinary 或 elective" });
    return;
  }

  const sets: string[] = [];
  const params: any[] = [];
  const add = (column: string, value: unknown) => { sets.push(`${column} = ?`); params.push(value); };

  if (patch.planned_term !== undefined) add("term_number", patch.planned_term);
  if (patch.course_name !== undefined) add("course_name", String(patch.course_name).trim());
  if (patch.credits !== undefined) add("credits", patch.credits);
  if (patch.category_code !== undefined) {
    add("category_code", patch.category_code);
    add("category_name", categoryNameOf(patch.category_code));
  }
  if (patch.course_nature !== undefined) add("requirement_type", patch.course_nature);
  if (patch.note !== undefined) add("note", patch.note ?? null);

  if (patch.is_interdisciplinary !== undefined || patch.assigned_to !== undefined) {
    const isInter = patch.is_interdisciplinary !== undefined
      ? Number(patch.is_interdisciplinary) === 1
      : isInterdisciplinaryFromRow(current) === 1;
    const assignedTo = (patch.assigned_to ?? creditCountToToAssignment(current.credit_count_to)) as "interdisciplinary" | "elective";
    add("course_subcategory", isInter ? "大类平台（经法管融通）" : null);
    add("credit_count_to", isInter ? assignmentToCreditCountTo(assignedTo) : null);
  }

  if (sets.length === 0) {
    res.status(400).json({ error: "没有可更新字段" });
    return;
  }
  params.push(id);

  try {
    const info = db
      .prepare(`UPDATE plan_custom_courses SET ${sets.join(", ")} WHERE rowid = ?`)
      .run(...params);
    res.json({ ok: true, id, changes: info.changes });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.delete("/api/personal-plan/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const info = db
    .prepare("DELETE FROM plan_custom_courses WHERE rowid = ? AND study_status = '计划修读'")
    .run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "未找到该计划记录" });
    return;
  }
  res.json({ ok: true, changes: info.changes });
});

// ─────────────────────────────────────────────
// 经法管融通学分归属
// 前端兼容：interdisciplinary = 计入大类平台经法管融通；elective = 计入通识教育选修
// ─────────────────────────────────────────────
app.get("/api/credit-assignments", (_req, res) => {
  const official = db
    .prepare(
      `
      SELECT
        course_code,
        CASE WHEN credit_count_to = '通识教育-选修' THEN 'elective' ELSE 'interdisciplinary' END AS assigned_to
      FROM plan_program_courses
      WHERE course_subcategory LIKE '%经法管融通%'
         OR credit_count_to IS NOT NULL
      `
    )
    .all();
  res.json(official);
});

app.put("/api/credit-assignments/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  const { assigned_to } = req.body ?? {};
  if (!VALID_ASSIGNMENTS.has(assigned_to)) {
    res.status(400).json({ error: "assigned_to 必须为 interdisciplinary 或 elective" });
    return;
  }
  const value = assignmentToCreditCountTo(assigned_to);
  try {
    const official = db
      .prepare("UPDATE plan_program_courses SET credit_count_to = ? WHERE course_code = ?")
      .run(value, code);
    if (official.changes === 0) {
      const custom = db
        .prepare("UPDATE plan_custom_courses SET credit_count_to = ? WHERE course_code = ?")
        .run(value, code);
      if (custom.changes === 0) {
        res.status(404).json({ error: "未找到该课程" });
        return;
      }
    }
    res.json({ ok: true, course_code: code, assigned_to });
  } catch (e) {
    sendDbError(res, e);
  }
});

app.delete("/api/credit-assignments/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  const official = db.prepare("UPDATE plan_program_courses SET credit_count_to = NULL WHERE course_code = ?").run(code);
  const custom = db.prepare("UPDATE plan_custom_courses SET credit_count_to = NULL WHERE course_code = ?").run(code);
  res.json({ ok: true, changes: Number(official.changes) + Number(custom.changes) });
});

// ─────────────────────────────────────────────
// 5 大板块列表
// ─────────────────────────────────────────────
app.get("/api/categories", (_req, res) => {
  res.json(CATEGORIES.map((c) => ({ code: c.code, name: c.name })));
});

app.get("/api/categories/:code/courses", (req: Request, res: Response) => {
  const code = req.params.code;
  if (!isCategoryCode(code)) {
    res.status(404).json({ error: `未知类别: ${code}` });
    return;
  }
  const rows = db
    .prepare(
      `
      ${courseSelectSql("plan_program_courses")}
      WHERE pc.category_code = ?
      ORDER BY
        CASE pc.requirement_type WHEN '必修' THEN 1 WHEN '选修' THEN 2 WHEN '跨专业' THEN 3 ELSE 9 END,
        pc.course_code
      `
    )
    .all(code);
  res.json({ code, name: categoryNameOf(code), courses: rows });
});

app.get("/api/courses-with-category", (_req, res) => {
  const rows = db
    .prepare(
      `
      ${courseSelectSql("plan_program_courses")}
      ORDER BY
        CASE pc.category_code
          WHEN 'general_education' THEN 1
          WHEN 'major_platform' THEN 2
          WHEN 'professional_education' THEN 3
          WHEN 'quality_education' THEN 4
          WHEN 'practice_education' THEN 5
          ELSE 99
        END,
        pc.course_code
      `
    )
    .all();
  res.json(rows);
});

// ─────────────────────────────────────────────
// raw_ 查询接口：不与 plan_ 产生外键关系，仅查询学校原始课程表
// ─────────────────────────────────────────────
app.get("/api/raw/batches", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM raw_import_batches ORDER BY academic_year DESC, semester DESC, phase DESC, id DESC")
    .all();
  res.json(rows);
});

app.get("/api/raw/sections", (req: Request, res: Response) => {
  const params: any[] = [];
  const where: string[] = [];
  if (req.query.batch_id) { where.push("s.batch_id = ?"); params.push(Number(req.query.batch_id)); }
  if (req.query.course_code) { where.push("s.course_code LIKE ?"); params.push(`%${String(req.query.course_code).trim()}%`); }
  if (req.query.course_name) { where.push("s.course_name LIKE ?"); params.push(`%${String(req.query.course_name).trim()}%`); }
  const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 1000);
  params.push(limit);
  const rows = db
    .prepare(
      `
      SELECT s.*, b.academic_year, b.semester, b.phase, b.source_file
      FROM raw_term_course_sections s
      JOIN raw_import_batches b ON b.id = s.batch_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY s.batch_id DESC, s.course_code, s.section_code
      LIMIT ?
      `
    )
    .all(...params);
  res.json(rows);
});

app.get("/api/raw/added-courses", (req: Request, res: Response) => {
  const params: any[] = [];
  const where: string[] = [];
  if (req.query.batch_id) { where.push("a.batch_id = ?"); params.push(Number(req.query.batch_id)); }
  if (req.query.course_code) { where.push("a.course_code LIKE ?"); params.push(`%${String(req.query.course_code).trim()}%`); }
  if (req.query.course_name) { where.push("a.course_name LIKE ?"); params.push(`%${String(req.query.course_name).trim()}%`); }
  const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 1000);
  params.push(limit);
  const rows = db
    .prepare(
      `
      SELECT a.*, b.academic_year, b.semester, b.phase, b.source_file
      FROM raw_term_added_courses a
      JOIN raw_import_batches b ON b.id = a.batch_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY a.batch_id DESC, a.course_code
      LIMIT ?
      `
    )
    .all(...params);
  res.json(rows);
});

app.get("/api/raw/course-openings/:code", (req: Request, res: Response) => {
  const code = String(req.params.code).trim();
  const sections = db
    .prepare(
      `
      SELECT s.*, b.academic_year, b.semester, b.phase, b.source_file
      FROM raw_term_course_sections s
      JOIN raw_import_batches b ON b.id = s.batch_id
      WHERE s.course_code = ?
      ORDER BY s.batch_id DESC, s.section_code
      `
    )
    .all(code);
  const added = db
    .prepare(
      `
      SELECT a.*, b.academic_year, b.semester, b.phase, b.source_file
      FROM raw_term_added_courses a
      JOIN raw_import_batches b ON b.id = a.batch_id
      WHERE a.course_code = ?
      ORDER BY a.batch_id DESC
      `
    )
    .all(code);
  res.json({ course_code: code, sections, added });
});

app.listen(PORT, () => {
  console.log(`[api] 学旅后端启动：http://localhost:${PORT}`);
});
