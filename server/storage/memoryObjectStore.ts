import { Readable } from "node:stream";
import type { ObjectStore, StoredObjectMetadata, UploadObjectInput } from "./objectStore";
import { HttpError } from "../middleware/httpError";

type MemoryObject = {
  body: Buffer;
  contentType: string;
  lastModified: Date;
};

export class MemoryObjectStore implements ObjectStore {
  readonly buckets = new Set<string>();
  private readonly objects = new Map<string, MemoryObject>();

  private id(bucket: string, objectKey: string) {
    return `${bucket}::${objectKey}`;
  }

  async ping() {
    return;
  }

  async ensureBuckets(buckets: string[]) {
    for (const bucket of buckets) {
      this.buckets.add(bucket);
    }
    return Array.from(this.buckets);
  }

  async upload(input: UploadObjectInput): Promise<StoredObjectMetadata> {
    if (!this.buckets.has(input.bucket)) {
      throw new HttpError(400, "Unknown storage bucket");
    }
    this.objects.set(this.id(input.bucket, input.objectKey), {
      body: input.body,
      contentType: input.contentType,
      lastModified: new Date(),
    });
    return {
      bucket: input.bucket,
      objectKey: input.objectKey,
      size: input.body.byteLength,
      contentType: input.contentType,
    };
  }

  async download(bucket: string, objectKey: string): Promise<Readable> {
    const object = this.objects.get(this.id(bucket, objectKey));
    if (!object) {
      throw new HttpError(404, "Stored object not found");
    }
    return Readable.from(object.body);
  }

  async exists(bucket: string, objectKey: string) {
    return this.objects.has(this.id(bucket, objectKey));
  }

  async getMetadata(bucket: string, objectKey: string): Promise<StoredObjectMetadata> {
    const object = this.objects.get(this.id(bucket, objectKey));
    if (!object) {
      throw new HttpError(404, "Stored object not found");
    }
    return {
      bucket,
      objectKey,
      size: object.body.byteLength,
      contentType: object.contentType,
      lastModified: object.lastModified,
    };
  }

  async delete(bucket: string, objectKey: string) {
    this.objects.delete(this.id(bucket, objectKey));
  }
}
