import { createHash } from "node:crypto";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../../middleware/httpError";
import type { AcquisitionAdapter, AcquiredImage } from "../agentTypes";

export type TestFileAcquisitionOptions = {
  allowedRoot: string;
};

export class TestFileAcquisitionAdapter implements AcquisitionAdapter {
  constructor(private readonly options: TestFileAcquisitionOptions) {}

  async acquire(sourceIdentifier: string): Promise<AcquiredImage> {
    const normalizedSource = path.normalize(sourceIdentifier);
    const absolute = path.resolve(normalizedSource);
    const allowedRoot = path.resolve(this.options.allowedRoot);

    if (!absolute.startsWith(allowedRoot)) {
      throw new HttpError(400, "Source path is outside the allowed test acquisition area");
    }

    const info = await stat(absolute);
    if (!info.isFile()) {
      throw new HttpError(400, "Acquisition source must be a regular file");
    }

    const file = await readFile(absolute);
    const sha256 = createHash("sha256").update(file).digest("hex");

    return {
      sourceType: "TEST_FILE",
      sourceIdentifier: absolute,
      sourcePath: absolute,
      bytes: file,
      sha256,
      size: file.byteLength,
      contentType: "application/octet-stream",
      metadata: {
        sourceRoot: allowedRoot,
        fileName: path.basename(absolute),
      },
    };
  }
}
