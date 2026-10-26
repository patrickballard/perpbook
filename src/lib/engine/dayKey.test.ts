import { describe, expect, it } from "vitest";
import { dayKey } from "./stats";

const plain = (ms: number, timeZone?: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

describe("dayKey", () => {
  it("gives the same date as formatting each timestamp, in every kind of time zone", () => {
    // Quarter-hour (Nepal), half-hour (India, Newfoundland), daylight saving (London, New York), far east (Kiribati).
    const zones = [undefined, "UTC", "Asia/Kathmandu", "Asia/Kolkata", "America/St_Johns", "Europe/London", "America/New_York", "Pacific/Kiritimati"];
    // Every minute either side of midnight UTC and of the clock changes, plus a spread over two years.
    const times: number[] = [];
    for (const edge of [Date.UTC(2026, 9, 25, 0, 0), Date.UTC(2026, 9, 25, 1, 0), Date.UTC(2026, 10, 1, 6, 0), Date.UTC(2026, 2, 29, 1, 0)]) {
      for (let m = -90; m <= 90; m++) times.push(edge + m * 60_000 + 59_999, edge + m * 60_000);
    }
    for (let i = 0; i < 2_000; i++) times.push(Date.UTC(2025, 0, 1) + Math.floor(i * 31_556_952.7));
    for (const z of zones) for (const t of times) expect(dayKey(t, z), `${new Date(t).toISOString()} in ${z}`).toBe(plain(t, z));
  });
});
