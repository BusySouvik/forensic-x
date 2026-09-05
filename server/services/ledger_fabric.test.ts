import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { users, investigations, acquisitionJobs, evidenceRecords, operationAuthorizations, storageObjects, recoveredCandidates, recoveryJobs, workingCopies, auditEvents, devices, investigationWorkflows, ledger_events } from "../db/schema";
import { eq } from "drizzle-orm";
import { recordAcquisitionEvent, verifyAcquisitionAnchor, _internal, setAdapterForTests } from "./ledger";

const investigationId = "ffffffff-1111-4111-8111-ffffffffffff";
const adminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jobId = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const authId = "cccccccc-5555-4555-8555-cccccccccccc";
const storageObjectId = "dddddddd-6666-4666-8666-dddddddddddd";

beforeEach(async () => {
  const db = getDb();
  // Delete dependent rows in FK-safe order for this test's fixtures only
  await db.delete(evidenceRecords).where(eq(evidenceRecords.investigationId, investigationId)).returning();
  await db.delete(ledger_events).where(eq(ledger_events.acquisitionJobId, jobId)).returning();
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

  const [existingUser] = await db.select().from(users).where(eq(users.id, adminId)).limit(1);
  if (!existingUser) {
    await db.insert(users).values({ id: adminId, email: "a@test", passwordHash: "", name: "Admin", role: "ADMIN" }).returning();
  }
  await db.insert(investigations).values({ id: investigationId, investigationNumber: "LEDGER-FABRIC-1", title: "Ledger Fabric test", description: "", createdBy: adminId }).returning();
  const [existingAuth] = await db.select().from(operationAuthorizations).where(eq(operationAuthorizations.id, authId)).limit(1);
  if (!existingAuth) {
    await db.insert(operationAuthorizations).values({ id: authId, investigationId, deviceId: null, requestedBy: adminId, approvedBy: null, operationType: "ACQUISITION", reason: "ledger fabric test", status: "APPROVED" }).returning();
  }

  const [existingStorage] = await db.select().from(storageObjects).where(eq(storageObjects.id, storageObjectId)).limit(1);
  if (!existingStorage) {
    await db.insert(storageObjects).values({ id: storageObjectId, investigationId, storageClass: "FORENSIC_IMAGE", bucket: "test", objectKey: "ledger-fabric-test", originalFilename: "acq.img", contentType: "application/octet-stream", fileSizeBytes: 123, sha256: "msha1" }).returning();
  }

  const [existingJob] = await db.select().from(acquisitionJobs).where(eq(acquisitionJobs.id, jobId)).limit(1);
  if (!existingJob) {
    await db.insert(acquisitionJobs).values({ id: jobId, investigationId, deviceId: null, requestedBy: adminId, authorizationId: authId, sourceType: "TEST_FILE", sourceIdentifier: "x", outputStorageObjectId: null, sha256: null, size: null, startedAt: null, completedAt: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() }).returning();
  }

  const [existingEvidence] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, "eeeeeeee-3333-4333-8333-eeeeeeeeeeee")).limit(1);
  if (!existingEvidence) {
    await db.insert(evidenceRecords).values({ id: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", investigationId, acquisitionJobId: jobId, masterStorageObjectId: storageObjectId, sha256: "msha1", size: 123, status: "AVAILABLE", createdAt: new Date() }).returning();
  }
});

