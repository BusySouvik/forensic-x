import fs from "node:fs/promises";
import path from "node:path";

export type TestSanitizationResult = {
  status: "SUCCEEDED" | "FAILED" | "UNSUPPORTED";
  bytesAffected?: number;
  executionDetails?: Record<string, unknown>;
};

export type TestSanitizationVerificationResult = {
  status: "VERIFIED" | "FAILED";
  details: Record<string, unknown>;
};

export class TestSanitizationAdapter {
  private readonly baseDirResolved: string;
  private readonly permittedRoot = path.resolve(process.cwd(), ".forensic-x", "test-sanitization");

  constructor(private readonly baseDir = path.resolve(process.cwd(), ".forensic-x", "test-sanitization")) {
    if (process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION !== "1") {
      throw new Error("TestSanitizationAdapter is disabled. Set FORENSIC_X_ALLOW_TEST_SANITIZATION=1 to enable.");
    }
    this.baseDirResolved = path.resolve(this.baseDir);
    const relativeToPermittedRoot = path.relative(this.permittedRoot, this.baseDirResolved);
    if (relativeToPermittedRoot.startsWith("..") || path.isAbsolute(relativeToPermittedRoot)) {
      throw new Error("TestSanitizationAdapter must remain within .forensic-x/test-sanitization");
    }
  }

  private async ensureAllowed(targetPath: string) {
    if (!path.isAbsolute(targetPath)) throw new Error("Path must be absolute");

    const resolved = path.resolve(targetPath);

    const baseRoot = path.parse(this.baseDirResolved).root;
    const targetRoot = path.parse(resolved).root;
    if (baseRoot !== targetRoot) throw new Error("Target must reside on same root as test directory");

    const rel = path.relative(this.baseDirResolved, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Unsafe path: outside test-sanitization area");

    if (resolved === path.parse(resolved).root) throw new Error("Root paths are not allowed");

    if (resolved.startsWith("\\\\")) throw new Error("UNC/network paths are not allowed");

    if (/^\\\\\\.\\\\PhysicalDrive/i.test(targetPath) || /^\\\\\\.\\\\PhysicalDrive/i.test(resolved)) {
      throw new Error("Physical device paths not allowed in test adapter");
    }

    if (resolved.startsWith("/dev/")) throw new Error("Device paths under /dev are not allowed");

    if (targetPath.startsWith("\\\\")) throw new Error("UNC/network paths are not allowed");

    const [realPermittedRoot, realParent] = await Promise.all([
      fs.realpath(this.permittedRoot),
      fs.realpath(path.dirname(resolved)),
    ]);
    const realRelative = path.relative(realPermittedRoot, realParent);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      throw new Error("Unsafe path: resolved outside test-sanitization area");
    }
    return resolved;
  }

  async prepareFixture(name: string, content: Buffer) {
    const dir = path.join(this.baseDir, name);
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, "target.bin");
    await fs.writeFile(p, content);
    return p;
  }

  async sanitize(targetPath: string, method: string): Promise<TestSanitizationResult> {
    const resolved = await this.ensureAllowed(targetPath);
    // method handling
    if (method === "TEST_TRUNCATE") {
      try {
        // Overwrite with zeros then truncate
        const stats = await fs.lstat(resolved);
        if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("Target must be a regular fixture file");
        const size = Number(stats.size ?? 0);
        const zeroBuf = Buffer.alloc(Math.min(1024 * 16, size), 0);
        const handle = await fs.open(resolved, "r+");
        try {
          let written = 0;
          while (written < size) {
            await handle.write(zeroBuf, 0, zeroBuf.length, written);
            written += zeroBuf.length;
          }
          await handle.truncate(0);
        } finally {
          await handle.close();
        }
        await fs.unlink(resolved);
        return { status: "SUCCEEDED", bytesAffected: size, executionDetails: { method: "TEST_TRUNCATE", before: { size }, action: "overwritten-and-removed" } };
      } catch (err) {
        return { status: "FAILED", executionDetails: { error: String(err) } };
      }
    }
    return { status: "UNSUPPORTED" };
  }

  async verify(targetPath: string, method: string, executionResult: TestSanitizationResult): Promise<TestSanitizationVerificationResult> {
    const resolved = await this.ensureAllowed(targetPath);
    const verifiedAt = new Date().toISOString();
    const before = executionResult.executionDetails?.before ?? null;
    if (method !== "TEST_TRUNCATE") {
      return {
        status: "FAILED",
        details: { status: "FAILED", method, targetReference: resolved, verificationTimestamp: verifiedAt, expectedState: "removed", actualState: "not-verified", before, failureReason: "Unsupported sanitization method" },
      };
    }
    try {
      const stats = await fs.lstat(resolved);
      return {
        status: "FAILED",
        details: { status: "FAILED", method, targetReference: resolved, verificationTimestamp: verifiedAt, expectedState: "removed", actualState: stats.isSymbolicLink() ? "symlink-present" : "present", before, after: { size: stats.size, kind: stats.isFile() ? "file" : "other" }, failureReason: "Target still exists after TEST_TRUNCATE" },
      };
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        return {
          status: "VERIFIED",
          details: { status: "VERIFIED", method, targetReference: resolved, verificationTimestamp: verifiedAt, expectedState: "removed", actualState: "missing", before, after: { exists: false }, execution: executionResult.executionDetails ?? {} },
        };
      }
      return { status: "FAILED", details: { status: "FAILED", method, targetReference: resolved, verificationTimestamp: verifiedAt, expectedState: "removed", actualState: "unknown", before, failureReason: String(err) } };
    }
  }
}
