import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { users, investigations, acquisitionJobs, evidenceRecords, operationAuthorizations, storageObjects, auditEvents, devices, workingCopies, recoveryJobs, recoveredCandidates, investigationWorkflows } from "../db/schema";
import { eq } from "drizzle-orm";
import { computeEventHash, _internal, recordAcquisitionEvent, getLedgerEventByAcquisition } from "./ledger";

const investigationId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const adminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jobId = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const authId = "cccccccc-5555-4555-8555-cccccccccccc";
const storageObjectId = "dddddddd-6666-4666-8666-dddddddddddd";

beforeEach(async () => {
  const db = getDb();
  // Delete dependent rows in FK-safe order for this test's fixtures only
  await db.delete(evidenceRecords).where(eq(evidenceRecords.investigationId, investigationId)).returning();
  await db.delete(acquisitionJobs).where(eq(acquisitionJobs.investigationId, investigationId)).returning();
  await db.delete(recoveredCandidates).where(eq(recoveredCandidates.investigationId, investigationId)).returning();
  await db.delete(recoveryJobs).where(eq(recoveryJobs.investigationId, investigationId)).returning();
  await db.delete(workingCopies).where(eq(workingCopies.investigationId, investigationId)).returning();
  await db.delete(auditEvents).where(eq(auditEvents.investigationId, investigationId)).returning();
  await db.delete(operationAuthorizations).where(eq(operationAuthorizations.investigationId, investigationId)).returning();
  await db.delete(storageObjects).where(eq(storageObjects.investigationId, investigationId)).returning();
  await db.delete(devices).where(eq(devices.investigationId, investigationId)).returning();
  await db.delete(investigationWorkflows).where(eq(investigationWorkflows.investigationId, investigationId)).returning();
  await db.delete(investigations).where(eq(investigations.id, investigationId)).returning();

  // Insert minimal fixtures required for this test
  const [existingUser] = await db.select().from(users).where(eq(users.id, adminId)).limit(1);
  if (!existingUser) {
    await db.insert(users).values({ id: adminId, email: "a@test", passwordHash: "", name: "Admin", role: "ADMIN" }).returning();
  }
  await db.insert(investigations).values({ id: investigationId, investigationNumber: "LEDGER-1", title: "Ledger test", description: "", createdBy: adminId }).returning();
  await db.insert(operationAuthorizations).values({ id: authId, investigationId, deviceId: null, requestedBy: adminId, approvedBy: null, operationType: "ACQUISITION", reason: "ledger test", status: "APPROVED" }).returning();
  await db.insert(storageObjects).values({ id: storageObjectId, investigationId, storageClass: "FORENSIC_IMAGE", bucket: "test", objectKey: "ledger-test", originalFilename: "acq.img", contentType: "application/octet-stream", fileSizeBytes: 123, sha256: "msha1" }).returning();
  await db.insert(acquisitionJobs).values({ id: jobId, investigationId, deviceId: null, requestedBy: adminId, authorizationId: authId, sourceType: "TEST_FILE", sourceIdentifier: "x", outputStorageObjectId: null, sha256: null, size: null, startedAt: null, completedAt: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() }).returning();
  await db.insert(evidenceRecords).values({ id: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", investigationId, acquisitionJobId: jobId, masterStorageObjectId: storageObjectId, sha256: "msha1", size: 123, status: "AVAILABLE", createdAt: new Date() }).returning();
});

describe("Ledger service basic tests", () => {
  it("canonicalization is deterministic", () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    const ha = _internal.computeEventHash ? _internal.computeEventHash(a) : computeEventHash(a);
    const hb = _internal.computeEventHash ? _internal.computeEventHash(b) : computeEventHash(b);
    expect(ha).toBe(hb);
  });

  it("changing master sha changes event hash", () => {
    const p1 = { masterSha256: "x" };
    const p2 = { masterSha256: "y" };
    const h1 = computeEventHash(p1);
    const h2 = computeEventHash(p2);
    expect(h1).not.toBe(h2);
  });

  it("recordAcquisitionEvent is idempotent and stores event referencing acquisition", async () => {
    const ev1 = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: adminId });
    expect(ev1).toBeTruthy();
    const ev2 = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: adminId });
    expect(ev2.id).toBe(ev1.id);
    const fetched = await getLedgerEventByAcquisition(jobId);
    expect(fetched).toBeTruthy();
    expect(fetched.event_type).toBe("ACQUISITION");
    expect(fetched.event_hash).toBeTruthy();
  });
});
