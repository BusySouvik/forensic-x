import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { recordAcquisitionEvent } from "./ledger";

const investigationId = "deadbeef-aaaa-4111-8111-deadbeef0001";
const adminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jobId = "deadbeef-bbbb-4222-8222-deadbeef0002";
const authId = "deadbeef-cccc-4555-8555-deadbeef0003";
const storageObjectId = "deadbeef-dddd-4666-8666-deadbeef0004";
const evidenceId = "deadbeef-eeee-4333-8333-deadbeef0005";

beforeEach(async () => {
  const db = getDb();
  // Clean up any previous fixtures
  await db.delete(schema.ledger_events).where(eq(schema.ledger_events.investigationId, investigationId)).returning();
  await db.delete(schema.evidenceRecords).where(eq(schema.evidenceRecords.investigationId, investigationId)).returning();
  await db.delete(schema.acquisitionJobs).where(eq(schema.acquisitionJobs.investigationId, investigationId)).returning();
  await db.delete(schema.storageObjects).where(eq(schema.storageObjects.investigationId, investigationId)).returning();
  await db.delete(schema.operationAuthorizations).where(eq(schema.operationAuthorizations.investigationId, investigationId)).returning();
  await db.delete(schema.investigations).where(eq(schema.investigations.id, investigationId)).returning();

  // Insert base fixtures
  const [existingUser] = await db.select().from(schema.users).where(eq(schema.users.id, adminId)).limit(1);
  if (!existingUser) {
    await db.insert(schema.users).values({ id: adminId, email: "a@test", passwordHash: "", name: "Admin", role: "ADMIN" }).returning();
  }
  await db.insert(schema.investigations).values({ id: investigationId, investigationNumber: "CONC-1", title: "Concurrency test", description: "", createdBy: adminId }).returning();
  await db.insert(schema.operationAuthorizations).values({ id: authId, investigationId, deviceId: null, requestedBy: adminId, approvedBy: null, operationType: "ACQUISITION", reason: "ledger concurrency test", status: "APPROVED" }).returning();
  await db.insert(schema.storageObjects).values({ id: storageObjectId, investigationId, storageClass: "FORENSIC_IMAGE", bucket: "test", objectKey: "ledger-conc", originalFilename: "acq.img", contentType: "application/octet-stream", fileSizeBytes: 123, sha256: "msha1" }).returning();
  await db.insert(schema.acquisitionJobs).values({ id: jobId, investigationId, deviceId: null, requestedBy: adminId, authorizationId: authId, sourceType: "TEST_FILE", sourceIdentifier: "x", outputStorageObjectId: null, sha256: null, size: null, startedAt: null, completedAt: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() }).returning();
  await db.insert(schema.evidenceRecords).values({ id: evidenceId, investigationId, acquisitionJobId: jobId, masterStorageObjectId: storageObjectId, sha256: "msha1", size: 123, status: "AVAILABLE", createdAt: new Date() }).returning();
});

describe("ledger concurrency/idempotency", () => {
  it("concurrent calls create exactly one ledger_events row and return same id", async () => {
    const calls = 10;
    const promises = Array.from({ length: calls }).map(() =>
      recordAcquisitionEvent({
        investigationId,
        evidenceId,
        acquisitionJobId: jobId,
        deviceId: null,
        masterSha256: "msha1",
        masterSize: 123,
        actorId: adminId,
        authorizationId: authId,
      }),
    );

    const results = await Promise.all(promises);
    const ids = results.map((r) => r?.id).filter(Boolean);
    // All returned ids should be equal
    expect(new Set(ids).size).toBe(1);

    const db = getDb();
    const rows = await db.select().from(schema.ledger_events).where(eq(schema.ledger_events.acquisitionJobId, jobId));
    expect(rows.length).toBe(1);
  });
});
