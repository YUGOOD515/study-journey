import { fail } from "../../lib/errors";
import { expectEnum, expectNumber, expectString } from "../../lib/validate";
import {
  RequirementRepository,
  type RequirementRow,
  type RequirementTypeCode,
} from "./requirement.repository";

const REQUIREMENT_TYPE_CODES = ["required", "elective", "interdisciplinary"] as const;

export interface RequirementDto {
  categoryCode: string;
  categoryName: string;
  requirementTypeCode: RequirementTypeCode;
  requirementName: string;
  requiredCredits: number;
  source: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: RequirementRow): RequirementDto {
  return {
    categoryCode: row.category_code,
    categoryName: row.category_name,
    requirementTypeCode: row.requirement_type_code,
    requirementName: row.requirement_name,
    requiredCredits: row.required_credits,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const RequirementService = {
  list(): RequirementDto[] {
    return RequirementRepository.findAll().map(toDto);
  },

  updateThreshold(
    categoryCode: string,
    typeCode: string,
    body: unknown
  ): RequirementDto {
    const categoryCodeValue = expectString(categoryCode, "categoryCode")!;
    const typeCodeValue = expectEnum(typeCode, "requirementTypeCode", REQUIREMENT_TYPE_CODES)!;

    const patch = (body ?? {}) as Record<string, unknown>;
    const requiredCredits = expectNumber(patch.requiredCredits, "requiredCredits", { min: 0 })!;
    const note =
      patch.note === undefined
        ? null
        : patch.note === null
          ? null
          : expectString(patch.note, "note", { allowNull: true });

    const existing = RequirementRepository.findOne(categoryCodeValue, typeCodeValue);
    if (!existing) {
      throw fail.notFound("requirement", `${categoryCodeValue}/${typeCodeValue}`);
    }

    const updated = RequirementRepository.update(categoryCodeValue, typeCodeValue, {
      requiredCredits,
      note,
    });
    if (!updated) throw fail.notFound("requirement", `${categoryCodeValue}/${typeCodeValue}`);
    return toDto(updated);
  },
};
