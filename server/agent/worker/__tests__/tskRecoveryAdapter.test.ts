import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

vi.mock("../commandRunner", async () => {
  const actual: any = await vi.importActual<typeof import("../commandRunner")>("../commandRunner");
  return {
    ...actual,
    createStagingDirectory: vi.fn(async (p: string) => {
      return await fs.mkdtemp(path.join(process.cwd(), "test-tsk-"));
    }),
    createCommandRunner: vi.fn(() => ({
      run: async ({ executable, args }: any) => {
        if (executable === "fls") {
          return { exitCode: 0, stdout: "r/r 123: secret.txt\n", stderr: "", durationMs: 10, startedAt: new Date(), finishedAt: new Date() };
        }
        if (executable === "icat") {
          return { exitCode: 0, stdout: "file-bytes", stderr: "", durationMs: 5, startedAt: new Date(), finishedAt: new Date() };
        }
        return { exitCode: 1, stdout: "", stderr: "not found" };
      },
    })),
    resolveRecoveryExecutable: vi.fn((configured: any, env: any, fallback: any) => (fallback === "icat" ? "icat" : "fls")),
  };
});

import { TskRecoveryAdapter } from "../tskRecoveryAdapter";

describe("TskRecoveryAdapter (unit)", () => {
  let stagingDirs: string[] = [];
  beforeEach(() => {
    stagingDirs = [];
  });
  afterEach(async () => {
    for (const d of stagingDirs) {
      try {
        await fs.rm(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    vi.restoreAllMocks();
  });

  it("extracts listing and files when fls+icat are available", async () => {
    const adapter = new TskRecoveryAdapter({});
    const result = await adapter.recover("C:\\fake\\image.E01", { config: { maxFiles: 2 } });
    expect(result.outputLocation).toBeDefined();
    expect(Array.isArray(result.artifacts)).toBe(true);
    // We expect at least the listing
    expect(result.artifacts.some((a: any) => a.path.endsWith("fls-listing.txt"))).toBe(true);
  });
});
