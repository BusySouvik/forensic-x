import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../../middleware/httpError";
import { createCommandRunner, createStagingDirectory, resolveForemostInvocation, cleanupStage, hashFile } from "./commandRunner";
import type { RecoveryAdapterLike, RecoveryExecutionContext } from "./recoveryWorker";

export type ForemostRecoveryAdapterOptions = {
  executable?: string;
  stagingRoot?: string;
  timeoutMs?: number;
};

export class ForemostRecoveryAdapter implements RecoveryAdapterLike {
  constructor(private readonly options: ForemostRecoveryAdapterOptions = {}) {}

  async validateEngine() {
    try {
      resolveForemostInvocation(this.options.executable ?? process.env.FORENSIC_FOREMOST_EXECUTABLE);
      return true;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, `Foremost recovery engine is not available: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async recover(sourceIdentifier: string, context: RecoveryExecutionContext = {}) {
    const invocation = resolveForemostInvocation(this.options.executable ?? process.env.FORENSIC_FOREMOST_EXECUTABLE);
    const stageDir = await createStagingDirectory(path.join(this.options.stagingRoot ?? process.cwd(), "recovery-foremost-"));
    const safeSource = sanitizeSourcePath(sourceIdentifier);
    const runner = createCommandRunner();

    // Translate Windows staging path to WSL path when invoking via wsl.exe
    function windowsToWsl(p: string) {
      // C:\path -> /mnt/c/path
      const m = p.match(/^([a-zA-Z]):\\(.*)$/);
      if (!m) return p.replace(/\\/g, "/");
      const drive = m[1].toLowerCase();
      const rest = m[2].replace(/\\/g, "/");
      return `/mnt/${drive}/${rest}`;
    }

    try {
      const outputDir = stageDir;
      let args = createForemostArgs({ sourcePath: safeSource, outputDir, config: context.config });

      let exec = invocation.executable;
      let finalArgs: string[] = [];

      if (exec.toLowerCase().includes("wsl")) {
        // convert paths to WSL form
        const wslSource = windowsToWsl(safeSource);
        const wslOutput = windowsToWsl(outputDir);
        // invocation.args already contains something like ["--distribution","Ubuntu","--exec","foremost"]
        finalArgs = [...invocation.args, ...createForemostArgs({ sourcePath: wslSource, outputDir: wslOutput, config: context.config })];
      } else if (invocation.args && invocation.args.length) {
        finalArgs = [...invocation.args, ...args];
      } else {
        finalArgs = args;
      }

      const result = await runner.run({ executable: exec, args: finalArgs, cwd: stageDir, timeoutMs: this.options.timeoutMs ?? 60 * 60 * 1000 });

      if (result.exitCode !== 0) {
        throw new HttpError(503, `Foremost recovery engine failed: ${result.stderr || result.stdout || "unknown error"}`);
      }

      const artifacts = await collectArtifacts(stageDir);
      return {
        engine: "FOREMOST",
        executable: exec,
        args: finalArgs,
        outputLocation: stageDir,
        artifacts,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        startedAt: result.startedAt ?? new Date(),
        finishedAt: result.finishedAt ?? new Date(),
        stagedInput: sourceIdentifier,
      };
    } catch (error) {
      await cleanupStage(stageDir);
      if (error instanceof HttpError) throw error;
      if (error instanceof Error && /not available|ENOENT|not found/i.test(error.message)) {
        throw new HttpError(503, `Foremost recovery engine is not available: ${error.message}`);
      }
      throw new HttpError(503, `Foremost recovery failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

function sanitizeSourcePath(sourceIdentifier: string) {
  const input = sourceIdentifier.trim();
  if (!input || /[;|&`]/.test(input)) {
    throw new HttpError(400, "Unsafe recovery source path");
  }
  return input;
}

function createForemostArgs(options: { sourcePath: string; outputDir: string; config?: Record<string, unknown> }) {
  const outputDir = path.normalize(options.outputDir);
  const args = ["-i", options.sourcePath, "-o", outputDir];
  if (options.config?.includeDeleted === true) {
    args.push("-d");
  }
  return args;
}

async function collectArtifacts(dir: string) {
  const entries = await import("node:fs/promises").then((fs) => fs.readdir(dir, { withFileTypes: true }));
  const artifacts: Array<{ path: string; size: number; sha256: string; contentType: string; kind: "FILE" | "DIRECTORY" }> = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectArtifacts(entryPath);
      artifacts.push(...nested);
      continue;
    }

    const stats = await stat(entryPath);
    const bytes = await readFile(entryPath);
    artifacts.push({
      path: entryPath,
      size: stats.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: "application/octet-stream",
      kind: "FILE",
    });
  }

  return artifacts;
}
