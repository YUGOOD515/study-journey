import express, { type Request, type Response } from "express";
import cors from "cors";
import { db, CATEGORY_TABLES, type CategoryCode } from "./db";

const app = express();
const PORT = Number(process.env.PORT ?? 5174);

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// 健康检查
// ─────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    message: "学旅后端运行正常",
    time: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// 课程基础信息
// ─────────────────────────────────────────────
app.get("/api/courses", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM courses ORDER BY course_code")
    .all();
  res.json(rows);
});

app.get("/api/courses/:code", (req: Request, res: Response) => {
  const row = db
    .prepare("SELECT * FROM courses WHERE course_code = ?")
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
      "SELECT * FROM program_requirements ORDER BY category_code, requirement_type"
    )
    .all();
  res.json(rows);
});

// ─────────────────────────────────────────────
// 已修记录：官方课 + 手动课统一返回
// ─────────────────────────────────────────────
app.get("/api/semester-courses", (_req, res) => {
  const official = db
    .prepare(
      `
      SELECT
        'official' AS source,
        NULL        AS id,
        sc.term_number,
        sc.course_code,
        sc.score,
        c.course_name,
        c.credits,
        NULL        AS category_code,
        NULL        AS course_nature,
        NULL        AS note
      FROM semester_courses sc
      JOIN courses c ON c.course_code = sc.course_code
      `
    )
    .all();

  const manual = db
    .prepare(
      `
      SELECT
        'manual'      AS source,
        id,
        term_number,
        NULL          AS course_code,
        score,
        course_name,
        credits,
        category_code,
        course_nature,
        note,
        is_interdisciplinary,
        assigned_to
      FROM manual_courses
      `
    )
    .all();

  const all = [...official, ...manual].sort(
    (a: any, b: any) =>
      a.term_number - b.term_number ||
      String(a.course_name).localeCompare(String(b.course_name), "zh-Hans-CN")
  );

  res.json(all);
});

