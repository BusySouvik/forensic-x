import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Prepare initial dataset used by tests
const investigationId = "11111111-1111-4111-8111-111111111111";
const investigator1 = "22222222-2222-4222-8222-222222222222";
const investigator2 = "33333333-3333-4333-8333-333333333333";
const adminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let realDb: any;

beforeEach(async () => {
  const schema = await import("../db/schema");

  const dbModule = await import("../db");
  realDb = dbModule.getDb();

    // Cleanup known fixture rows by investigationId / known IDs to ensure deterministic state
    await realDb.delete(schema.recoveryCertificates).where(eq(schema.recoveryCertificates.investigationId, investigationId)).returning();
    await realDb.delete(schema.recoveredCandidates).where(eq(schema.recoveredCandidates.investigationId, investigationId)).returning();
    await realDb.delete(schema.recoveryJobs).where(eq(schema.recoveryJobs.investigationId, investigationId)).returning();
    await realDb.delete(schema.workingCopies).where(eq(schema.workingCopies.investigationId, investigationId)).returning();
    await realDb.delete(schema.investigationWorkflows).where(eq(schema.investigationWorkflows.investigationId, investigationId)).returning();
    await realDb.delete(schema.auditEvents).where(eq(schema.auditEvents.investigationId, investigationId)).returning();
    await realDb.delete(schema.evidenceRecords).where(eq(schema.evidenceRecords.investigationId, investigationId)).returning();
    await realDb.delete(schema.storageObjects).where(eq(schema.storageObjects.investigationId, investigationId)).returning();
    await realDb.delete(schema.acquisitionJobs).where(eq(schema.acquisitionJobs.investigationId, investigationId)).returning();
    await realDb.delete(schema.operationAuthorizations).where(eq(schema.operationAuthorizations.investigationId, investigationId)).returning();

    // Remove investigation and fixture users (do NOT delete shared admin user)
    await realDb.delete(schema.investigations).where(eq(schema.investigations.id, investigationId)).returning();
    await realDb.delete(schema.users).where(eq(schema.users.id, investigator1)).returning();
    await realDb.delete(schema.users).where(eq(schema.users.id, investigator2)).returning();

    // Seed deterministic fixtures
    // Ensure admin exists (do not remove if shared across tests)
    const [existingAdmin] = await realDb.select().from(schema.users).where(eq(schema.users.id, adminId)).limit(1);
    if (!existingAdmin) {
      await realDb.insert(schema.users).values({ id: adminId, email: "admin@example.test", passwordHash: "", name: "Admin", role: "ADMIN" }).returning();
    }
    // Insert investigator fixtures (idempotent)
    await realDb.insert(schema.users).values([
      { id: investigator1, email: "inv1@example.test", passwordHash: "", name: "Investigator One", role: "INVESTIGATOR" },
      { id: investigator2, email: "inv2@example.test", passwordHash: "", name: "Investigator Two", role: "INVESTIGATOR" },
    ]).onConflictDoNothing().returning();

    await realDb.insert(schema.investigations).values({
      id: investigationId,
      investigationNumber: "INV-TEST-1",
      title: "Test Investigation",
      description: "",
      createdBy: adminId,
    }).returning();

  // Always use real test database for these integration tests
});

