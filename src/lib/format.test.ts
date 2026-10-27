import { describe, expect, it } from "vitest";
import { money, moneyHeadline, moneyShort } from "./format";

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

describe("moneyHeadline", () => {
  it("goes compact for big amounts so headlines never wrap", () => {
    expect(moneyHeadline(-23_393_876.68)).toBe("−$23.39M");
    expect(moneyHeadline(1_418.25)).toBe("+$1,418.25");
    expect(moneyHeadline(412_300)).toBe("+$412.3k");
    expect(moneyHeadline(-128_874_184)).toBe("−$128.87M");
    expect(moneyHeadline(2_500_000_000)).toBe("+$2.50B");
  });
});
