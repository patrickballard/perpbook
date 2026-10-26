import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./site";

describe("siteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers SITE_URL, then Vercel's production domain, else nothing", () => {
    vi.stubEnv("SITE_URL", "https://perpbook.example");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "perpbook.vercel.app");
    expect(siteUrl()?.host).toBe("perpbook.example");
    vi.stubEnv("SITE_URL", undefined as unknown as string);
    expect(siteUrl()?.toString()).toBe("https://perpbook.vercel.app/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined as unknown as string);
    expect(siteUrl()).toBeNull();
  });

  it("ignores a SITE_URL that isn't a URL", () => {
    vi.stubEnv("SITE_URL", "not a url");
    expect(siteUrl()).toBeNull();
  });
});
