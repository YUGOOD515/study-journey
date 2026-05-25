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
// 已修学期记录（带课程名 / 学分）
// ─────────────────────────────────────────────
app.get("/api/semester-courses", (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT
        sc.term_number,
        sc.course_code,
        sc.score,
        c.course_name,
        c.credits
      FROM semester_courses sc
      JOIN courses c ON c.course_code = sc.course_code
      ORDER BY sc.term_number, sc.course_code
      `
    )
    .all();
  res.json(rows);
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
