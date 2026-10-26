import { describe, expect, it } from "vitest";
import { analyticsPath } from "./VercelAnalytics";

describe("analyticsPath", () => {
  it("never reports a wallet address", () => {
    expect(analyticsPath("/w/0xf9f8383cd2f0c8b4378cf44036f66143271ef2e5")).toBe("/w/[address]");
    expect(analyticsPath("/w/demo")).toBe("/w/demo");
    expect(analyticsPath("/")).toBe("/");
  });
});
