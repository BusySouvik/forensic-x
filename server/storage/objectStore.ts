import type { Readable } from "node:stream";

export type StoredObjectMetadata = {
  bucket: string;
  objectKey: string;
  size: number;
  etag?: string;
  lastModified?: Date;
  contentType?: string;
};

export type UploadObjectInput = {
  bucket: string;
  objectKey: string;
  body: Buffer;
  contentType: string;
};

export interface ObjectStore {
  ping(): Promise<void>;
  ensureBuckets(buckets: string[]): Promise<string[]>;
  upload(input: UploadObjectInput): Promise<StoredObjectMetadata>;
  download(bucket: string, objectKey: string): Promise<Readable>;
  exists(bucket: string, objectKey: string): Promise<boolean>;
  getMetadata(bucket: string, objectKey: string): Promise<StoredObjectMetadata>;
  delete(bucket: string, objectKey: string): Promise<void>;
}
