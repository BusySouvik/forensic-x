import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { env } from "../config/env";
import { getMinioObjectStore, getRequiredBuckets, isMinioConfigured } from "./minio";

const live = isMinioConfigured();

describe.skipIf(!live)("MinIO connection", () => {
  it("connects and exposes the required buckets", async () => {
    const store = getMinioObjectStore();
    await store.ping();
    const buckets = await store.ensureBuckets(getRequiredBuckets());
    expect(buckets).toEqual(
      expect.arrayContaining([
        env.MINIO_BUCKET_IMAGES,
        env.MINIO_BUCKET_WORKING,
        env.MINIO_BUCKET_EVIDENCE,
        env.MINIO_BUCKET_CERTIFICATES,
      ]),
    );
  });

  it("uploads a harmless object, then reads metadata and existence", async () => {
    const store = getMinioObjectStore();
    await store.ensureBuckets();
    const objectKey = `probes/${randomUUID()}/storage-probe.txt`;
    const body = Buffer.from("FORENSIC-X MinIO storage probe. Not a forensic image.\n");
    await store.upload({
      bucket: env.MINIO_BUCKET_WORKING,
      objectKey,
      body,
      contentType: "text/plain",
    });
    expect(await store.exists(env.MINIO_BUCKET_WORKING, objectKey)).toBe(true);
    const metadata = await store.getMetadata(env.MINIO_BUCKET_WORKING, objectKey);
    expect(metadata.size).toBe(body.byteLength);
    await store.delete(env.MINIO_BUCKET_WORKING, objectKey);
    expect(await store.exists(env.MINIO_BUCKET_WORKING, objectKey)).toBe(false);
  });
});
