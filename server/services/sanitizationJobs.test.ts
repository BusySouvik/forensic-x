import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../db";
import { auditEvents, investigations, operationAuthorizations, sanitization_certificates, sanitization_jobs, users } from "../db/schema";
import {
  createSanitizationJobService,
  DrizzleSanitizationJobRepository,
  type SanitizationJobRecord,
  type SanitizationJobRepository,
} from "./sanitizationJobs";

class AtomicMemorySanitizationRepository implements SanitizationJobRepository {
  private readonly records = new Map<string, SanitizationJobRecord>();

  constructor(records: SanitizationJobRecord[]) {
    records.forEach((record) => this.records.set(record.id, record));
  }

  async getById(id: string) {
    return this.records.get(id) ?? null;
  }

  async listForInvestigation(investigationId: string) {
    return Array.from(this.records.values()).filter((record) => record.investigationId === investigationId);
  }

  async findNextQueued() {
    return Array.from(this.records.values())
      .filter((record) => record.status === "QUEUED")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
  }

  async findAndClaimNextQueued(workerId: string) {
    const queued = Array.from(this.records.values())
      .filter((record) => record.status === "QUEUED")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!queued) return null;

    // There is no await between observing and changing state. This models the
    // repository's atomic database claim boundary for service-level tests.
    const now = new Date();
    const claimed = { ...queued, status: "SANITIZING", performerId: workerId, startedAt: now, updatedAt: now };
    this.records.set(claimed.id, claimed);
    return claimed;
  }

  async cancelIfPending(id: string) {
    const record = this.records.get(id);
    if (!record || (record.status !== "AUTHORIZED" && record.status !== "QUEUED")) return null;
    const cancelled = { ...record, status: "CANCELLED" as const, completedAt: new Date(), updatedAt: new Date() };
    this.records.set(id, cancelled);
    return cancelled;
  }

  async insert(record: SanitizationJobRecord) {
    this.records.set(record.id, record);
    return record;
  }

  async update(record: SanitizationJobRecord) {
    this.records.set(record.id, record);
    return record;
  }

  async updateIfStatus(id: string, expectedStatuses: SanitizationJobRecord["status"] | SanitizationJobRecord["status"][], record: SanitizationJobRecord) {
    const expected: SanitizationJobRecord["status"][] = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
    const current = this.records.get(id);
    if (!current) return null;
    if (!expected.includes(current.status)) return null;
    this.records.set(id, record);
    return record;
  }
}

