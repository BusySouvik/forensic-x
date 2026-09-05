import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../../middleware/httpError";
import { getDevice } from "../../services/devices";
import { type AcquisitionAdapterLike } from "../../services/acquisitions";
import {
  createSafeCommandArgs,
  createStagingDirectory,
  createCommandRunner,
  findOutputImageFile,
  hashFile,
  resolveEwfExecutable,
  cleanupStage,
} from "./commandRunner";
import { createWindowsDeviceInspector, validateDeviceIdentityRecord, validateLiveDeviceIdentity } from "./deviceAccess";

export type EwfAcquisitionAdapterOptions = {
  executable?: string;
  timeoutMs?: number;
  stagingRoot?: string;
  onProgress?: (event: { jobId?: string; status: string; bytesAcquired?: number; totalBytes?: number; percent?: number }) => void;
};

export class EwfAcquisitionAdapter implements AcquisitionAdapterLike {
  constructor(private readonly options: EwfAcquisitionAdapterOptions = {}) {}

  async acquire(sourceIdentifier: string): Promise<{
    sourceType: "DEVICE";
    sourceIdentifier: string;
    sourcePath: string;
    sha256: string;
    size: number;
    bytes: Buffer;
    contentType: string;
    metadata?: Record<string, string | number | boolean | null>;
  }> {
    const deviceId = sourceIdentifier;
    const device = await getDevice(deviceId);
    const validatedDb = validateDeviceIdentityRecord({
      id: device.id,
      deviceIdentifier: device.deviceIdentifier,
      deviceType: device.deviceType,
      connectionType: device.connectionType,
      manufacturer: device.manufacturer,
      model: device.model,
      serialNumber: device.serialNumber,
      capacity: device.capacity,
    });

    const inspector = createWindowsDeviceInspector();
    const live = await inspector.inspect(validatedDb.deviceIdentifier);
    const resolvedSource = validateLiveDeviceIdentity(
      {
        id: device.id,
        deviceIdentifier: device.deviceIdentifier,
        deviceType: device.deviceType,
        connectionType: device.connectionType,
        manufacturer: device.manufacturer,
        model: device.model,
        serialNumber: device.serialNumber,
        capacity: device.capacity,
      },
      live,
    );

    const executable = resolveEwfExecutable(this.options.executable ?? process.env.FORENSIC_ACQUISITION_EXECUTABLE);
    const stageDir = await createStagingDirectory(`${deviceId}-`);
    const outputPrefix = path.join(stageDir, "master");

    const args = createSafeCommandArgs({
      sourcePath: resolvedSource.physicalDrive,
      outputPrefix,
      imageFormat: "E01",
      caseName: "forensic-x",
      evidenceName: device.id,
    });

    const runner = createCommandRunner();
    const result = await runner.run({
      executable,
      args,
      cwd: stageDir,
      timeoutMs: this.options.timeoutMs ?? 60 * 60 * 1000,
    });

    if (result.exitCode !== 0) {
      await cleanupStage(stageDir);
      throw new HttpError(500, `ewfacquire failed: ${result.stderr || result.stdout || "unknown error"}`);
    }

    const imagePath = await findOutputImageFile(outputPrefix);
    const hash = await hashFile(imagePath);
    const fileStats = await stat(imagePath);
    const bytes = await readFile(imagePath);

    await cleanupStage(stageDir);

    return {
      sourceType: "DEVICE",
      sourceIdentifier: device.id,
      sourcePath: resolvedSource.physicalDrive,
      sha256: hash,
      size: fileStats.size,
      bytes,
      contentType: "application/x-ewf",
      metadata: {
        manufacturer: device.manufacturer ?? null,
        model: device.model ?? null,
        serialNumber: device.serialNumber ?? null,
        capacity: device.capacity ?? null,
        deviceIdentifier: device.deviceIdentifier,
        imageFormat: "E01",
        deviceType: device.deviceType,
        connectionType: device.connectionType,
        acquiredAt: new Date().toISOString(),
      },
    };
  }
}
