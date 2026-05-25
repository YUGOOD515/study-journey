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
    .get(req.params.code);
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
        note
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
    ).run([term_number, course_code, score ?? null]);
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
        .run(params);
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
      .run([String(req.params.code)]);
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

app.post("/api/semester-courses/manual", (req: Request, res: Response) => {
  const {
    term_number,
    course_name,
    credits,
    category_code,
    course_nature,
    score,
    note,
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

  try {
    const info = db
      .prepare(
        `INSERT INTO manual_courses
          (term_number, course_name, credits, category_code, course_nature, score, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run([
        term_number,
        course_name.trim(),
        credits,
        category_code,
        course_nature,
        score ?? null,
        note ?? null,
      ]);
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
    ] as const;
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(req.body[k]);
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
        .run(params);
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
      .run([id]);
    if (info.changes === 0) {
      res.status(404).json({ error: "未找到该手动课" });
      return;
    }
    res.json({ ok: true });
  }
);

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
