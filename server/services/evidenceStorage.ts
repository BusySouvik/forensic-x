import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Readable } from "node:stream";
import type { DeletionPolicy, StorageClass, StorageObjectPublic, StorageStatus } from "../../shared/types";
import { env } from "../config/env";
import { getDb } from "../db";
import { evidenceRecords, storageObjects, type StorageObjectRow } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { generateObjectKey } from "../storage/objectKey";
import { getMinioObjectStore } from "../storage/minio";
import type { ObjectStore, StoredObjectMetadata } from "../storage/objectStore";

export type StorageReference = {
  id: string;
  investigationId: string | null;
  evidenceId: string | null;
  storageClass: StorageClass;
  bucket: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  fileSizeBytes: number;
  sha256: string;
  status: StorageStatus;
  deletionPolicy: DeletionPolicy;
  createdAt: Date;
};

export interface StorageReferenceStore {
  insert(record: Omit<StorageReference, "createdAt"> & { createdAt?: Date }): Promise<StorageReference>;
  getById(id: string): Promise<StorageReference | null>;
  markDeleted(id: string): Promise<void>;
}

export function bucketForStorageClass(storageClass: StorageClass): string {
  switch (storageClass) {
    case "FORENSIC_IMAGE":
      return env.MINIO_BUCKET_IMAGES;
    case "WORKING_COPY":
      return env.MINIO_BUCKET_WORKING;
    case "RECOVERED_EVIDENCE":
      return env.MINIO_BUCKET_EVIDENCE;
    case "CERTIFICATE":
      return env.MINIO_BUCKET_CERTIFICATES;
    default: {
      const exhaustive: never = storageClass;
      throw new HttpError(400, `Unsupported storage class: ${exhaustive}`);
    }
  }
}

export function deletionPolicyFor(storageClass: StorageClass): DeletionPolicy {
  return storageClass === "FORENSIC_IMAGE" ? "MASTER_IMAGE_PROTECTED" : "DELETABLE";
}

export function toPublicStorageObject(record: StorageReference): StorageObjectPublic {
  return {
    id: record.id,
    investigationId: record.investigationId,
    evidenceId: record.evidenceId,
    storageClass: record.storageClass,
    bucket: record.bucket,
    objectKey: record.objectKey,
    originalFilename: record.originalFilename,
    contentType: record.contentType,
    fileSizeBytes: record.fileSizeBytes,
    sha256: record.sha256,
    status: record.status,
    deletionPolicy: record.deletionPolicy,
    createdAt: record.createdAt.toISOString(),
  };
}

function fromRow(row: StorageObjectRow): StorageReference {
  return {
    id: row.id,
    investigationId: row.investigationId,
    evidenceId: row.evidenceId,
    storageClass: row.storageClass,
    bucket: row.bucket,
    objectKey: row.objectKey,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    fileSizeBytes: row.fileSizeBytes,
    sha256: row.sha256,
    status: row.status,
    deletionPolicy: row.deletionPolicy,
    createdAt: row.createdAt,
  };
}

export function createDrizzleStorageReferenceStore(): StorageReferenceStore {
  return {
    async insert(record) {
      const db = getDb();
      const [created] = await db
        .insert(storageObjects)
        .values({
          id: record.id,
          investigationId: record.investigationId,
          evidenceId: record.evidenceId,
          storageClass: record.storageClass,
          bucket: record.bucket,
          objectKey: record.objectKey,
          originalFilename: record.originalFilename,
          contentType: record.contentType,
          fileSizeBytes: record.fileSizeBytes,
          sha256: record.sha256,
          status: record.status,
          deletionPolicy: record.deletionPolicy,
        })
        .returning();
      if (!created) {
        throw new HttpError(500, "Failed to record storage object");
      }
      return fromRow(created);
    },
    async getById(id) {
      const db = getDb();
      const [row] = await db.select().from(storageObjects).where(eq(storageObjects.id, id)).limit(1);
      return row ? fromRow(row) : null;
    },
    async markDeleted(id) {
      const db = getDb();
      await db.update(storageObjects).set({ status: "DELETED" }).where(eq(storageObjects.id, id));
    },
  };
}

export class MemoryStorageReferenceStore implements StorageReferenceStore {
  readonly records = new Map<string, StorageReference>();

