const CREDIT_DECIMALS = 2;
const CREDIT_SCALE = 10 ** CREDIT_DECIMALS;

export function roundCredits(value: number): number {
  return Math.round((value + Number.EPSILON) * CREDIT_SCALE) / CREDIT_SCALE;
}

export function formatCredits(value: number): string {
  const rounded = roundCredits(value);
  if (Number.isInteger(rounded)) return String(rounded);
  if (Number.isInteger(rounded * 10)) return rounded.toFixed(1);
  return rounded.toFixed(CREDIT_DECIMALS);
}