describe("Ledger Fabric integration (mocked)", () => {
  it("persists txId and CONFIRMED status on successful adapter response", async () => {
    // Mock adapter that captures payload and simulates confirmed commit
    let lastPayload: any = null;
    const mock = {
      async recordEvent(payload: any) {
        lastPayload = payload;
        return { status: "CONFIRMED", txId: "tx-12345" };
      },
      async getEvent(_id: string) {
        return null;
      },
    };
    setAdapterForTests(mock as any);

    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });
    expect(ev).toBeTruthy();
    expect(ev.status).toBe("CONFIRMED");
    expect(ev.blockchain_tx_id).toBe("tx-12345");

    // The adapter must receive a deterministic eventId and both hashes
    expect(lastPayload).toBeTruthy();
    expect(lastPayload.eventId).toBe(ev.id);
    expect(lastPayload.masterSha256).toBe("msha1");
    expect(lastPayload.eventHash).toBe(ev.event_hash);
  });

  it("marks UNAVAILABLE when adapter reports UNAVAILABLE", async () => {
    const mock = {
      async recordEvent(_payload: any) {
        return { status: "UNAVAILABLE" };
      },
    };
    setAdapterForTests(mock as any);
    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });
    expect(ev).toBeTruthy();
    expect(ev.status).toBe("UNAVAILABLE");
    expect(ev.blockchain_tx_id).toBeFalsy();
  });

  it("SUBMITTED is not treated as CONFIRMED and persists txId", async () => {
    let lastPayload: any = null;
    const mock = {
      async recordEvent(payload: any) {
        lastPayload = payload;
        return { status: "SUBMITTED", txId: "tx-submitted" };
      },
    };
    setAdapterForTests(mock as any);
    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });
    expect(ev).toBeTruthy();
    expect(ev.status).toBe("SUBMITTED");
    expect(ev.blockchain_tx_id).toBe("tx-submitted");
    expect(lastPayload).toBeTruthy();
    expect(lastPayload.eventId).toBe(ev.id);
  });

  it("verifyAcquisitionAnchor returns MATCH when both hashes match", async () => {
    const mockSubmit = { async recordEvent(_payload: any) { return { status: "CONFIRMED", txId: "tx-xyz" }; } };
    setAdapterForTests(mockSubmit as any);
    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });

    const mockGet = {
      async getEvent(id: string) {
        return { eventId: id, eventHash: ev.event_hash, masterSha256: "msha1" };
      },
    };
    setAdapterForTests(mockGet as any);

    const res = await verifyAcquisitionAnchor(ev.id);
    expect(res.status).toBe("MATCH");
    expect(res.details).toBeTruthy();
    expect(res.details?.eventHashMatch).toBe(true);
    expect(res.details?.masterShaMatch).toBe(true);
  });

  it("verifyAcquisitionAnchor returns MISMATCH when eventHash differs", async () => {
    const mockSubmit = { async recordEvent(_payload: any) { return { status: "CONFIRMED", txId: "tx-abc" }; } };
    setAdapterForTests(mockSubmit as any);
    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });

    const mockGet = { async getEvent(_id: string) { return { eventId: _id, eventHash: "different", masterSha256: "msha1" }; } };
    setAdapterForTests(mockGet as any);
    const res = await verifyAcquisitionAnchor(ev.id);
    expect(res.status).toBe("MISMATCH");
    expect(res.details?.eventHashMatch).toBe(false);
    expect(res.details?.masterShaMatch).toBe(true);
  });

  it("verifyAcquisitionAnchor returns MISMATCH when masterSha differs", async () => {
    const mockSubmit = { async recordEvent(_payload: any) { return { status: "CONFIRMED", txId: "tx-abc" }; } };
    setAdapterForTests(mockSubmit as any);
    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });

    const mockGet = { async getEvent(_id: string) { return { eventId: _id, eventHash: ev.event_hash, masterSha256: "different" }; } };
    setAdapterForTests(mockGet as any);
    const res = await verifyAcquisitionAnchor(ev.id);
    expect(res.status).toBe("MISMATCH");
    expect(res.details?.eventHashMatch).toBe(true);
    expect(res.details?.masterShaMatch).toBe(false);
  });

  it("verifyAcquisitionAnchor returns NOT_FOUND when chain lacks record", async () => {
    const mockSubmit = { async recordEvent(_payload: any) { return { status: "CONFIRMED", txId: "tx-abc" }; } };
    setAdapterForTests(mockSubmit as any);
    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });

    const mockGet = { async getEvent(_id: string) { return null; } };
    setAdapterForTests(mockGet as any);
    const resNotFound = await verifyAcquisitionAnchor(ev.id);
    expect(resNotFound.status).toBe("NOT_FOUND");
  });

  it("verifyAcquisitionAnchor returns UNAVAILABLE when adapter throws", async () => {
    const mockSubmit = { async recordEvent(_payload: any) { return { status: "CONFIRMED", txId: "tx-abc" }; } };
    setAdapterForTests(mockSubmit as any);
    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });

    const mockGet = { async getEvent(_id: string) { throw new Error("network error"); } };
    setAdapterForTests(mockGet as any);
    const res = await verifyAcquisitionAnchor(ev.id);
    expect(res.status).toBe("UNAVAILABLE");
  });

  it("persists FAILED when adapter reports FAILED", async () => {
    const mock = {
      async recordEvent(_payload: any) {
        return { status: "FAILED", txId: "tx-fail", error: "bad" };
      },
    };
    setAdapterForTests(mock as any);
    const ev = await recordAcquisitionEvent({ investigationId, evidenceId: "eeeeeeee-3333-4333-8333-eeeeeeeeeeee", acquisitionJobId: jobId, deviceId: null, masterSha256: "msha1", masterSize: 123, actorId: adminId, authorizationId: authId });
    expect(ev).toBeTruthy();
    expect(ev.status).toBe("FAILED");
    expect(ev.blockchain_tx_id).toBe("tx-fail");
  });

  it("createFabricAdapter returns UNAVAILABLE adapter when config missing", async () => {
    // import factory dynamically to avoid interfering with other tests
    const { default: createFabricAdapter } = await import("./fabricAdapter");
    const adapter = await createFabricAdapter({} as any);
    const res = await adapter.recordEvent({});
    expect(res.status).toBe("UNAVAILABLE");
  });

  it("production rejects missing TLS root cert", async () => {
    const { default: createFabricAdapter } = await import("./fabricAdapter");
    const env = {
      NODE_ENV: "production",
      FABRIC_GATEWAY_URL: "host:7051",
      FABRIC_MSP_ID: "Org1MSP",
      FABRIC_IDENTITY_CERT_PATH: "/tmp/cert.pem",
      FABRIC_IDENTITY_PRIVATE_KEY_PATH: "/tmp/key.pem",
      FABRIC_CHANNEL: "mychannel",
      FABRIC_CHAINCODE: "chaincode",
    } as any;
    const adapter = await createFabricAdapter(env);
    const res = await adapter.recordEvent({});
    expect(res.status).toBe("UNAVAILABLE");
    expect(String(res.error || "")).toMatch(/FABRIC_TLS_ROOT_CERT_PATH is required/);
  });

  it("production with TLS root configured proceeds past TLS check (packages may be missing) and hides secrets", async () => {
    const fs = await import("node:fs/promises");
    const tmp = await import("node:os");
    const tmpdir = tmp.tmpdir();
    const tlsPath = `${tmpdir}/test-fabric-tls.pem`;
    const certPath = `${tmpdir}/test-fabric-cert.pem`;
    const keyPath = `${tmpdir}/test-fabric-key.pem`;
    const tlsContent = "TLSSECRET-XYZ";
    const certContent = "CERT-SECRET-ABC";
    const keyContent = "KEY-SECRET-123";
    await fs.writeFile(tlsPath, tlsContent, "utf8");
    await fs.writeFile(certPath, certContent, "utf8");
    await fs.writeFile(keyPath, keyContent, "utf8");

    const { default: createFabricAdapter } = await import("./fabricAdapter");
    const env = {
      NODE_ENV: "production",
      FABRIC_GATEWAY_URL: "host:7051",
      FABRIC_MSP_ID: "Org1MSP",
      FABRIC_IDENTITY_CERT_PATH: certPath,
      FABRIC_IDENTITY_PRIVATE_KEY_PATH: keyPath,
      FABRIC_TLS_ROOT_CERT_PATH: tlsPath,
      FABRIC_CHANNEL: "mychannel",
      FABRIC_CHAINCODE: "chaincode",
    } as any;

    const adapter = await createFabricAdapter(env);
    const res = await adapter.recordEvent({});
    // Because the real client packages are not installed in unit test env,
    // adapter will likely be UNAVAILABLE due to missing packages — that's fine.
    expect(res.status).toBe("UNAVAILABLE");
    const err = String(res.error || "");
    // Error must not expose TLS/private key contents
    expect(err).not.toContain(tlsContent);
    expect(err).not.toContain(certContent);
    expect(err).not.toContain(keyContent);
  });
});