  async insert(record: Omit<StorageReference, "createdAt"> & { createdAt?: Date }) {
    const saved: StorageReference = {
      ...record,
      createdAt: record.createdAt ?? new Date(),
    };
    this.records.set(saved.id, saved);
    return saved;
  }

  async getById(id: string) {
    return this.records.get(id) ?? null;
  }

  async markDeleted(id: string) {
    const existing = this.records.get(id);
    if (existing) {
      this.records.set(id, { ...existing, status: "DELETED" });
    }
  }
}

export class EvidenceStorageService {
  constructor(
    private readonly store: ObjectStore,
    private readonly references: StorageReferenceStore,
  ) {}

  async ping() {
    await this.store.ping();
  }

  async ensureBuckets() {
    return this.store.ensureBuckets([
      env.MINIO_BUCKET_IMAGES,
      env.MINIO_BUCKET_WORKING,
      env.MINIO_BUCKET_EVIDENCE,
      env.MINIO_BUCKET_CERTIFICATES,
    ]);
  }

  async upload(input: {
    storageClass: StorageClass;
    filename: string;
    body: Buffer;
    contentType?: string;
    investigationId?: string | null;
    evidenceId?: string | null;
  }): Promise<StorageReference> {
    const contentType = input.contentType ?? "application/octet-stream";
    const bucket = bucketForStorageClass(input.storageClass);
    const { objectId, objectKey } = generateObjectKey({
      investigationId: input.investigationId,
      storageClass: input.storageClass,
      filename: input.filename,
    });
    const sha256 = createHash("sha256").update(input.body).digest("hex");

    await this.store.upload({
      bucket,
      objectKey,
      body: input.body,
      contentType,
    });

    return this.references.insert({
      id: objectId,
      investigationId: input.investigationId ?? null,
      evidenceId: input.evidenceId ?? null,
      storageClass: input.storageClass,
      bucket,
      objectKey,
      originalFilename: input.filename,
      contentType,
      fileSizeBytes: input.body.byteLength,
      sha256,
      status: "AVAILABLE",
      deletionPolicy: deletionPolicyFor(input.storageClass),
    });
  }

  async exists(id: string): Promise<boolean> {
    const record = await this.requireReference(id);
    if (record.status === "DELETED") {
      return false;
    }
    return this.store.exists(record.bucket, record.objectKey);
  }

  async getMetadata(id: string): Promise<{ record: StorageReference; object: StoredObjectMetadata }> {
    const record = await this.requireAvailable(id);
    const object = await this.store.getMetadata(record.bucket, record.objectKey);
    return { record, object };
  }

  async download(id: string): Promise<{ record: StorageReference; stream: Readable }> {
    const record = await this.requireAvailable(id);
    const stream = await this.store.download(record.bucket, record.objectKey);
    return { record, stream };
  }

  async delete(id: string, options?: { overrideMasterImageProtection?: boolean }) {
    const record = await this.requireReference(id);
    if (record.status === "DELETED") {
      throw new HttpError(409, "Stored object already deleted");
    }
    if (record.deletionPolicy === "MASTER_IMAGE_PROTECTED" && !options?.overrideMasterImageProtection) {
      throw new HttpError(
        403,
        "Master forensic images are protected from deletion until an authorized acquisition workflow override is implemented",
      );
    }
    await this.store.delete(record.bucket, record.objectKey);
    await this.references.markDeleted(id);
  }

  private async requireReference(id: string) {
    const record = await this.references.getById(id);
    if (!record) {
      throw new HttpError(404, "Storage reference not found");
    }
    return record;
  }

  private async requireAvailable(id: string) {
    const record = await this.requireReference(id);
    if (record.status === "DELETED") {
      throw new HttpError(404, "Stored object has been deleted");
    }
    return record;
  }
}

let defaultService: EvidenceStorageService | null = null;

export function getEvidenceStorageService() {
  if (!defaultService) {
    defaultService = new EvidenceStorageService(getMinioObjectStore(), createDrizzleStorageReferenceStore());
  }
  return defaultService;
}

export function createEvidenceStorageService(store: ObjectStore, references: StorageReferenceStore) {
  return new EvidenceStorageService(store, references);
}

export async function getMasterEvidenceById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, id)).limit(1);
  return row ?? null;
}
