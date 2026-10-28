import { describe, expect, it } from "vitest";
import { count, money, moneyHeadline, moneyShort, when } from "./format";

describe("money", () => {
  it("keeps cents on small amounts even when asked for whole dollars", () => {
    expect(money(0.19, { compact: true, whole: true })).toBe("+$0.19");
    expect(money(-0.3, { compact: true, whole: true })).toBe("−$0.30");
    expect(money(3.8, { compact: true, whole: true })).toBe("+$3.80");
    expect(money(42.4, { compact: true, whole: true })).toBe("+$42");
    expect(money(1520, { compact: true, whole: true })).toBe("+$1.5k");
    // Millions and billions, not "+$3397k"; and no "1000k" at the boundary.
    expect(money(3_397_000, { compact: true, whole: true })).toBe("+$3.4M");
    expect(money(-23_390_000, { compact: true })).toBe("−$23M");
    expect(money(999_600, { compact: true })).toBe("+$1.0M");
    expect(money(999_400, { compact: true })).toBe("+$999k");
    expect(money(2_500_000_000, { compact: true })).toBe("+$2.5B");
  });
});

describe("moneyShort", () => {
  it("fits calendar cells: cents, then one decimal, then whole dollars", () => {
    expect(moneyShort(0.05)).toBe("+5¢");
    expect(moneyShort(-0.02)).toBe("−2¢");
    expect(moneyShort(1.6)).toBe("+$1.6");
    expect(moneyShort(-9.94)).toBe("−$9.9");
    expect(moneyShort(149.2)).toBe("+$149");
    expect(moneyShort(0.001)).toBe("0¢");
  });
});

describe("count", () => {
  it("only pluralises when it isn't one", () => {
    expect(count(1, "trade")).toBe("1 trade");
    expect(count(0, "trade")).toBe("0 trades");
    expect(count(1234, "trade")).toBe("1,234 trades");
  });
});

describe("moneyHeadline", () => {
  it("goes compact for big amounts so headlines never wrap", () => {
    expect(moneyHeadline(-23_393_876.68)).toBe("−$23.39M");
    expect(moneyHeadline(1_418.25)).toBe("+$1,418.25");
    expect(moneyHeadline(412_300)).toBe("+$412.3k");
    expect(moneyHeadline(-48_210.47)).toBe("−$48,210");
    expect(moneyHeadline(9_999.99)).toBe("+$9,999.99");
    expect(moneyHeadline(-128_874_184)).toBe("−$128.87M");
    expect(moneyHeadline(2_500_000_000)).toBe("+$2.50B");
  });

  it("switches unit instead of printing 1000.0k or 1000.00M", () => {
    expect(moneyHeadline(999_960)).toBe("+$1.00M");
    expect(moneyHeadline(999_940)).toBe("+$999.9k");
    expect(moneyHeadline(-999_996_000)).toBe("−$1.00B");
  });
});

describe("when", () => {
  it("adds the year only when it isn't this one", () => {
    const now = Date.UTC(2026, 9, 28, 12);
    expect(when(Date.UTC(2026, 2, 13, 12), now)).not.toMatch(/2026/);
    expect(when(Date.UTC(2025, 2, 13, 12), now)).toMatch(/2025/);
  });
});
