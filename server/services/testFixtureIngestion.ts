import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { env } from "../config/env";
import { getDb } from "../db";
import { acquisitionJobs, auditEvents, evidenceRecords, investigations, operationAuthorizations, users } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { getEvidenceStorageService, type EvidenceStorageService, type StorageReference } from "./evidenceStorage";

const DEVICE_PATH_RE = /^(?:\\\\[.?]\\PhysicalDrive\d+|PhysicalDrive\d+|\\\\[.?]|\/dev\/)/i;
const NETWORK_PATH_RE = /^(?:\\\\|\/\/)/;

export type TestFixtureIngestionInput = {
  fixturePath: string;
  investigationId: string;
  actorId: string;
  authorizationId: string;
  environment?: string;
  enabled?: string | undefined;
};

export type TestFixtureIngestionResult = {
  investigationId: string;
  acquisitionJobId: string;
  masterEvidenceId: string;
  storageObject: StorageReference;
  sha256: string;
  size: number;
  provenance: "TEST_FIXTURE";
};

export interface TestFixtureIngestionRepository {
  assertAuthorized(input: { investigationId: string; actorId: string; authorizationId: string }): Promise<void>;
  createMaster(input: {
    investigationId: string;
    actorId: string;
    authorizationId: string;
    fixtureFilename: string;
    storageObjectId: string;
    sha256: string;
    size: number;
  }): Promise<{ acquisitionJobId: string; masterEvidenceId: string }>;
}

export async function ingestTestFixture(
  input: TestFixtureIngestionInput,
  options: { storage?: EvidenceStorageService; repository?: TestFixtureIngestionRepository } = {},
): Promise<TestFixtureIngestionResult> {
  assertTestFixtureEnvironment(input.environment ?? env.NODE_ENV, input.enabled ?? process.env.FORENSIC_X_ENABLE_TEST_FIXTURE_INGESTION);
  const fixture = await readRegularFixtureFile(input.fixturePath);
  const sha256 = createHash("sha256").update(fixture.bytes).digest("hex");
  const storage = options.storage ?? getEvidenceStorageService();
  const repository = options.repository ?? new DrizzleTestFixtureIngestionRepository();

  await repository.assertAuthorized(input);
  await storage.ensureBuckets();
  const storageObject = await storage.upload({
    storageClass: "FORENSIC_IMAGE",
    filename: fixture.filename,
    body: fixture.bytes,
    contentType: "application/octet-stream",
    investigationId: input.investigationId,
  });
  if (storageObject.sha256 !== sha256) throw new HttpError(500, "Fixture storage hash mismatch");

  try {
    const master = await repository.createMaster({
      investigationId: input.investigationId,
      actorId: input.actorId,
      authorizationId: input.authorizationId,
      fixtureFilename: fixture.filename,
      storageObjectId: storageObject.id,
      sha256,
      size: fixture.bytes.byteLength,
    });
    return { ...master, investigationId: input.investigationId, storageObject, sha256, size: fixture.bytes.byteLength, provenance: "TEST_FIXTURE" };
  } catch (error) {
    await storage.delete(storageObject.id, { overrideMasterImageProtection: true }).catch(() => undefined);
    throw error;
  }
}

export function assertTestFixtureEnvironment(environment: string, enabled: string | undefined) {
  if (environment !== "development" && environment !== "test") {
    throw new HttpError(403, "Test fixture ingestion is allowed only in development or test environments");
  }
  if (enabled !== "true") {
    throw new HttpError(403, "Set FORENSIC_X_ENABLE_TEST_FIXTURE_INGESTION=true to ingest a test fixture");
  }
}

export async function readRegularFixtureFile(fixturePath: string) {
  if (DEVICE_PATH_RE.test(fixturePath) || NETWORK_PATH_RE.test(fixturePath)) {
    throw new HttpError(400, "Fixture path must not reference a physical, raw, or network device");
  }
  if (!fixturePath || !path.isAbsolute(fixturePath)) {
    throw new HttpError(400, "Fixture path must be an explicitly supplied absolute local file path");
  }
  let stats;
  try {
    stats = await lstat(fixturePath);
  } catch {
    throw new HttpError(404, "Fixture file does not exist");
  }
  if (!stats.isFile()) throw new HttpError(400, "Fixture path must reference a regular file");

  const filename = path.basename(fixturePath);
  if (!/\.(?:raw|img|dd)$/i.test(filename)) {
    throw new HttpError(400, "Fixture must use a RAW image extension (.raw, .img, or .dd)");
  }
  return { filename, bytes: await readFile(fixturePath) };
}

export class DrizzleTestFixtureIngestionRepository implements TestFixtureIngestionRepository {
  async assertAuthorized(input: { investigationId: string; actorId: string; authorizationId: string }) {
    const db = getDb();
    const [investigation, actor, authorization] = await Promise.all([
      db.select({ id: investigations.id }).from(investigations).where(eq(investigations.id, input.investigationId)).limit(1),
      db.select({ id: users.id }).from(users).where(eq(users.id, input.actorId)).limit(1),
      db.select().from(operationAuthorizations).where(and(eq(operationAuthorizations.id, input.authorizationId), eq(operationAuthorizations.investigationId, input.investigationId))).limit(1),
    ]);
    if (!investigation[0]) throw new HttpError(404, "Investigation not found");
    if (!actor[0]) throw new HttpError(404, "Fixture ingestion actor not found");
    const auth = authorization[0];
    if (!auth || auth.status !== "APPROVED" || auth.operationType !== "ACQUISITION" || auth.requestedBy !== input.actorId) {
      throw new HttpError(403, "An approved acquisition authorization owned by the fixture-ingestion actor is required");
    }
  }

  async createMaster(input: {
    investigationId: string; actorId: string; authorizationId: string; fixtureFilename: string;
    storageObjectId: string; sha256: string; size: number;
  }) {
    const db = getDb();
    const now = new Date();
    const acquisitionJobId = randomUUID();
    const masterEvidenceId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(acquisitionJobs).values({
        id: acquisitionJobId, investigationId: input.investigationId, deviceId: null, requestedBy: input.actorId,
        authorizationId: input.authorizationId, status: "COMPLETED", sourceType: "TEST_FILE",
        sourceIdentifier: "TEST_FIXTURE:" + input.fixtureFilename, outputStorageObjectId: input.storageObjectId,
        sha256: input.sha256, size: input.size, startedAt: now, completedAt: now, errorMessage: null, createdAt: now, updatedAt: now,
      });
      await tx.insert(evidenceRecords).values({
        id: masterEvidenceId, investigationId: input.investigationId, deviceId: null, acquisitionJobId,
        masterStorageObjectId: input.storageObjectId, sha256: input.sha256, size: input.size, status: "AVAILABLE", createdAt: now,
      });
      await tx.insert(auditEvents).values({
        investigationId: input.investigationId, deviceId: null, acquisitionJobId, authorizationId: input.authorizationId,
        actorId: input.actorId, eventType: "COMPLETED", result: "TEST_FIXTURE",
        details: "provenance=TEST_FIXTURE; fixtureFilename=" + input.fixtureFilename + "; sha256=" + input.sha256 + "; size=" + input.size,
        createdAt: now,
      });
    });
    return { acquisitionJobId, masterEvidenceId };
  }
}
