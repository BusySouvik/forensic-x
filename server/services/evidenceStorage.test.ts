import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HttpError } from "../middleware/httpError";
import { MemoryObjectStore } from "../storage/memoryObjectStore";
import { generateObjectKey, sanitizeFilename } from "../storage/objectKey";
import {
  createEvidenceStorageService,
  deletionPolicyFor,
  MemoryStorageReferenceStore,
} from "./evidenceStorage";

const SAMPLE = Buffer.from("FORENSIC-X MinIO storage probe.\nHarmless test object. Not a forensic image.\n");

function createService() {
  const store = new MemoryObjectStore();
  const references = new MemoryStorageReferenceStore();
  const service = createEvidenceStorageService(store, references);
  return { store, references, service };
}

describe("object key generation", () => {
  it("builds a backend-controlled key and rejects path traversal", () => {
    const { objectId, objectKey } = generateObjectKey({
      investigationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      storageClass: "WORKING_COPY",
      filename: "storage-probe.txt",
    });
    expect(objectKey).toBe(
      `investigations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/working_copy/${objectId}/storage-probe.txt`,
    );
    expect(() => sanitizeFilename("../secret.bin")).toThrow(HttpError);
    expect(() => sanitizeFilename("a/b.txt")).toThrow(HttpError);
  });
});

describe("EvidenceStorageService", () => {
  it("uploads a harmless sample, records metadata, and confirms existence", async () => {
    const { service, references } = createService();
    await service.ensureBuckets();

    const record = await service.upload({
      storageClass: "WORKING_COPY",
      filename: "storage-probe.txt",
      body: SAMPLE,
      contentType: "text/plain",
      evidenceId: "STORAGE-PROBE",
    });

    expect(record.bucket).toBe("working-copies");
    expect(record.fileSizeBytes).toBe(SAMPLE.byteLength);
    expect(record.sha256).toBe(createHash("sha256").update(SAMPLE).digest("hex"));
    expect(await service.exists(record.id)).toBe(true);

    const metadata = await service.getMetadata(record.id);
    expect(metadata.object.size).toBe(SAMPLE.byteLength);
    expect(metadata.record.objectKey).toContain("/working_copy/");
    expect(references.records.get(record.id)?.status).toBe("AVAILABLE");
  });

  it("stores a database storage reference without keeping the binary payload", async () => {
    const { service, references } = createService();
    await service.ensureBuckets();
    const record = await service.upload({
      storageClass: "CERTIFICATE",
      filename: "probe-cert.txt",
      body: SAMPLE,
      contentType: "text/plain",
      evidenceId: "CERT-PROBE",
    });
    const stored = references.records.get(record.id);
    expect(stored).toMatchObject({
      id: record.id,
      bucket: "certificates",
      objectKey: record.objectKey,
      fileSizeBytes: SAMPLE.byteLength,
      sha256: record.sha256,
      status: "AVAILABLE",
    });
    expect(stored).not.toHaveProperty("body");
  });

  it("marks master forensic images as protected from deletion", async () => {
    const { service } = createService();
    await service.ensureBuckets();
    expect(deletionPolicyFor("FORENSIC_IMAGE")).toBe("MASTER_IMAGE_PROTECTED");

    const record = await service.upload({
      storageClass: "FORENSIC_IMAGE",
      filename: "placeholder-image.txt",
      body: SAMPLE,
      contentType: "text/plain",
      evidenceId: "IMG-PLACEHOLDER",
    });
    expect(record.deletionPolicy).toBe("MASTER_IMAGE_PROTECTED");
    await expect(service.delete(record.id)).rejects.toMatchObject({ statusCode: 403 });
    expect(await service.exists(record.id)).toBe(true);
  });
});