function job(status: SanitizationJobRecord["status"] = "QUEUED"): SanitizationJobRecord {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "11111111-1111-4111-8111-111111111111",
    investigationId: "22222222-2222-4222-8222-222222222222",
    authorizationId: "33333333-3333-4333-8333-333333333333",
    requestedBy: "44444444-4444-4444-8444-444444444444",
    targetType: "DEVICE",
    targetReference: "test-target",
    sanitizationMethod: "TEST_TRUNCATE",
    status,
    startedAt: null,
    completedAt: null,
    performerId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function serviceWith(records: SanitizationJobRecord[]) {
  const audits: Array<{ actorId: string; sanitizationJobId?: string | null; eventType: string }> = [];
  const repository = new AtomicMemorySanitizationRepository(records);
  const service = createSanitizationJobService({
    repository,
    auditLogger: async (event) => { audits.push(event); },
  });
  return { service, repository, audits };
}

describe("SanitizationJobService atomic claims", () => {
  it("returns a queued job to exactly one of two concurrent workers", async () => {
    const { service } = serviceWith([job()]);

    const [workerA, workerB] = await Promise.all([
      service.claimNextQueuedJob("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      service.claimNextQueuedJob("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    ]);

    expect([workerA, workerB].filter(Boolean)).toHaveLength(1);
    expect(new Set([workerA?.id, workerB?.id].filter(Boolean))).toEqual(new Set([job().id]));
  });

  it.each(["SANITIZING", "COMPLETED", "SANITIZATION_FAILED"])("does not claim a %s job", async (status) => {
    const { service } = serviceWith([job(status)]);
    await expect(service.claimNextQueuedJob("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toBeNull();
  });

  it("records the worker, start time, and worker audit actor without changing authorization", async () => {
    const workerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const initial = job();
    const { service, repository, audits } = serviceWith([initial]);

    const claimed = await service.claimNextQueuedJob(workerId);

    expect(claimed).toMatchObject({ status: "SANITIZING", performerId: workerId, authorizationId: initial.authorizationId });
    expect(claimed?.startedAt).toBeInstanceOf(Date);
    expect(await repository.getById(initial.id)).toMatchObject({ authorizationId: initial.authorizationId });
    expect(audits[0]).toMatchObject({ actorId: workerId, sanitizationJobId: initial.id, eventType: "STARTED" });
  });
});

describe("SanitizationJobService cancellation", () => {
  it.each(["AUTHORIZED", "QUEUED"] as const)("cancels a %s job", async (status) => {
    const { service } = serviceWith([job(status)]);
    await expect(service.cancelJob(job().id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it.each(["SANITIZING", "VERIFYING", "COMPLETED"] as const)("rejects cancellation of a %s job", async (status) => {
    const { service } = serviceWith([job(status)]);
    await expect(service.cancelJob(job().id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("does not overwrite a worker claim or write a cancellation audit", async () => {
    const workerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { service, repository, audits } = serviceWith([job()]);
    const claimed = await service.claimNextQueuedJob(workerId);
    await expect(service.cancelJob(job().id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).rejects.toMatchObject({ statusCode: 409 });
    expect(await repository.getById(job().id)).toMatchObject({ status: "SANITIZING", performerId: workerId, startedAt: claimed?.startedAt });
    expect(audits.some((event) => event.eventType === "CANCELLED")).toBe(false);
  });
});

describe("SanitizationJobService verification failures", () => {
  it("persists structured verification failure details without completing the job", async () => {
    const initial = job("VERIFYING");
    const { service, repository } = serviceWith([initial]);
    const details = { status: "FAILED", expectedState: "removed", actualState: "present", failureReason: "Target still exists" };
    const failed = await service.failVerification(initial.id, details, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(failed).toMatchObject({ status: "VERIFICATION_FAILED", verificationStatus: "FAILED", verificationDetails: details, failureReason: "Target still exists" });
    expect(await repository.getById(initial.id)).not.toMatchObject({ status: "COMPLETED" });
  });

  it("requires a persisted certificate reference before completing a verified job", async () => {
    const initial = { ...job("CERTIFICATE_READY"), verificationStatus: "VERIFIED", certificateId: "55555555-5555-4555-8555-555555555555" };
    const { service, repository } = serviceWith([initial]);
    await expect(service.completeCertifiedJob(initial.id, initial.certificateId!, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toMatchObject({ status: "COMPLETED", certificateId: initial.certificateId });
    await expect(repository.getById(initial.id)).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("rejects the legacy completion path before a certificate is ready", async () => {
    const initial = { ...job("VERIFYING"), verificationStatus: "VERIFIED" };
    const { service } = serviceWith([initial]);
    await expect(service.completeJob(initial.id, { verificationStatus: "VERIFIED" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("preserves successful verification when certificate generation fails", async () => {
    const initial = { ...job("CERTIFICATE_READY"), verificationStatus: "VERIFIED", verificationDetails: { actualState: "missing" } };
    const { service, repository, audits } = serviceWith([initial]);
    const failed = await service.failCertificate(initial.id, "certificate store unavailable", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(failed).toMatchObject({ status: "CERTIFICATE_FAILED", verificationStatus: "VERIFIED", verificationDetails: { actualState: "missing" }, failureReason: "certificate store unavailable" });
    expect(audits.at(-1)).toMatchObject({ eventType: "FAILED" });
    expect(await repository.getById(initial.id)).not.toMatchObject({ status: "COMPLETED" });
  });

  it("uses the persisted performer, not the requester or supplied caller, for execution and failure audits", async () => {
    const requester = job("QUEUED").requestedBy;
    const performer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { service, repository, audits } = serviceWith([job("QUEUED")]);
    const claimed = await service.claimNextQueuedJob(performer);
    await service.failJob(claimed!.id, "adapter failed", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(await repository.getById(claimed!.id)).toMatchObject({ requestedBy: requester, performerId: performer, status: "SANITIZATION_FAILED" });
    expect(audits.map((event) => event.actorId)).toEqual([performer, performer]);
    expect(audits.at(-1)).toMatchObject({ eventType: "FAILED" });
  });

  it("uses the persisted performer for verification and certificate failure audits", async () => {
    const performer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const verifying = { ...job("VERIFYING"), performerId: performer };
    const { service, audits } = serviceWith([verifying]);
    await service.failVerification(verifying.id, { failureReason: "target remains" }, "bbbbbbbb-bbbb-4bbb-bbbbbbbbbbbb");
    expect(audits.at(-1)).toMatchObject({ actorId: performer, eventType: "FAILED" });

    const certReady = { ...job("CERTIFICATE_READY"), id: "99999999-9999-4999-8999-999999999999", performerId: performer, verificationStatus: "VERIFIED" };
    const certificateService = serviceWith([certReady]);
    await certificateService.service.failCertificate(certReady.id, "certificate store failed", "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb");
    expect(certificateService.audits.at(-1)).toMatchObject({ actorId: performer, eventType: "FAILED" });
  });
});

describe("DrizzleSanitizationJobRepository cancellation/claim race", () => {
  const integrationTest = process.env.FORENSIC_X_SANITIZATION_INTEGRATION === "1" ? it : it.skip;

  integrationTest("lets exactly one PostgreSQL operation win without overwriting an executing claim", async () => {
    const db = getDb();
    const requesterId = crypto.randomUUID();
    const workerId = crypto.randomUUID();
    const investigationId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const audits: Array<{ eventType: string }> = [];
    const repository = new DrizzleSanitizationJobRepository();
    const service = createSanitizationJobService({ repository, auditLogger: async (event) => { audits.push(event); } });

    try {
      await db.insert(users).values([
        { id: requesterId, email: `sanit-requester-${requesterId}@test.invalid`, passwordHash: "", name: "Requester", role: "INVESTIGATOR" },
        { id: workerId, email: `sanit-worker-${workerId}@test.invalid`, passwordHash: "", name: "Worker", role: "INVESTIGATOR" },
      ]);
      await db.insert(investigations).values({ id: investigationId, investigationNumber: `SANIT-${jobId}`, title: "Sanitization race", description: "", createdBy: requesterId });
      await db.insert(operationAuthorizations).values({ id: authorizationId, investigationId, requestedBy: requesterId, approvedBy: requesterId, operationType: "SANITIZATION", reason: "test", status: "APPROVED" });
      await db.insert(sanitization_jobs).values({ id: jobId, investigationId, authorizationId, requestedBy: requesterId, targetType: "FOLDER", targetReference: "fixture", sanitizationMethod: "TEST_TRUNCATE", status: "QUEUED" });

      const [claim, cancel] = await Promise.allSettled([
        service.claimNextQueuedJob(workerId),
        service.cancelJob(jobId, requesterId),
      ]);
      const [stored] = await db.select().from(sanitization_jobs).where(eq(sanitization_jobs.id, jobId));

      expect(stored).toBeTruthy();
      if (stored.status === "SANITIZING") {
        expect(claim.status).toBe("fulfilled");
        expect(cancel.status).toBe("rejected");
        expect(stored.performerId).toBe(workerId);
        expect(stored.startedAt).toBeInstanceOf(Date);
        expect(audits.some((event) => event.eventType === "CANCELLED")).toBe(false);
      } else {
        expect(stored.status).toBe("CANCELLED");
        expect(claim.status).toBe("fulfilled");
        expect(claim.status === "fulfilled" && claim.value).toBeNull();
        expect(cancel.status).toBe("fulfilled");
        expect(audits.filter((event) => event.eventType === "CANCELLED")).toHaveLength(1);
      }
    } finally {
      await db.delete(auditEvents).where(eq(auditEvents.investigationId, investigationId));
      await db.delete(sanitization_jobs).where(eq(sanitization_jobs.investigationId, investigationId));
      await db.delete(operationAuthorizations).where(eq(operationAuthorizations.investigationId, investigationId));
      await db.delete(investigations).where(eq(investigations.id, investigationId));
      await db.delete(users).where(inArray(users.id, [requesterId, workerId]));
    }
  });
});

describe("Sanitization certificate persistence", () => {
  const integrationTest = process.env.FORENSIC_X_SANITIZATION_INTEGRATION === "1" ? it : it.skip;

  integrationTest("creates a real authoritative certificate and atomically makes the job certificate-ready", async () => {
    const db = getDb();
    const requesterId = crypto.randomUUID();
    const performerId = crypto.randomUUID();
    const investigationId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    try {
      await db.insert(users).values([
        { id: requesterId, email: `sanit-requester-${requesterId}@test.invalid`, passwordHash: "", name: "Requester", role: "INVESTIGATOR" },
        { id: performerId, email: `sanit-performer-${performerId}@test.invalid`, passwordHash: "", name: "Performer", role: "INVESTIGATOR" },
      ]);
      await db.insert(investigations).values({ id: investigationId, investigationNumber: `SAN-CERT-${jobId}`, title: "Sanitization certificate", description: "", createdBy: requesterId });
      await db.insert(operationAuthorizations).values({ id: authorizationId, investigationId, requestedBy: requesterId, approvedBy: requesterId, operationType: "SANITIZATION", reason: "test", status: "APPROVED" });
      const verificationDetails = { status: "VERIFIED", targetReference: "authoritative-fixture", actualState: "missing" };
      await db.insert(sanitization_jobs).values({ id: jobId, investigationId, authorizationId, requestedBy: requesterId, targetType: "FOLDER", targetReference: "authoritative-fixture", sanitizationMethod: "TEST_TRUNCATE", status: "VERIFYING", performerId, verificationStatus: "VERIFIED", verificationDetails });

      const { createSanitizationCertificate } = await import("./sanitizationCertificates");
      const certificate = await createSanitizationCertificate({ investigationId, sanitizationJobId: jobId, actorId: requesterId });
      const [storedJob] = await db.select().from(sanitization_jobs).where(eq(sanitization_jobs.id, jobId));
      const [storedCertificate] = await db.select().from(sanitization_certificates).where(eq(sanitization_certificates.id, certificate.id));
      expect(storedJob).toMatchObject({ status: "CERTIFICATE_READY", certificateId: certificate.id, performerId });
      expect(storedCertificate).toMatchObject({ sanitizationJobId: jobId, investigationId, performerId, targetReference: "authoritative-fixture", sanitizationMethod: "TEST_TRUNCATE", verificationDetails });
      expect((storedCertificate.payload as any).certificateId).toBe(certificate.id);
    } finally {
      await db.delete(auditEvents).where(eq(auditEvents.investigationId, investigationId));
      await db.delete(sanitization_certificates).where(eq(sanitization_certificates.investigationId, investigationId));
      await db.delete(sanitization_jobs).where(eq(sanitization_jobs.investigationId, investigationId));
      await db.delete(operationAuthorizations).where(eq(operationAuthorizations.investigationId, investigationId));
      await db.delete(investigations).where(eq(investigations.id, investigationId));
      await db.delete(users).where(inArray(users.id, [requesterId, performerId]));
    }
  });
});
