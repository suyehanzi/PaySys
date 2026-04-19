export const DEFAULT_PAYMENT_AMOUNT = 45;
export const DEFAULT_PAYMENT_PERIOD_DAYS = 180;

export type PaymentInput = {
  amount: number;
  periodDays: number;
  notes?: string;
};

export function normalizePaymentInput(input: PaymentInput): PaymentInput {
  const notes = input.notes?.trim() || "";

  if (input.amount === 0 && input.periodDays === 30 && !notes) {
    return {
      amount: DEFAULT_PAYMENT_AMOUNT,
      periodDays: DEFAULT_PAYMENT_PERIOD_DAYS,
      notes,
    };
  }

  return {
    amount: input.amount,
    periodDays: input.periodDays,
    notes,
  };
}
