import type { NormalizedDevice } from "./deviceIdentity";

export type DeviceEnumerationRequest = {
  investigationId?: string;
  deviceIds?: string[];
};

export interface DeviceEnumerator {
  enumerate(request?: DeviceEnumerationRequest): Promise<NormalizedDevice[]>;
}

export type SourceType = "TEST_FILE" | "DEVICE" | "IMAGE_FILE";

export type AcquiredImage = {
  sourceType: SourceType;
  sourceIdentifier: string;
  sourcePath: string;
  bytes: Buffer;
  sha256: string;
  size: number;
  contentType: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export interface AcquisitionAdapter {
  acquire(sourceIdentifier: string): Promise<AcquiredImage>;
}
