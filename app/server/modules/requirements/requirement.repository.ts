import type { Ctx } from "../../context";

export type RequirementTypeCode = "required" | "elective" | "interdisciplinary";

export interface RequirementRow {
  category_code: string;
  category_name: string;
  requirement_type_code: RequirementTypeCode;
  requirement_name: string;
  required_credits: number;
  source: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 学分要求 = 培养方案默认值（共享）+ 当前用户的个人调整（user_requirement_overrides）。
 */
const SELECT_REQUIREMENTS = `
  SELECT r.category_code, r.category_name, r.requirement_type_code, r.requirement_name,
         COALESCE(o.required_credits, r.required_credits) AS required_credits,
         r.source,
         CASE WHEN o.user_id IS NOT NULL THEN o.note ELSE r.note END AS note,
         r.created_at,
         COALESCE(o.updated_at, r.updated_at) AS updated_at
    FROM plan_program_requirements r
    LEFT JOIN user_requirement_overrides o
      ON o.user_id = ?
     AND o.category_code = r.category_code
     AND o.requirement_type_code = r.requirement_type_code
`;

export const RequirementRepository = {
  findAll(ctx: Ctx): Promise<RequirementRow[]> {
    return ctx.db.all<RequirementRow>(
      `${SELECT_REQUIREMENTS} ORDER BY r.category_code, r.requirement_type_code`,
      [ctx.userId]
    );
  },

  findOne(ctx: Ctx, categoryCode: string, typeCode: RequirementTypeCode): Promise<RequirementRow | null> {
    return ctx.db.first<RequirementRow>(
      `${SELECT_REQUIREMENTS} WHERE r.category_code = ? AND r.requirement_type_code = ?`,
      [ctx.userId, categoryCode, typeCode]
    );
  },

  async upsertOverride(
    ctx: Ctx,
    categoryCode: string,
    typeCode: RequirementTypeCode,
    patch: { requiredCredits: number; note?: string | null }
  ): Promise<RequirementRow | null> {
    await ctx.db.run(
      `INSERT INTO user_requirement_overrides (user_id, category_code, requirement_type_code, required_credits, note, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (user_id, category_code, requirement_type_code)
       DO UPDATE SET required_credits = excluded.required_credits, note = excluded.note, updated_at = excluded.updated_at`,
      [ctx.userId, categoryCode, typeCode, patch.requiredCredits, patch.note ?? null]
    );
    return this.findOne(ctx, categoryCode, typeCode);
  },
};
