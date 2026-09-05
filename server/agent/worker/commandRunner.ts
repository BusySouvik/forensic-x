import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export class SafeArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeArgumentError";
  }
}

export type CommandRunnerInput = {
  executable: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
};

export type CommandRunnerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  startedAt: Date;
  finishedAt: Date;
};

export type FixedCommandRunner = {
  run(input: CommandRunnerInput): Promise<CommandRunnerResult>;
};

const WINDOWS_DEVICE_PATH_RE = /^\\\\\.\\PhysicalDrive\d+$/i;

export function resolveEwfExecutable(configuredExecutable?: string): string {
  const candidate = configuredExecutable || process.env.FORENSIC_ACQUISITION_EXECUTABLE || "ewfacquire.exe";
  if (!candidate || !candidate.trim()) {
    throw new SafeArgumentError("No forensic acquisition executable is configured");
  }
  const trimmed = candidate.trim();
  const resolved = trimmed;

  try {
    accessSync(resolved, constants.X_OK);
    return resolved;
  } catch {
    throw new SafeArgumentError(
      `Forensic acquisition engine is not available at ${resolved}. Install libewf/ewfacquire or configure FORENSIC_ACQUISITION_EXECUTABLE.`,
    );
  }
}

export function resolveRecoveryExecutable(
  configuredExecutable: string | undefined,
  envName: string,
  fallback: string,
  engineName: string,
): string {
  const candidate = configuredExecutable || process.env[envName] || fallback;
  if (!candidate || !candidate.trim()) {
    throw new SafeArgumentError(`No ${engineName} recovery executable is configured`);
  }

  const resolved = candidate.trim();
  if (/[;|&`]/.test(resolved)) {
    throw new SafeArgumentError(`Unsafe ${engineName} recovery executable path`);
  }

  if (resolved.toLowerCase() === "wsl" || resolved.toLowerCase() === "wsl.exe") {
    return resolved;
  }

  try {
    accessSync(resolved, constants.X_OK);
    return resolved;
  } catch {
    throw new SafeArgumentError(
      `${engineName} recovery engine is not available at ${resolved}. Install the ${engineName} tooling or configure ${envName}.`,
    );
  }
}

export function resolveForemostInvocation(configuredExecutable?: string): { executable: string; args: string[] } {
  const raw = configuredExecutable ?? process.env.FORENSIC_FOREMOST_EXECUTABLE;
  if (raw && raw.trim()) {
    const value = raw.trim();
    if (/^(?:[A-Za-z]:\\|\/|\\\\)/.test(value)) {
      throw new SafeArgumentError("Arbitrary Foremost executable paths are not allowed; use the fixed WSL or PATH execution model.");
    }
    if (value.toLowerCase() === "wsl" || value.toLowerCase() === "wsl.exe") {
      return { executable: value, args: ["--distribution", "Ubuntu", "--exec", "foremost"] };
    }
    return { executable: value, args: [] };
  }

  const wslExecutable = process.env.WSL_DISTRO_NAME ? "wsl.exe" : "wsl.exe";
  try {
    accessSync(wslExecutable, constants.X_OK);
    return { executable: wslExecutable, args: ["--distribution", "Ubuntu", "--exec", "foremost"] };
  } catch {
    try {
      accessSync("foremost", constants.X_OK);
      return { executable: "foremost", args: [] };
    } catch {
      throw new SafeArgumentError(
        "Foremost recovery engine is not available. Install Foremost in WSL Ubuntu or configure FORENSIC_FOREMOST_EXECUTABLE to a safe fixed executable name.",
      );
    }
  }
}

export function createSafeCommandArgs(options: {
  sourcePath: string;
  outputPrefix: string;
  imageFormat?: "E01" | "RAW";
  caseName?: string;
  evidenceName?: string;
  executable?: string;
}): string[] {
  if (options.executable) {
    throw new SafeArgumentError("User-provided executable paths are not allowed for physical acquisition");
  }
  if (!options.sourcePath || !options.outputPrefix) {
    throw new SafeArgumentError("Source path and output prefix are required");
  }

  const normalizedSource = options.sourcePath.trim();
  const normalizedOutput = path.normalize(options.outputPrefix).trim();

  if (!WINDOWS_DEVICE_PATH_RE.test(normalizedSource)) {
    throw new SafeArgumentError("Only an internal resolved Windows physical drive path is allowed for acquisition");
  }
  if (normalizedOutput.includes(";") || normalizedOutput.includes("&&") || normalizedOutput.includes("|") || normalizedOutput.includes("`")) {
    throw new SafeArgumentError("Unsafe output path for physical acquisition");
  }

  const format = (options.imageFormat ?? "E01").toUpperCase();
  if (format !== "E01" && format !== "RAW") {
    throw new SafeArgumentError("Unsupported forensic image format");
  }

  const safeArgs = [
    "-f",
    format === "E01" ? "ewf" : "raw",
    "-u",
    "all",
    "-d",
    normalizedSource,
    "-o",
    normalizedOutput,
  ];

  if (options.caseName) {
    safeArgs.push("-c", options.caseName.trim());
  }
  if (options.evidenceName) {
    safeArgs.push("-e", options.evidenceName.trim());
  }

  return safeArgs;
}

export function createCommandRunner(): FixedCommandRunner {
  return {
    async run(input) {
      const { spawn } = await import("node:child_process");
      const startedAt = new Date();
      let stdout = "";
      let stderr = "";

      const child = spawn(input.executable, input.args, {
        cwd: input.cwd,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          FORENSIC_X_ACQUISITION: "1",
        },
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = input.timeoutMs ?? 60 * 60 * 1000;
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new SafeArgumentError(`Acquisition command timed out after ${timeout} ms`));
        }, timeout);

        child.stdout?.on("data", (chunk) => {
          stdout += String(chunk);
        });

        child.stderr?.on("data", (chunk) => {
          stderr += String(chunk);
        });

        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });

        child.on("close", (exitCode) => {
          clearTimeout(timer);
          if (exitCode === null) {
            reject(new SafeArgumentError("Acquisition process closed without an exit code"));
            return;
          }
          resolve();
        });
      });

      const finishedAt = new Date();
      return {
        exitCode: child.exitCode ?? 1,
        stdout,
        stderr,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        startedAt,
        finishedAt,
      };
    },
  };
}

export async function findOutputImageFile(outputPrefix: string): Promise<string> {
  const dir = path.dirname(outputPrefix);
  const base = path.basename(outputPrefix);
  const entries = await import("node:fs/promises").then((fs) => fs.readdir(dir));
  const candidate = entries.find((entry) => entry.startsWith(base) || entry.startsWith(`${base}.`));
  if (!candidate) {
    throw new SafeArgumentError(`No acquisition image was produced at ${outputPrefix}`);
  }
  const imagePath = path.join(dir, candidate);
  await stat(imagePath);
  return imagePath;
}

export async function createStagingDirectory(prefix = "forensic-x-acq-") {
  if (path.isAbsolute(prefix)) {
    const parent = path.dirname(prefix);
    try {
      await mkdir(parent, { recursive: true });
    } catch {
      // ignore
    }
    return mkdtemp(prefix);
  }
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function cleanupStage(dir: string) {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup only
  }
}

export async function hashFile(filePath: string) {
  const { createHash } = await import("node:crypto");
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}
