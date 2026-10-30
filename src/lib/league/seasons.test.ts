import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAddress } from "../hyperliquid/client";
import { avatarPath, SEASONS } from "./seasons";

// Entrants are typed in by hand from DMs: catch a typo here rather than on the live page.
describe("SEASONS", () => {
  it.each(SEASONS.map((s) => [s.name, s] as const))("%s is well formed", (_, s) => {
    expect(s.end).toBeGreaterThan(s.start);
    // Hyperliquid's weekly history must still reach back to the start when the week ends.
    expect(s.end - s.start).toBeLessThanOrEqual(7 * 86_400_000 - 3_600_000);
    expect(new Set(SEASONS.map((x) => x.slug)).size).toBe(SEASONS.length);
    for (const e of s.entrants) {
      expect(isAddress(e.address), `${e.handle}: ${e.address}`).toBe(true);
      expect(e.handle).toMatch(/^@[A-Za-z0-9_]{1,15}$/); // an X handle
      expect(existsSync(`public${avatarPath(e.handle)}`), `${e.handle} has no picture: run npm run league-avatars`).toBe(true);
    }
  });
});
