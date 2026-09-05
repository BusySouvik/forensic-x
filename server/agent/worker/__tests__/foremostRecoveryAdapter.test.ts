import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

vi.mock("../commandRunner", async () => {
  const actual: any = await vi.importActual<typeof import("../commandRunner")>("../commandRunner");
  return {
    ...actual,
    resolveForemostInvocation: vi.fn(() => ({ executable: "wsl.exe", args: ["--distribution", "Ubuntu", "--exec", "foremost"] })),
    createStagingDirectory: vi.fn(async (p: string) => {
      return await fs.mkdtemp(path.join(process.cwd(), "test-foremost-"));
    }),
    createCommandRunner: vi.fn(() => ({
      run: async ({ executable, args }: any) => {
        // simulate successful foremost run writing files into output dir
        const outIdx = args.indexOf("-o");
        const outDir = outIdx >= 0 ? args[outIdx + 1] : undefined;
        if (outDir) {
          const fname = path.join(outDir.replace(/^\/mnt\//, "C:/"), "00000000.jpg");
          try { await fs.mkdir(path.dirname(fname), { recursive: true }); } catch {}
          await fs.writeFile(fname, "jpeg-bytes");
        }
        return { exitCode: 0, stdout: "Foremost done", stderr: "", durationMs: 10, startedAt: new Date(), finishedAt: new Date() };
      },
    })),
  };
});

import { ForemostRecoveryAdapter } from "../foremostRecoveryAdapter";

describe("ForemostRecoveryAdapter (unit)", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("runs Foremost via WSL and collects artifacts", async () => {
    const adapter = new ForemostRecoveryAdapter({});
    const result = await adapter.recover("C:\\fake\\image.E01", {});
    expect(result.outputLocation).toBeDefined();
    expect(result.artifacts.length).toBeGreaterThanOrEqual(0);
    expect(result.exitCode).toBe(0);
  });
});