describe("Investigation workflow and certificates", () => {
  it("Admin can configure workflow and audit event recorded", async () => {
    const { configureWorkflow } = await import("./investigationWorkflow");
    const workflow = await configureWorkflow({
      investigationId,
      actorId: adminId,
      acquisitionInvestigatorId: investigator1,
      recoveryInvestigatorId: investigator1,
      validationInvestigatorId: investigator2,
      analysisInvestigatorId: investigator2,
    });

    expect(workflow).toBeTruthy();
    {
      const schema = await import("../db/schema");
      const rows = await realDb.select().from(schema.auditEvents).where(eq(schema.auditEvents.investigationId, investigationId)).limit(1000);
      expect((rows || []).length).toBeGreaterThan(0);
    }
  });

  it("Wrong investigator cannot access assigned stage", async () => {
    const { assertStageAccess, configureWorkflow } = await import("./investigationWorkflow");
    await configureWorkflow({
      investigationId,
      actorId: adminId,
      acquisitionInvestigatorId: investigator1,
      recoveryInvestigatorId: investigator1,
      validationInvestigatorId: investigator2,
      analysisInvestigatorId: investigator2,
    });
    await expect(assertStageAccess(investigationId, "not-the-user", "RECOVERY" as any)).rejects.toMatchObject({ statusCode: 403 });
    await expect(assertStageAccess(investigationId, investigator1, "RECOVERY" as any)).resolves.toBeTruthy();
  });

  it("Create and validate certificate: Investigator1 creates, Investigator2 validates", async () => {
    const { createRecoveryCertificate, validateAndSignCertificate } = await import("./recoveryCertificates");
    // Insert recovery job, working copy, evidence, storage, candidate
    const job = { id: "44444444-4444-4444-8444-444444444444", investigationId, workingCopyId: "55555555-5555-4555-8555-555555555555" };
    const wc = { id: "55555555-5555-4555-8555-555555555555", investigationId, masterEvidenceId: "66666666-6666-4666-8666-666666666666", storageObjectId: "77777777-7777-4777-8777-777777777777" };
    const master = { id: "66666666-6666-4666-8666-666666666666", investigationId };
    const storage = { id: "77777777-7777-4777-8777-777777777777", investigationId, fileSizeBytes: 123, sha256: "deadbeef" };

    {
      const schema = await import("../db/schema");
      // create a minimal authorization required by working_copies and recovery_jobs
      const authId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
      await realDb.insert(schema.operationAuthorizations).values({
        id: authId,
        investigationId,
        requestedBy: adminId,
        operationType: "ACQUISITION",
        reason: "test",
        status: "PENDING",
      }).returning();

      // create storage object first (evidence.master_storage_object_id is not null)
      await realDb.insert(schema.storageObjects).values({
        id: storage.id,
        investigationId: storage.investigationId,
        storageClass: "RECOVERED_EVIDENCE",
        bucket: "test",
        objectKey: storage.id,
        originalFilename: "f.bin",
        contentType: "application/octet-stream",
        fileSizeBytes: storage.fileSizeBytes,
        sha256: storage.sha256,
      }).returning();
      // then create an acquisition job so evidence_records.acquisition_job_id can reference it
      const acqId = "aaaaaaaa-1111-4111-8111-aaaaaaaa1111";
      await realDb.insert(schema.acquisitionJobs).values({
        id: acqId,
        investigationId,
        requestedBy: adminId,
        authorizationId: authId,
        sourceType: "TEST_FILE",
        sourceIdentifier: "seed",
      }).returning();
      await realDb.insert(schema.evidenceRecords).values({ id: master.id, investigationId, acquisitionJobId: acqId, masterStorageObjectId: storage.id, sha256: "deadbeef", size: 123 }).returning();

      await realDb.insert(schema.workingCopies).values({
        id: wc.id,
        investigationId: wc.investigationId,
        masterEvidenceId: wc.masterEvidenceId,
        masterStorageObjectId: storage.id,
        sourceMasterSha256: "",
        workingCopySha256: "",
        investigatorId: investigator1,
        authorizationId: authId,
        storageObjectId: storage.id,
        status: "QUEUED",
      }).returning();

      await realDb.insert(schema.recoveryJobs).values({
        id: job.id,
        investigationId: job.investigationId,
        workingCopyId: job.workingCopyId,
        masterEvidenceId: master.id,
        requestedBy: adminId,
        authorizationId: authId,
        status: "QUEUED",
        method: "FILESYSTEM",
        engine: "TSK",
        config: {},
      }).returning();

      const candidate = {
        id: "88888888-8888-4888-8888-888888888888",
        investigationId,
        recoveryJobId: job.id,
        workingCopyId: wc.id,
        masterEvidenceId: master.id,
        method: "FILESYSTEM",
        engine: "TSK",
        size: 123,
        storageObjectId: storage.id,
        provisionalSha256: "deadbeef",
        provenance: { tool: "foremost" },
      };
      await realDb.insert(schema.recoveredCandidates).values(candidate).returning();
    }

    const created = await createRecoveryCertificate({ investigationId, recoveredCandidateId: "88888888-8888-4888-8888-888888888888", actorId: investigator1 });
    expect(created).toBeTruthy();
    expect(created.payloadHash).toBeTruthy();
    expect(created.recoverySignature).toBeTruthy();

    const validated = await validateAndSignCertificate({ certificateId: created.id, actorId: investigator2, investigationId });
    expect(validated.status === "VALIDATED" || validated.status === "VALIDATION_FAILED").toBeTruthy();
    expect(validated.validationSignature).toBeTruthy();
    expect(validated.validationSignerId).toBe(investigator2);
  });

  it("Validation detects artifact SHA mismatch and marks failed", async () => {
    const { createRecoveryCertificate, validateAndSignCertificate } = await import("./recoveryCertificates");
    // Prepare objects
    const job = { id: "44444444-4444-4444-9444-444444444445", investigationId, workingCopyId: "55555555-5555-4555-9555-555555555556" };
    const wc = { id: "55555555-5555-4555-9555-555555555556", investigationId, masterEvidenceId: "66666666-6666-4666-9666-666666666667", storageObjectId: "77777777-7777-4777-9777-777777777778" };
    const master = { id: "66666666-6666-4666-9666-666666666667", investigationId };
    const storage = { id: "77777777-7777-4777-9777-777777777778", investigationId, fileSizeBytes: 200, sha256: "real-sha-200" };

    {
      const schema = await import("../db/schema");
      const authId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac";
      await realDb.insert(schema.operationAuthorizations).values({
        id: authId,
        investigationId,
        requestedBy: adminId,
        operationType: "ACQUISITION",
        reason: "test",
        status: "PENDING",
      }).returning();

      const acqId2 = "aaaaaaaa-2222-4222-8222-aaaaaaaa2222";
      await realDb.insert(schema.storageObjects).values({
        id: storage.id,
        investigationId: storage.investigationId,
        storageClass: "RECOVERED_EVIDENCE",
        bucket: "test",
        objectKey: storage.id,
        originalFilename: "f.bin",
        contentType: "application/octet-stream",
        fileSizeBytes: storage.fileSizeBytes,
        sha256: storage.sha256,
      }).returning();
      await realDb.insert(schema.acquisitionJobs).values({
        id: acqId2,
        investigationId,
        requestedBy: adminId,
        authorizationId: authId,
        sourceType: "TEST_FILE",
        sourceIdentifier: "seed",
      }).returning();
      await realDb.insert(schema.evidenceRecords).values({ id: master.id, investigationId, acquisitionJobId: acqId2, masterStorageObjectId: storage.id, sha256: storage.sha256, size: storage.fileSizeBytes }).returning();

      await realDb.insert(schema.workingCopies).values({
        id: wc.id,
        investigationId: wc.investigationId,
        masterEvidenceId: wc.masterEvidenceId,
        masterStorageObjectId: storage.id,
        sourceMasterSha256: "",
        workingCopySha256: "",
        investigatorId: investigator1,
        authorizationId: authId,
        storageObjectId: storage.id,
        status: "QUEUED",
      }).returning();

      await realDb.insert(schema.recoveryJobs).values({
        id: job.id,
        investigationId: job.investigationId,
        workingCopyId: job.workingCopyId,
        masterEvidenceId: master.id,
        requestedBy: adminId,
        authorizationId: authId,
        status: "QUEUED",
        method: "FILESYSTEM",
        engine: "TSK",
        config: {},
      }).returning();

      const candidate = {
        id: "88888888-8888-4888-9888-888888888889",
        investigationId,
        recoveryJobId: job.id,
        workingCopyId: wc.id,
        masterEvidenceId: master.id,
        method: "FILESYSTEM",
        engine: "TSK",
        size: 100,
        storageObjectId: storage.id,
        provisionalSha256: "claimed-sha-100",
        provenance: {},
      };
      await realDb.insert(schema.recoveredCandidates).values(candidate).returning();
    }

    const created = await createRecoveryCertificate({ investigationId, recoveredCandidateId: "88888888-8888-4888-9888-888888888889", actorId: investigator1 });
    const validated = await validateAndSignCertificate({ certificateId: created.id, actorId: investigator2, investigationId });
    expect(validated.status).toBe("VALIDATION_FAILED");
  });

  it("Signing: payload hash changes on modification and signatures differ between actors", async () => {
    const { signingService } = await import("./signing");
    const payload = { a: 1, b: 2 };
    const h1 = signingService.computePayloadHash(payload);
    const s1 = signingService.signPayload(investigator1, payload);
    const s2 = signingService.signPayload(investigator2, payload);
    expect(h1).toBeTruthy();
    expect(s1.signature).not.toBe(s2.signature);

    // Modify payload
    const modified = { ...payload, b: 3 };
    const h2 = signingService.computePayloadHash(modified);
    expect(h1).not.toBe(h2);
  });

  it("Analysis is blocked when no validated certificates and accepted when validated", async () => {
    const { startAnalysis } = await import("./analysis");
    // Initially no certificates
    await expect(startAnalysis(investigationId, investigator2)).rejects.toMatchObject({ statusCode: 409 });

    // Add validated certificate with valid signature
    const cert = { id: "99999999-9999-4999-9999-999999999999", investigationId, status: "VALIDATED", validationSignature: "sig", validationSignerId: investigator2, validationDetails: {} };
    {
      const schema = await import("../db/schema");
      // create required storage/evidence/auth/job/candidate before inserting certificate
      const storageId = "aaaaaaaa-cccc-4ccc-cccc-cccccccccccc";
      const masterId = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
      const wcId = "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee";
      const jobId = "ffffffff-ffff-4fff-ffff-ffffffffffff";
      const candidateId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
      const authId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad";

      await realDb.insert(schema.operationAuthorizations).values({
        id: authId,
        investigationId,
        requestedBy: adminId,
        operationType: "ACQUISITION",
        reason: "test",
        status: "PENDING",
      }).returning();

      const acqId3 = "aaaaaaaa-3333-4333-8333-aaaaaaaa3333";
      await realDb.insert(schema.storageObjects).values({ id: storageId, investigationId, storageClass: "RECOVERED_EVIDENCE", bucket: "test", objectKey: storageId, originalFilename: "f.bin", contentType: "application/octet-stream", fileSizeBytes: 1, sha256: "x" }).returning();
      await realDb.insert(schema.acquisitionJobs).values({ id: acqId3, investigationId, requestedBy: adminId, authorizationId: authId, sourceType: "TEST_FILE", sourceIdentifier: "seed" }).returning();
      await realDb.insert(schema.evidenceRecords).values({ id: masterId, investigationId, acquisitionJobId: acqId3, masterStorageObjectId: storageId, sha256: "x", size: 1 }).returning();

      await realDb.insert(schema.workingCopies).values({
        id: wcId,
        investigationId,
        masterEvidenceId: masterId,
        masterStorageObjectId: storageId,
        sourceMasterSha256: "",
        workingCopySha256: "",
        investigatorId: investigator2,
        authorizationId: authId,
        storageObjectId: storageId,
        status: "QUEUED",
      }).returning();

      await realDb.insert(schema.recoveryJobs).values({ id: jobId, investigationId, workingCopyId: wcId, masterEvidenceId: masterId, requestedBy: adminId, authorizationId: authId, status: "QUEUED", method: "FILESYSTEM", engine: "TSK", config: {} }).returning();

      await realDb.insert(schema.recoveredCandidates).values({ id: candidateId, investigationId, recoveryJobId: jobId, workingCopyId: wcId, masterEvidenceId: masterId, method: "FILESYSTEM", engine: "TSK", size: 1 }).returning();

      await realDb.insert(schema.recoveryCertificates).values({
        id: cert.id,
        investigationId: cert.investigationId,
        status: cert.status,
        validationSignature: cert.validationSignature,
        validationSignerId: cert.validationSignerId,
        validationDetails: cert.validationDetails,
        recoveredCandidateId: candidateId,
        recoveryJobId: jobId,
        workingCopyId: wcId,
        masterEvidenceId: masterId,
        artifactStorageObjectId: storageId,
        createdBy: investigator2,
      }).returning();
    }

    // Mock signingService.verifyPayload to return true by importing and stubbing
    const signing = await import("./signing");
    vi.spyOn(signing.signingService, "verifyPayload").mockImplementation(() => true as any);

    const res = await startAnalysis(investigationId, investigator2);
    expect(res.accepted).toBe(true);
  });
});