// ── 写入：官方课程（培养方案内） ────────────────
// POST   /api/semester-courses/official        { term_number, course_code, score? }
// PATCH  /api/semester-courses/official/:code  { term_number?, score? }
// DELETE /api/semester-courses/official/:code
app.post("/api/semester-courses/official", (req: Request, res: Response) => {
  const { term_number, course_code, score } = req.body ?? {};
  if (!Number.isInteger(term_number) || term_number < 1 || term_number > 8) {
    res.status(400).json({ error: "term_number 必须为 1-8 整数" });
    return;
  }
  if (typeof course_code !== "string" || !course_code.trim()) {
    res.status(400).json({ error: "course_code 必填" });
    return;
  }
  try {
    db.prepare(
      `INSERT INTO semester_courses (term_number, course_code, score)
       VALUES (?, ?, ?)
       ON CONFLICT(term_number, course_code) DO UPDATE SET score = excluded.score`
    ).run(term_number, course_code, score ?? null);
    res.json({ ok: true, term_number, course_code, score: score ?? null });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.patch(
  "/api/semester-courses/official/:code",
  (req: Request, res: Response) => {
    const code = req.params.code;
    const { term_number, score } = req.body ?? {};
    const sets: string[] = [];
    const params: any[] = [];
    if (term_number !== undefined) {
      if (!Number.isInteger(term_number) || term_number < 1 || term_number > 8) {
        res.status(400).json({ error: "term_number 必须为 1-8 整数" });
        return;
      }
      sets.push("term_number = ?");
      params.push(term_number);
    }
    if (score !== undefined) {
      sets.push("score = ?");
      params.push(score);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "没有可更新字段" });
      return;
    }
    params.push(code);
    try {
      const info = db
        .prepare(`UPDATE semester_courses SET ${sets.join(", ")} WHERE course_code = ?`)
        .run(...params);
      if (info.changes === 0) {
        res.status(404).json({ error: "未找到该已修记录" });
        return;
      }
      res.json({ ok: true, course_code: code, changes: info.changes });
    } catch (e: any) {
      res.status(400).json({ error: String(e?.message ?? e) });
    }
  }
);

app.delete(
  "/api/semester-courses/official/:code",
  (req: Request, res: Response) => {
    const info = db
      .prepare("DELETE FROM semester_courses WHERE course_code = ?")
      .run(String(req.params.code));
    if (info.changes === 0) {
      res.status(404).json({ error: "未找到该已修记录" });
      return;
    }
    res.json({ ok: true });
  }
);

// ── 写入：手动课程（培养方案外） ────────────────
// POST   /api/semester-courses/manual         { term_number, course_name, credits, category_code, course_nature, score?, note? }
// PATCH  /api/semester-courses/manual/:id     任意字段
// DELETE /api/semester-courses/manual/:id
const VALID_CATEGORIES = new Set([
  "general_education",
  "major_platform",
  "professional_education",
  "quality_education",
  "practice_education",
]);

function categoryNameOf(code: string): string {
  return CATEGORY_TABLES[code as CategoryCode]?.name ?? code;
}

// 校验：is_interdisciplinary=1 仅允许在 通识/大类平台 上
function validateInterdisciplinary(
  isInter: unknown,
  categoryCode: string
): string | null {
  if (isInter === undefined || isInter === null) return null;
  const n = Number(isInter);
  if (n !== 0 && n !== 1) return "is_interdisciplinary 必须为 0 或 1";
  if (n === 1 && categoryCode !== "general_education" && categoryCode !== "major_platform") {
    return "is_interdisciplinary=1 仅允许在 通识教育 或 大类平台 上";
  }
  return null;
}

function validateAssignedTo(assignedTo: unknown): string | null {
  if (assignedTo === undefined || assignedTo === null) return null;
  if (assignedTo !== "interdisciplinary" && assignedTo !== "elective") {
    return "assigned_to 必须为 interdisciplinary 或 elective";
  }
  return null;
}

app.post("/api/semester-courses/manual", (req: Request, res: Response) => {
  const {
    term_number,
    course_name,
    credits,
    category_code,
    course_nature,
    score,
    note,
    is_interdisciplinary,
    assigned_to,
  } = req.body ?? {};

  if (!Number.isInteger(term_number) || term_number < 1 || term_number > 8) {
    res.status(400).json({ error: "term_number 必须为 1-8 整数" });
    return;
  }
  if (typeof course_name !== "string" || !course_name.trim()) {
    res.status(400).json({ error: "course_name 必填" });
    return;
  }
  if (typeof credits !== "number" || credits < 0) {
    res.status(400).json({ error: "credits 必须为非负数" });
    return;
  }
  if (!VALID_CATEGORIES.has(category_code)) {
    res.status(400).json({ error: `category_code 无效: ${category_code}` });
    return;
  }
  if (course_nature !== "必修" && course_nature !== "选修") {
    res.status(400).json({ error: "course_nature 仅支持 必修/选修" });
    return;
  }
  const interErr = validateInterdisciplinary(is_interdisciplinary, category_code);
  if (interErr) { res.status(400).json({ error: interErr }); return; }
  const aErr = validateAssignedTo(assigned_to);
  if (aErr) { res.status(400).json({ error: aErr }); return; }

  try {
    const info = db
      .prepare(
        `INSERT INTO manual_courses
          (term_number, course_name, credits, category_code, course_nature, score, note,
           is_interdisciplinary, assigned_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        term_number,
        course_name.trim(),
        credits,
        category_code,
        course_nature,
        score ?? null,
        note ?? null,
        Number(is_interdisciplinary ?? 0),
        assigned_to ?? "interdisciplinary"
      );
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.patch(
  "/api/semester-courses/manual/:id",
  (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "id 必须为整数" });
      return;
    }
    const allowed = [
      "term_number",
      "course_name",
      "credits",
      "category_code",
      "course_nature",
      "score",
      "note",
      "is_interdisciplinary",
      "assigned_to",
    ] as const;
    const aErr = validateAssignedTo(req.body?.assigned_to);
    if (aErr) { res.status(400).json({ error: aErr }); return; }
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(
          k === "is_interdisciplinary" ? Number(req.body[k]) : req.body[k]
        );
      }
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "没有可更新字段" });
      return;
    }
    params.push(id);
    try {
      const info = db
        .prepare(`UPDATE manual_courses SET ${sets.join(", ")} WHERE id = ?`)
        .run(...params);
      if (info.changes === 0) {
        res.status(404).json({ error: "未找到该手动课" });
        return;
      }
      res.json({ ok: true, id, changes: info.changes });
    } catch (e: any) {
      res.status(400).json({ error: String(e?.message ?? e) });
    }
  }
);

app.delete(
  "/api/semester-courses/manual/:id",
  (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const info = db
      .prepare("DELETE FROM manual_courses WHERE id = ?")
      .run(id);
    if (info.changes === 0) {
      res.status(404).json({ error: "未找到该手动课" });
      return;
    }
    res.json({ ok: true });
  }
);

// ─────────────────────────────────────────────
// 我的计划：只保存用户规划层，不污染已修记录
// ─────────────────────────────────────────────
app.get("/api/personal-plan", (_req, res) => {
  const official = db
    .prepare(
      `
      SELECT
        pp.id,
        pp.item_type,
        pp.course_code,
        pp.planned_term,
        c.course_name,
        c.credits,
        c.lecture_hours,
        c.experiment_hours,
        c.extra_hours,
        c.prerequisite_course_code,
        pre.course_name AS prerequisite_course_name,
        cw.category_code,
        cw.category_name,
        cw.course_nature,
        cw.offered_term,
        cw.course_category,
        pp.note
      FROM personal_plan pp
      JOIN courses c ON c.course_code = pp.course_code
      LEFT JOIN courses pre ON pre.course_code = c.prerequisite_course_code
      JOIN (
        ${Object.entries(CATEGORY_TABLES)
          .map(([code, meta]) => {
            const subCol =
              meta.extra === "course_category"
                ? "t.course_category"
                : "NULL AS course_category";
            return `
              SELECT
                t.course_code,
                '${code}' AS category_code,
                '${meta.name}' AS category_name,
                t.course_nature,
                t.offered_term,
                ${subCol}
              FROM ${meta.table} t
            `;
          })
          .join(" UNION ALL ")}
      ) cw ON cw.course_code = pp.course_code
      WHERE pp.item_type = 'official'
      `
    )
    .all();

  const manual = db
    .prepare(
      `
      SELECT
        id,
        item_type,
        NULL AS course_code,
        planned_term,
        manual_course_name AS course_name,
        manual_credits AS credits,
        0 AS lecture_hours,
        0 AS experiment_hours,
        0 AS extra_hours,
        NULL AS prerequisite_course_code,
        NULL AS prerequisite_course_name,
        manual_category_code AS category_code,
        manual_course_nature AS course_nature,
        NULL AS offered_term,
        NULL AS course_category,
        note,
        is_interdisciplinary,
        assigned_to
      FROM personal_plan
      WHERE item_type = 'manual'
      `
    )
    .all()
    .map((row: any) => ({
      ...row,
      category_name: categoryNameOf(row.category_code),
    }));

  const rows = [...official, ...manual].sort((a: any, b: any) => {
    // planned_term IS NULL（"待安排"）排在最后
    const at = a.planned_term ?? 99;
    const bt = b.planned_term ?? 99;
    return (
      at - bt ||
      String(a.course_name).localeCompare(String(b.course_name), "zh-Hans-CN")
    );
  });
  res.json(rows);
});

// 内部工具：判定一门 official 课是否已修（score IS NOT NULL）
function isOfficialCompleted(courseCode: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM semester_courses WHERE course_code = ? AND score IS NOT NULL LIMIT 1"
    )
    .get(courseCode);
  return !!row;
}

app.post("/api/personal-plan/official", (req: Request, res: Response) => {
  const { course_code, planned_term, note } = req.body ?? {};
  if (typeof course_code !== "string" || !course_code.trim()) {
    res.status(400).json({ error: "course_code 必填" });
    return;
  }
  // planned_term 允许 null（= 放进"待安排"抽屉）
  const isNull = planned_term === null || planned_term === undefined;
  if (
    !isNull &&
    (!Number.isInteger(planned_term) || planned_term < 1 || planned_term > 8)
  ) {
    res.status(400).json({ error: "planned_term 必须为 1-8 整数或 null" });
    return;
  }
  // 已修课（semester_courses 有成绩）不允许扔进"待安排"
  if (isNull && isOfficialCompleted(course_code.trim())) {
    res
      .status(400)
      .json({ error: "该课已修（有成绩），无法放入待安排抽屉" });
    return;
  }
  const termValue = isNull ? null : planned_term;
  try {
    const updated = db
      .prepare(
        `UPDATE personal_plan
         SET planned_term = ?, note = ?, updated_at = datetime('now')
         WHERE item_type = 'official' AND course_code = ?`
      )
      .run(termValue, note ?? null, course_code.trim());

    if (updated.changes > 0) {
      res.json({ ok: true, id: null, course_code, planned_term: termValue });
      return;
    }

    const inserted = db
      .prepare(
        `INSERT INTO personal_plan (item_type, course_code, planned_term, note)
         VALUES ('official', ?, ?, ?)`
      )
      .run(course_code.trim(), termValue, note ?? null);
    res.json({
      ok: true,
      id: inserted.lastInsertRowid,
      course_code,
      planned_term: termValue,
    });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.delete("/api/personal-plan/official/:code", (req: Request, res: Response) => {
  const info = db
    .prepare(
      "DELETE FROM personal_plan WHERE item_type = 'official' AND course_code = ?"
    )
    .run(String(req.params.code));
  res.json({ ok: true, changes: info.changes });
});

app.post("/api/personal-plan/manual", (req: Request, res: Response) => {
  const {
    planned_term,
    course_name,
    credits,
    category_code,
    course_nature,
    note,
    is_interdisciplinary,
    assigned_to,
  } = req.body ?? {};

  const isPlannedTermNull = planned_term === null || planned_term === undefined;
  if (
    !isPlannedTermNull &&
    (!Number.isInteger(planned_term) || planned_term < 1 || planned_term > 8)
  ) {
    res.status(400).json({ error: "planned_term 必须为 1-8 整数或 null" });
    return;
  }
  if (typeof course_name !== "string" || !course_name.trim()) {
    res.status(400).json({ error: "course_name 必填" });
    return;
  }
  if (typeof credits !== "number" || credits < 0) {
    res.status(400).json({ error: "credits 必须为非负数" });
    return;
  }
  if (!VALID_CATEGORIES.has(category_code)) {
    res.status(400).json({ error: `category_code 无效: ${category_code}` });
    return;
  }
  if (course_nature !== "必修" && course_nature !== "选修") {
    res.status(400).json({ error: "course_nature 仅支持 必修/选修" });
    return;
  }
  const interErr = validateInterdisciplinary(is_interdisciplinary, category_code);
  if (interErr) { res.status(400).json({ error: interErr }); return; }
  const aErr = validateAssignedTo(assigned_to);
  if (aErr) { res.status(400).json({ error: aErr }); return; }

  try {
    const info = db
      .prepare(
        `INSERT INTO personal_plan
          (item_type, planned_term, manual_course_name, manual_credits, manual_category_code, manual_course_nature, note,
           is_interdisciplinary, assigned_to)
         VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        isPlannedTermNull ? null : planned_term,
        course_name.trim(),
        credits,
        category_code,
        course_nature,
        note ?? null,
        Number(is_interdisciplinary ?? 0),
        assigned_to ?? "interdisciplinary"
      );
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.patch("/api/personal-plan/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id 必须为整数" });
    return;
  }

  const fieldMap: Record<string, string> = {
    planned_term: "planned_term",
    course_name: "manual_course_name",
    credits: "manual_credits",
    category_code: "manual_category_code",
    course_nature: "manual_course_nature",
    note: "note",
    is_interdisciplinary: "is_interdisciplinary",
    assigned_to: "assigned_to",
  };
  const aErr = validateAssignedTo(req.body?.assigned_to);
  if (aErr) { res.status(400).json({ error: aErr }); return; }

  // planned_term 校验：允许 null，但若设为 null 且条目是已修 official 课 → 拒绝
  if (req.body?.planned_term !== undefined) {
    const pt = req.body.planned_term;
    if (pt !== null && (!Number.isInteger(pt) || pt < 1 || pt > 8)) {
      res.status(400).json({ error: "planned_term 必须为 1-8 整数或 null" });
      return;
    }
    if (pt === null) {
      const row: any = db
        .prepare(
          "SELECT item_type, course_code FROM personal_plan WHERE id = ?"
        )
        .get(id);
      if (
        row &&
        row.item_type === "official" &&
        row.course_code &&
        isOfficialCompleted(String(row.course_code))
      ) {
        res
          .status(400)
          .json({ error: "该课已修（有成绩），无法放入待安排抽屉" });
        return;
      }
    }
  }

  const sets: string[] = [];
  const params: any[] = [];
  for (const [inputKey, column] of Object.entries(fieldMap)) {
    if (req.body?.[inputKey] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(
        inputKey === "is_interdisciplinary"
          ? Number(req.body[inputKey])
          : req.body[inputKey]
      );
    }
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "没有可更新字段" });
    return;
  }
  sets.push("updated_at = datetime('now')");
  params.push(id);
  try {
    const info = db
      .prepare(`UPDATE personal_plan SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params);
    if (info.changes === 0) {
      res.status(404).json({ error: "未找到该计划记录" });
      return;
    }
    res.json({ ok: true, id, changes: info.changes });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.delete("/api/personal-plan/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM personal_plan WHERE id = ?").run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "未找到该计划记录" });
    return;
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// 学分归属（经法管融通课程的二选一覆盖）
//   默认 = interdisciplinary（计入「大类平台·经法管融通」）
//   override = elective（搬回该课原属板块的"选修"桶）
// ─────────────────────────────────────────────
app.get("/api/credit-assignments", (_req, res) => {
  const rows = db
    .prepare("SELECT course_code, assigned_to FROM credit_assignment")
    .all();
  res.json(rows);
});

app.put("/api/credit-assignments/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  const { assigned_to } = req.body ?? {};
  if (assigned_to !== "interdisciplinary" && assigned_to !== "elective") {
    res
      .status(400)
      .json({ error: "assigned_to 必须为 interdisciplinary 或 elective" });
    return;
  }
  try {
    db.prepare(
      `INSERT INTO credit_assignment (course_code, assigned_to, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(course_code) DO UPDATE SET
         assigned_to = excluded.assigned_to,
         updated_at = excluded.updated_at`
    ).run(code, assigned_to);
    res.json({ ok: true, course_code: code, assigned_to });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.delete("/api/credit-assignments/:code", (req: Request, res: Response) => {
  const info = db
    .prepare("DELETE FROM credit_assignment WHERE course_code = ?")
    .run(String(req.params.code));
  res.json({ ok: true, changes: info.changes });
});

// ─────────────────────────────────────────────
// 5 大板块列表
// ─────────────────────────────────────────────
app.get("/api/categories", (_req, res) => {
  res.json(
    Object.entries(CATEGORY_TABLES).map(([code, v]) => ({
      code,
      name: v.name,
    }))
  );
});

// ─────────────────────────────────────────────
// 某板块下所有课程（联表 courses）
// ─────────────────────────────────────────────
app.get("/api/categories/:code/courses", (req: Request, res: Response) => {
  const code = req.params.code as CategoryCode;
  const meta = CATEGORY_TABLES[code];
  if (!meta) {
    res.status(404).json({ error: `未知类别: ${code}` });
    return;
  }
  const extraCol = meta.extra ? `, t.${meta.extra}` : "";
  const rows = db
    .prepare(
      `
      SELECT
        c.course_code,
        c.course_name,
        c.credits,
        c.lecture_hours,
        c.experiment_hours,
        c.extra_hours,
        c.prerequisite_course_code,
        pre.course_name AS prerequisite_course_name,
        t.course_nature,
        t.offered_term${extraCol}
      FROM ${meta.table} t
      JOIN courses c ON c.course_code = t.course_code
      LEFT JOIN courses pre ON pre.course_code = c.prerequisite_course_code
      ORDER BY t.course_nature DESC, c.course_code
      `
    )
    .all();
  res.json({ code, name: meta.name, courses: rows });
});

// ─────────────────────────────────────────────
// 一次拿全：所有课程 + 其所属板块（时间轴页要用）
// ─────────────────────────────────────────────
app.get("/api/courses-with-category", (_req, res) => {
  const queries = Object.entries(CATEGORY_TABLES).map(
    ([code, meta]) => {
      // 只有 general_education 有 course_category 字段；其他用 NULL 占位以对齐 UNION
      const subCol =
        meta.extra === "course_category"
          ? "t.course_category"
          : "NULL AS course_category";
      return `
        SELECT
          c.course_code,
          c.course_name,
          c.credits,
          c.lecture_hours,
          c.experiment_hours,
          c.extra_hours,
          c.prerequisite_course_code,
          pre.course_name AS prerequisite_course_name,
          '${code}' AS category_code,
          '${meta.name}' AS category_name,
          t.course_nature,
          t.offered_term,
          ${subCol}
        FROM ${meta.table} t
        JOIN courses c ON c.course_code = t.course_code
        LEFT JOIN courses pre ON pre.course_code = c.prerequisite_course_code
      `;
    }
  );
  const sql = `SELECT * FROM (${queries.join(" UNION ALL ")}) ORDER BY course_code`;
  const rows = db.prepare(sql).all();
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`[api] 学旅后端启动：http://localhost:${PORT}`);
});
