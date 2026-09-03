import { randomUUID } from "node:crypto";
import type { StorageClass } from "../../shared/types";
import { HttpError } from "../middleware/httpError";

const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

export function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  if (
    !trimmed ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    !SAFE_FILENAME.test(trimmed)
  ) {
    throw new HttpError(400, "Invalid object filename");
  }
  return trimmed;
}

export function generateObjectKey(input: {
  investigationId?: string | null;
  storageClass: StorageClass;
  filename: string;
  objectId?: string;
}): { objectId: string; objectKey: string } {
  const objectId = input.objectId ?? randomUUID();
  const filename = sanitizeFilename(input.filename);
  const investigationSegment = input.investigationId ?? "unassigned";
  if (investigationSegment.includes("..") || investigationSegment.includes("/") || investigationSegment.includes("\\")) {
    throw new HttpError(400, "Invalid investigation identifier for object key");
  }

  const objectKey = [
    "investigations",
    investigationSegment,
    input.storageClass.toLowerCase(),
    objectId,
    filename,
  ].join("/");

  return { objectId, objectKey };
}
