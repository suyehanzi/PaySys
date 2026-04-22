import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir = "";
let db: typeof import("@/lib/db");
let upstream: typeof import("@/lib/upstream");

async function loadFreshModules() {
  vi.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paysys-upstream-"));
  vi.stubEnv("PAYSYS_DB_PATH", path.join(tempDir, "test.sqlite"));
  db = await import("@/lib/db");
  upstream = await import("@/lib/upstream");
  upstream.resetRefreshStateForTests();
}

describe("upstream refresh", () => {
  beforeEach(async () => {
    await loadFreshModules();
  });

  afterEach(() => {
    upstream.resetRefreshStateForTests();
    db.closeDbForTests();
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("stores content from a manually pasted temporary URL", async () => {
    const fetcher = vi.fn(async () => new Response("proxy-content", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    }));

    await upstream.refreshFromTemporaryUrl("https://example.com/temp", { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.getUpstreamContent().content).toBe("proxy-content");
    expect(db.getUpstreamStatus().hasContent).toBe(true);
  });

  it("refreshes the upstream cache bound to a customer group", async () => {
    db.createUpstreamAccount({
      groupName: "2群",
      email: "two@example.com",
      password: "secret",
    });
    const provider = vi.fn(async () => "https://example.com/group-two");
    const fetcher = vi.fn(async () => new Response("group-two-content"));

    await upstream.refreshUpstreamForGroup("2群", { provider, fetcher, cooldownMs: 0 });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.getUpstreamContentForGroup("2群").content).toBe("group-two-content");
    expect(db.getUpstreamContent().content).toBe("");
  });

  it("falls back to the legacy upstream refresh when a group has no account", async () => {
    const provider = vi.fn(async () => "https://example.com/global");
    const fetcher = vi.fn(async () => new Response("global-content"));

    await upstream.refreshUpstreamForGroup("未绑定", { provider, fetcher, cooldownMs: 0 });

    expect(db.getUpstreamContent().content).toBe("global-content");
  });

  it("preserves old cache content when refresh fails", async () => {
    db.updateUpstreamCache({ content: "old-content", contentType: "text/plain" });
    const fetcher = vi.fn(async () => new Response("bad", { status: 500 }));

    await expect(upstream.refreshFromTemporaryUrl("https://example.com/temp", { fetcher })).rejects.toThrow(
      "HTTP 500",
    );

    expect(db.getUpstreamContent().content).toBe("old-content");
    expect(db.getUpstreamStatus().lastError).toContain("HTTP 500");
  });

  it("joins concurrent automatic refresh requests into one provider call", async () => {
    let resolveProvider!: (url: string) => void;
    const provider = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveProvider = resolve;
        }),
    );
    const fetcher = vi.fn(async () => new Response("fresh-content"));

    const first = upstream.refreshUpstreamAutomatically({ provider, fetcher, cooldownMs: 0 });
    const second = upstream.refreshUpstreamAutomatically({ provider, fetcher, cooldownMs: 0 });

    expect(provider).toHaveBeenCalledTimes(1);
    resolveProvider("https://example.com/sub");
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.getUpstreamContent().content).toBe("fresh-content");
  });

  it("skips automatic refresh during cooldown", async () => {
    let now = 1_000;
    const provider = vi.fn(async () => "https://example.com/sub");
    const fetcher = vi.fn(async () => new Response("fresh-content"));

    await upstream.refreshUpstreamAutomatically({ provider, fetcher, cooldownMs: 60_000, now: () => now });
    now = 1_500;
    const result = await upstream.refreshUpstreamAutomatically({ provider, fetcher, cooldownMs: 60_000, now: () => now });

    expect(result.skipped).toBe("cooldown");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
