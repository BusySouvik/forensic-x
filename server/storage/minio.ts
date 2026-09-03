import { Client } from "minio";
import { env } from "../config/env";
import { HttpError } from "../middleware/httpError";
import type { ObjectStore, StoredObjectMetadata, UploadObjectInput } from "./objectStore";

let client: Client | null = null;
let bucketsReady = false;

export function isMinioConfigured() {
  return Boolean(env.MINIO_ENDPOINT && env.MINIO_ACCESS_KEY && env.MINIO_SECRET_KEY);
}

export function getRequiredBuckets() {
  return [
    env.MINIO_BUCKET_IMAGES,
    env.MINIO_BUCKET_WORKING,
    env.MINIO_BUCKET_EVIDENCE,
    env.MINIO_BUCKET_CERTIFICATES,
  ];
}

export function getMinioClient() {
  if (!isMinioConfigured()) {
    throw new HttpError(503, "Object storage is not configured");
  }
  if (!client) {
    client = new Client({
      endPoint: env.MINIO_ENDPOINT!,
      port: env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY!,
      secretKey: env.MINIO_SECRET_KEY!,
    });
  }
  return client;
}

function wrapMinioError(error: unknown, fallback: string): never {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "NoSuchKey" || code === "NotFound") {
    throw new HttpError(404, "Stored object not found");
  }
  if (code === "NoSuchBucket") {
    throw new HttpError(404, "Storage bucket not found");
  }
  const message = error instanceof Error ? error.message : fallback;
  throw new HttpError(503, "Object storage error", message);
}

export class MinioObjectStore implements ObjectStore {
  async ping() {
    try {
      await getMinioClient().listBuckets();
    } catch (error) {
      wrapMinioError(error, "Unable to connect to object storage");
    }
  }

  async ensureBuckets(buckets: string[] = getRequiredBuckets()) {
    const minio = getMinioClient();
    try {
      for (const bucket of buckets) {
        const exists = await minio.bucketExists(bucket);
        if (!exists) {
          await minio.makeBucket(bucket);
        }
      }
      bucketsReady = true;
      return buckets;
    } catch (error) {
      wrapMinioError(error, "Unable to prepare storage buckets");
    }
  }

  async upload(input: UploadObjectInput): Promise<StoredObjectMetadata> {
    await this.ensureReady();
    try {
      const result = await getMinioClient().putObject(
        input.bucket,
        input.objectKey,
        input.body,
        input.body.byteLength,
        { "Content-Type": input.contentType },
      );
      return {
        bucket: input.bucket,
        objectKey: input.objectKey,
        size: input.body.byteLength,
        etag: result.etag,
        contentType: input.contentType,
      };
    } catch (error) {
      wrapMinioError(error, "Unable to upload object");
    }
  }

  async download(bucket: string, objectKey: string) {
    await this.ensureReady();
    try {
      return await getMinioClient().getObject(bucket, objectKey);
    } catch (error) {
      wrapMinioError(error, "Unable to download object");
    }
  }

  async exists(bucket: string, objectKey: string) {
    await this.ensureReady();
    try {
      await getMinioClient().statObject(bucket, objectKey);
      return true;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "NotFound" || code === "NoSuchKey") {
        return false;
      }
      wrapMinioError(error, "Unable to inspect object");
    }
  }

  async getMetadata(bucket: string, objectKey: string): Promise<StoredObjectMetadata> {
    await this.ensureReady();
    try {
      const stat = await getMinioClient().statObject(bucket, objectKey);
      return {
        bucket,
        objectKey,
        size: stat.size,
        etag: stat.etag,
        lastModified: stat.lastModified,
        contentType: stat.metaData?.["content-type"],
      };
    } catch (error) {
      wrapMinioError(error, "Unable to read object metadata");
    }
  }

  async delete(bucket: string, objectKey: string) {
    await this.ensureReady();
    try {
      await getMinioClient().removeObject(bucket, objectKey);
    } catch (error) {
      wrapMinioError(error, "Unable to delete object");
    }
  }

  private async ensureReady() {
    if (!bucketsReady) {
      await this.ensureBuckets();
    }
  }
}

export function getMinioObjectStore() {
  return new MinioObjectStore();
}
