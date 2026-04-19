import { describe, expect, it } from "vitest";
import { normalizePaymentInput } from "@/lib/payments";

describe("payment input normalization", () => {
  it("converts the old stale 0 yuan 30 day default to the current renewal default", () => {
    expect(normalizePaymentInput({ amount: 0, periodDays: 30, notes: "" })).toEqual({
      amount: 45,
      periodDays: 180,
      notes: "",
    });
  });

  it("keeps intentional non-default payment values", () => {
    expect(normalizePaymentInput({ amount: 30, periodDays: 30, notes: "" })).toEqual({
      amount: 30,
      periodDays: 30,
      notes: "",
    });
  });
});
