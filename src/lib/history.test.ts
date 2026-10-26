import { describe, expect, it } from "vitest";
import { getStorage, getStoredHistory, mergeById, requestTracking } from "./history";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("getStorage", () => {
  it("maps API answers to storage states", async () => {
    expect(await getStorage("0xa", (async () => json({ state: "untracked" })) as typeof fetch)).toEqual({ state: "untracked" });
    expect(await getStorage("0xa", (async () => json({ state: "off" })) as typeof fetch)).toEqual({ state: "off" });
    expect(await getStorage("0xa", (async () => json({ error: "boom" }, 500)) as typeof fetch)).toEqual({ state: "off" });
    expect(
      await getStorage("0xa", (async () => {
        throw new TypeError("offline");
      }) as typeof fetch),
    ).toEqual({ state: "off" });
    const status = { tracked: true, trackedSince: 1, lastSyncedAt: 2, syncError: null, gaps: [] };
    expect(await getStorage("0xa", (async () => json({ state: "tracked", status })) as typeof fetch)).toEqual({ state: "tracked", status });
  });
});

describe("getStoredHistory", () => {
  it("follows cursors until the last page", async () => {
    const seen: string[] = [];
    const f = (async (url: string) => {
      seen.push(url);
      if (url.includes("kind=funding")) return json({ rows: [{ id: "u", time: 1 }], next: null });
      return url.includes("after=") ? json({ rows: [{ id: "b", time: 2 }], next: null }) : json({ rows: [{ id: "a", time: 1 }], next: "1:a" });
    }) as typeof fetch;
    const h = await getStoredHistory("0xa", f);
    expect(h.fills.map((x) => x.id)).toEqual(["a", "b"]);
    expect(h.funding).toHaveLength(1);
    expect(seen).toContain("/api/w/0xa/history?kind=fills&after=1%3Aa");
  });
});

describe("requestTracking", () => {
  it("returns null on success and the server's message otherwise", async () => {
    expect(await requestTracking("0xa", (async () => json({ tracked: true }, 201)) as typeof fetch)).toBeNull();
    expect(await requestTracking("0xa", (async () => json({ error: "Try again tomorrow." }, 429)) as typeof fetch)).toBe("Try again tomorrow.");
  });
});

describe("mergeById", () => {
  it("keeps rows found in both once, in time order", () => {
    const merged = mergeById(
      [
        { id: "a", time: 1 },
        { id: "b", time: 2 },
      ],
      [
        { id: "b", time: 2 },
        { id: "c", time: 3 },
      ],
    );
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("getStoredHistory limits", () => {
  it("stops after 10 pages and says the history is partial", async () => {
    let calls = 0;
    const f = (async (url: string) => {
      calls++;
      return url.includes("kind=funding") ? json({ rows: [], next: null }) : json({ rows: [{ id: `f${calls}`, time: calls }], next: `${calls}:f${calls}` });
    }) as typeof fetch;
    const h = await getStoredHistory("0xa", f);
    expect(h.fills).toHaveLength(10);
    expect(h.complete).toBe(false);
  });
});
