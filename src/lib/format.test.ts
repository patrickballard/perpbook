import { describe, expect, it } from "vitest";
import { money, moneyShort } from "./format";

describe("money", () => {
  it("keeps cents on small amounts even when asked for whole dollars", () => {
    expect(money(0.19, { compact: true, whole: true })).toBe("+$0.19");
    expect(money(-0.3, { compact: true, whole: true })).toBe("−$0.30");
    expect(money(3.8, { compact: true, whole: true })).toBe("+$3.80");
    expect(money(42.4, { compact: true, whole: true })).toBe("+$42");
    expect(money(1520, { compact: true, whole: true })).toBe("+$1.5k");
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
