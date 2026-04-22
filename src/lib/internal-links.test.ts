import { describe, expect, it, vi } from "vitest";

describe("internal test links", () => {
  it("signs internal group subscription links", async () => {
    vi.resetModules();
    vi.stubEnv("INTERNAL_TEST_SECRET", "test-secret");
    const internalLinks = await import("@/lib/internal-links");

    const token = internalLinks.createInternalGroupToken("2群");

    expect(internalLinks.verifyInternalGroupToken("2群", token)).toBe(true);
    expect(internalLinks.verifyInternalGroupToken("1群", token)).toBe(false);

    vi.unstubAllEnvs();
  });
});
