import { createHash } from "node:crypto";
import { readFile, stat, writeFile as writeFileFs } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../../middleware/httpError";
import {
  createCommandRunner,
  createStagingDirectory,
  resolveRecoveryExecutable,
  cleanupStage,
  hashFile,
} from "./commandRunner";
import type { RecoveryAdapterLike, RecoveryExecutionContext } from "./recoveryWorker";

export type TskRecoveryAdapterOptions = {
  executable?: string;
  stagingRoot?: string;
  timeoutMs?: number;
};

export class TskRecoveryAdapter implements RecoveryAdapterLike {
  constructor(private readonly options: TskRecoveryAdapterOptions = {}) {}

  async validateEngine() {
    try {
      resolveRecoveryExecutable(this.options.executable ?? process.env.FORENSIC_TSK_EXECUTABLE, "FORENSIC_TSK_EXECUTABLE", "fls", "TSK");
      return true;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, `TSK recovery engine is not available: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async recover(sourceIdentifier: string, context: RecoveryExecutionContext = {}) {
    let executable: string;
    try {
      executable = resolveRecoveryExecutable(
        this.options.executable ?? process.env.FORENSIC_TSK_EXECUTABLE,
        "FORENSIC_TSK_EXECUTABLE",
        "fls",
        "TSK",
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, `TSK recovery engine is not available: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    const stageDir = await createStagingDirectory(path.join(this.options.stagingRoot ?? process.cwd(), "recovery-tsk-"));

    const safeSource = sanitizeSourcePath(sourceIdentifier);
    const runner = createCommandRunner();

    // Determine input format (ewf if extension suggests E01) and probe partitions/filesystem
    const lower = safeSource.toLowerCase();
    const probablyEwf = /\.e0?1$|\.ewf$/i.test(lower);

    // Resolve helper executables
    let mmlsExec: string | null = null;
    let fsstatExec: string | null = null;
    try {
      mmlsExec = resolveRecoveryExecutable(undefined, "FORENSIC_TSK_EXECUTABLE", "mmls", "TSK");
    } catch {
      mmlsExec = null;
    }
    try {
      fsstatExec = resolveRecoveryExecutable(undefined, "FORENSIC_TSK_EXECUTABLE", "fsstat", "TSK");
    } catch {
      fsstatExec = null;
    }

    // Default values
    let inputType: string | undefined = probablyEwf ? "ewf" : undefined;
    let partitionStartSector: number | undefined;
    let detectedFsType: string | undefined;

    try {
      if (mmlsExec) {
        const mmlsArgs = inputType ? ["-i", inputType, safeSource] : [safeSource];
        const mres = await runner.run({ executable: mmlsExec, args: mmlsArgs, cwd: stageDir, timeoutMs: 30 * 1000 });
        if (mres.exitCode !== 0) {
          throw new HttpError(503, `mmls failed: ${mres.stderr || mres.stdout || "unknown"}`);
        }
        // parse for NTFS or primary partition entries and capture the start sector
        const lines = (mres.stdout || "").split(/\r?\n/);
        for (const line of lines) {
          if (/ntfs/i.test(line) || /fat/i.test(line) || /ext/i.test(line)) {
            const match = line.match(/\s*\d+:\s+\S+\s+(\d+)\s+/);
            if (match && match[1]) {
              partitionStartSector = Number(match[1]);
              break;
            }
          }
        }
      }

      // If fsstat available, try to detect filesystem type (use offset if found)
      if (fsstatExec) {
        const fsArgs = [] as string[];
        if (inputType) fsArgs.push("-i", inputType);
        if (partitionStartSector !== undefined) fsArgs.push("-o", String(partitionStartSector));
        fsArgs.push(safeSource);
        const fres = await runner.run({ executable: fsstatExec, args: fsArgs, cwd: stageDir, timeoutMs: 30 * 1000 });
        if (fres.exitCode === 0 && fres.stdout) {
          const m = fres.stdout.match(/File System Type:\s*(\S+)/i);
          if (m && m[1]) {
            detectedFsType = m[1].toLowerCase();
          }
        }
      }

    } catch (err) {
      // If partition/filesystem probing fails deterministically, fail the job
      await cleanupStage(stageDir);
      if (err instanceof HttpError) throw err;
      throw new HttpError(503, `Failed to probe image layout: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      // Build fls args honoring includeDeleted and detected filesystem/offset
      const includeDeleted = context.config?.includeDeleted === true;
      const fsType = detectedFsType ?? "raw";
      const flsArgs: string[] = [];
      if (inputType) {
        flsArgs.push("-i", inputType);
      }
      if (partitionStartSector !== undefined) {
        flsArgs.push("-o", String(partitionStartSector));
      }
      flsArgs.push("-r");
      flsArgs.push("-f", fsType);
      if (includeDeleted) flsArgs.push("-d");
      flsArgs.push(safeSource);

      const flsResult = await runner.run({ executable, args: flsArgs, cwd: stageDir, timeoutMs: this.options.timeoutMs ?? 60 * 60 * 1000 });

      if (flsResult.exitCode !== 0) {
        throw new HttpError(503, `TSK fls enumeration failed: ${flsResult.stderr || flsResult.stdout || "unknown error"}`);
      }

      // Save the listing for provenance
      const listingPath = path.join(stageDir, "fls-listing.txt");
      await writeFileFs(listingPath, flsResult.stdout);

      const artifacts: Array<{ path: string; size: number; sha256: string; contentType: string; kind: "FILE" | "DIRECTORY" }> = [];
      artifacts.push({ path: listingPath, size: (await stat(listingPath)).size, sha256: await hashFile(listingPath), contentType: "text/plain", kind: "FILE" });

      // If `icat` is available, extract a small set of files (bounded by config.maxFiles)
      let icatPath: string | null = null;
      try {
        icatPath = resolveRecoveryExecutable(undefined, "FORENSIC_TSK_EXECUTABLE", "icat", "TSK");
      } catch {
        icatPath = null;
      }

      if (icatPath) {
        // Parse listing for inode:file pairs. Limit to a modest number.
        const maxFiles = typeof context.config?.maxFiles === "number" ? Math.min(1000, Number(context.config!.maxFiles)) : 100;
        const lines = flsResult.stdout.split(/\r?\n/).slice(0, 10000);
        const inodeEntries: Array<{ inode: string; name: string }> = [];
        for (const line of lines) {
          const m = line.match(/^(?:\S+\s+)?(\d+):\s*(.+)$/);
          if (m) {
            inodeEntries.push({ inode: m[1], name: m[2].trim().replace(/[^a-zA-Z0-9.()_ -]/g, "_") });
            if (inodeEntries.length >= maxFiles) break;
          }
        }

        for (const entry of inodeEntries) {
          try {
            const outPath = path.join(stageDir, `${entry.inode}-${entry.name}`);
            const icatArgs: string[] = [];
            if (inputType) icatArgs.push("-i", inputType);
            if (partitionStartSector !== undefined) icatArgs.push("-o", String(partitionStartSector));
            icatArgs.push("-f", detectedFsType ?? "raw");
            icatArgs.push(safeSource, entry.inode);
            const icatResult = await runner.run({ executable: icatPath, args: icatArgs, cwd: stageDir, timeoutMs: 30 * 1000 });
            if (icatResult.exitCode !== 0) {
              // skip failed extractions but continue
              continue;
            }
            // write the stdout to the file
            await writeFileFs(outPath, icatResult.stdout);
            const stats = await stat(outPath);
            artifacts.push({ path: outPath, size: stats.size, sha256: await hashFile(outPath), contentType: "application/octet-stream", kind: "FILE" });
          } catch {
            // best-effort extraction
            continue;
          }
        }
      }

      const finishedAt = flsResult.finishedAt ?? new Date();
      return {
        engine: "TSK",
        executable: executable,
        args: flsArgs,
        outputLocation: stageDir,
        artifacts,
        stdout: flsResult.stdout,
        stderr: flsResult.stderr,
        exitCode: flsResult.exitCode,
        startedAt: flsResult.startedAt ?? new Date(),
        finishedAt,
        stagedInput: sourceIdentifier,
        // include detected image layout for provenance
        // @ts-ignore - additional provenance allowed
        provenance: { inputType: inputType ?? "raw", partitionStartSector: partitionStartSector ?? null, detectedFsType: detectedFsType ?? null },
      };
    } catch (error) {
      await cleanupStage(stageDir);
      if (error instanceof HttpError) throw error;
      if (error instanceof Error && /not available|ENOENT|not found/i.test(error.message)) {
        throw new HttpError(503, `TSK recovery engine is not available: ${error.message}`);
      }
      throw new HttpError(503, `TSK recovery failed: ${error instanceof Error ? error.message : "unknown error"}`);
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

function createTskArgs(options: { sourcePath: string; outputDir: string; config?: Record<string, unknown> }) {
  const safeSource = options.sourcePath;
  const outputDir = path.normalize(options.outputDir);
  const args = ["-r", "-f", "raw", safeSource];
  const includeDeleted = options.config?.includeDeleted === true;
  const maxFiles = typeof options.config?.maxFiles === "number" ? Number(options.config.maxFiles) : undefined;

  if (includeDeleted) {
    args.push("-d");
  }
  if (typeof maxFiles === "number" && Number.isFinite(maxFiles) && maxFiles > 0) {
    args.push("-m", String(Math.min(maxFiles, 10000)));
  }
  args.push("-o", outputDir);
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
