import { describe, expect, it } from "vitest";
import { hasFullHistory } from "./stats";

const DAY = 86_400_000;

describe("hasFullHistory", () => {
  it("is true when our oldest fill is near the start of Hyperliquid's record", () => {
    expect(hasFullHistory(1_000 * DAY + 0.5 * DAY, 1_000 * DAY)).toBe(true); // first trade 12 hours after the account started
  });
  it("is false when history starts long after the account did, or a timestamp is missing", () => {
    expect(hasFullHistory(1_200 * DAY, 1_000 * DAY)).toBe(false);
    expect(hasFullHistory(null, 1_000 * DAY)).toBe(false);
    expect(hasFullHistory(1_000 * DAY, null)).toBe(false);
  });
});
