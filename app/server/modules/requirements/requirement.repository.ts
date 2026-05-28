import { db } from "../../db";

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

const findAllStmt = db.prepare(
  `SELECT category_code, category_name, requirement_type_code, requirement_name,
          required_credits, source, note, created_at, updated_at
     FROM plan_program_requirements
    ORDER BY category_code, requirement_type_code`
);

const findOneStmt = db.prepare(
  `SELECT category_code, category_name, requirement_type_code, requirement_name,
          required_credits, source, note, created_at, updated_at
     FROM plan_program_requirements
    WHERE category_code = ? AND requirement_type_code = ?`
);

const updateStmt = db.prepare(
  `UPDATE plan_program_requirements
      SET required_credits = ?, note = ?, updated_at = datetime('now')
    WHERE category_code = ? AND requirement_type_code = ?`
);

export const RequirementRepository = {
  findAll(): RequirementRow[] {
    return findAllStmt.all() as unknown as RequirementRow[];
  },

  findOne(categoryCode: string, typeCode: RequirementTypeCode): RequirementRow | null {
    const row = findOneStmt.get(categoryCode, typeCode) as unknown;
    return (row as RequirementRow | undefined) ?? null;
  },

  update(
    categoryCode: string,
    typeCode: RequirementTypeCode,
    patch: { requiredCredits: number; note?: string | null }
  ): RequirementRow | null {
    updateStmt.run(patch.requiredCredits, patch.note ?? null, categoryCode, typeCode);
    return this.findOne(categoryCode, typeCode);
  },
};
