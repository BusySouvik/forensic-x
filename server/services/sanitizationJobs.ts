import { and, desc, eq, asc, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { getDb } from "../db";
import { auditEvents, evidenceRecords, investigations, operationAuthorizations, sanitization_jobs } from "../db/schema";
import type { SanitizationJobRow } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { getInvestigation } from "./investigations";

type SanitizationMethod = SanitizationJobRow["sanitizationMethod"];

export type SanitizationJobRecord = {
  id: string;
  investigationId: string;
  authorizationId: string;
  requestedBy: string;
  targetType: string;
  targetReference: string;
  targetStableIdentifier?: string | null;
  storageType?: string | null;
  sanitizationMethod: SanitizationMethod;
  status: SanitizationJobRow["status"];
  startedAt: Date | null;
  completedAt: Date | null;
  bytesAffected?: number | null;
  verificationStatus?: string | null;
  verificationHash?: string | null;
  verificationDetails?: Record<string, unknown>;
  certificateId?: string | null;
  failureReason?: string | null;
  performerId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface SanitizationJobRepository {
  getById(id: string): Promise<SanitizationJobRecord | null>;
  listForInvestigation(investigationId: string): Promise<SanitizationJobRecord[]>;
  findNextQueued(): Promise<SanitizationJobRecord | null>;
  findAndClaimNextQueued(workerId: string): Promise<SanitizationJobRecord | null>;
  cancelIfPending(id: string): Promise<SanitizationJobRecord | null>;
  insert(record: SanitizationJobRecord): Promise<SanitizationJobRecord>;
  update(record: SanitizationJobRecord): Promise<SanitizationJobRecord>;
  updateIfStatus(id: string, expectedStatuses: SanitizationJobRecord["status"] | SanitizationJobRecord["status"][], record: SanitizationJobRecord): Promise<SanitizationJobRecord | null>;
}

export type SanitizationJobServiceOptions = {
  repository: SanitizationJobRepository;
  auditLogger: (input: { actorId: string; investigationId: string; authorizationId?: string | null; sanitizationJobId?: string | null; eventType: string; result: string; details?: string | null }) => Promise<void>;
  getInvestigation?: (investigationId: string) => Promise<{ id: string } | null>;
  getAuthorizationById?: (id: string) => Promise<any | null>;
  validateTarget?: (targetRef: string) => Promise<boolean>;
};

export function createSanitizationJobService(options: SanitizationJobServiceOptions) {
  return new SanitizationJobService(options);
}

export class SanitizationJobService {
  constructor(private readonly options: SanitizationJobServiceOptions) {}

  private allowedTransitions: Record<string, Set<string>> = {
    AUTHORIZED: new Set(["QUEUED", "CANCELLED"]),
    QUEUED: new Set(["SANITIZING", "CANCELLED"]),
    SANITIZING: new Set(["VERIFYING", "SANITIZATION_FAILED", "TARGET_MISMATCH", "UNSUPPORTED_METHOD"]),
    VERIFYING: new Set(["CERTIFICATE_READY", "VERIFICATION_FAILED", "TARGET_MISMATCH"]),
    CERTIFICATE_READY: new Set(["COMPLETED", "CERTIFICATE_FAILED"]),
    // Terminal states have empty sets
    COMPLETED: new Set(),
    CANCELLED: new Set(),
    SANITIZATION_FAILED: new Set(),
    VERIFICATION_FAILED: new Set(),
    CERTIFICATE_FAILED: new Set(),
    TARGET_MISMATCH: new Set(),
    UNSUPPORTED_METHOD: new Set(),
  };

  private isAllowedTransition(from: string, to: string) {
    const allowed = this.allowedTransitions[from];
    return Boolean(allowed && allowed.has(to));
  }

  async getById(id: string) {
    const job = await this.options.repository.getById(id);
    if (!job) throw new HttpError(404, "Sanitization job not found");
    return job;
  }

  async listForInvestigation(investigationId: string) {
    return this.options.repository.listForInvestigation(investigationId);
  }

  async createSanitizationJob(input: {
    investigationId: string;
    authorizationId: string;
    requestedBy: string;
    targetType: string;
    targetReference: string;
    targetStableIdentifier?: string | null;
    storageType?: string | null;
    sanitizationMethod: SanitizationMethod;
  }) {
    await (this.options.getInvestigation ?? getInvestigation)(input.investigationId);

    const authorization = await (this.options.getAuthorizationById ?? (async (id: string) => {
      const db = getDb();
      const [row] = await db.select().from(operationAuthorizations).where(eq(operationAuthorizations.id, id)).limit(1);
      return row ?? null;
    }))(input.authorizationId);

    if (!authorization) throw new HttpError(404, "Authorization not found");
    if (authorization.investigationId !== input.investigationId) throw new HttpError(403, "Authorization does not belong to the investigation");
    if (authorization.operationType !== "SANITIZATION") throw new HttpError(403, "Authorization is not for sanitization");
    if (authorization.status !== "APPROVED") throw new HttpError(403, "Authorization is not approved");

    // Prevent duplicates
    const duplicate = await this.options.repository.listForInvestigation(input.investigationId);
    const hasActive = duplicate.some((j) => j.targetReference === input.targetReference && ["QUEUED", "AUTHORIZED", "SANITIZING", "VERIFYING"].includes(j.status));
    if (hasActive) throw new HttpError(409, "An active sanitization job already exists for this target");

    const job: SanitizationJobRecord = {
      id: cryptoRandomId(),
      investigationId: input.investigationId,
      authorizationId: input.authorizationId,
      requestedBy: input.requestedBy,
      targetType: input.targetType,
      targetReference: input.targetReference,
      targetStableIdentifier: input.targetStableIdentifier ?? null,
      storageType: input.storageType ?? null,
      sanitizationMethod: input.sanitizationMethod,
      status: "AUTHORIZED",
      startedAt: null,
      completedAt: null,
      bytesAffected: null,
      verificationStatus: null,
      verificationHash: null,
      failureReason: null,
      performerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const created = await this.options.repository.insert(job);

    await this.options.auditLogger({ actorId: input.requestedBy, investigationId: input.investigationId, authorizationId: input.authorizationId, sanitizationJobId: created.id, eventType: "REQUESTED", result: "SANITIZATION_REQUESTED", details: auditDetails(created, "state=AUTHORIZED; requester=" + input.requestedBy) });

    return created;
  }

  async claimNextQueuedJob(workerId: string) {
    // Atomically find and claim the next queued job for this worker.
    const claimed = await this.options.repository.findAndClaimNextQueued(workerId);
    if (!claimed) return null;
    // Record audit that the worker started processing
    await this.options.auditLogger({ actorId: workerId, investigationId: claimed.investigationId, authorizationId: claimed.authorizationId, sanitizationJobId: claimed.id, eventType: "STARTED", result: "SANITIZATION_STARTED", details: auditDetails(claimed, `state=SANITIZING; performer=${workerId}`) });
    return claimed;
  }

  async enqueueAuthorizedJob(jobId: string, actorId: string) {
    const job = await this.getById(jobId);
    if (job.status !== "AUTHORIZED") throw new HttpError(409, "Sanitization job is not awaiting execution");
    const authorization = await (this.options.getAuthorizationById ?? (async (id: string) => {
      const db = getDb();
      const [row] = await db.select().from(operationAuthorizations).where(eq(operationAuthorizations.id, id)).limit(1);
      return row ?? null;
    }))(job.authorizationId);
    if (!authorization || authorization.investigationId !== job.investigationId || authorization.operationType !== "SANITIZATION" || authorization.status !== "APPROVED") throw new HttpError(403, "Sanitization authorization is no longer valid");
    if (!this.isAllowedTransition(job.status, "QUEUED")) throw new HttpError(409, `Invalid state transition ${job.status} -> QUEUED`);
    const updated = { ...job, status: "QUEUED", updatedAt: new Date() } as SanitizationJobRecord;
    const out = await this.options.repository.updateIfStatus(job.id, job.status, updated);
    if (!out) throw new HttpError(409, "Sanitization job changed before it could be queued");
    await this.options.auditLogger({ actorId, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType: "AUTHORIZED", result: "SUCCESS", details: `job=${out.id}; queued-for-agent` });
    return out;
  }

  async cancelJob(jobId: string, actorId: string) {
    const job = await this.getById(jobId);
    const out = await this.options.repository.cancelIfPending(jobId);
    if (!out) throw new HttpError(409, "Sanitization job cannot be safely cancelled after execution has begun");
    await this.options.auditLogger({ actorId, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType: "CANCELLED", result: "SUCCESS", details: `job=${out.id}` });
    return out;
  }

  async setStatus(jobId: string, status: string, details?: string, actorId?: string) {
    const job = await this.getById(jobId);
    if (!this.isAllowedTransition(job.status, status)) throw new HttpError(409, `Invalid state transition ${job.status} -> ${status}`);
    const updated = { ...job, status, updatedAt: new Date() } as SanitizationJobRecord;
    const out = await this.options.repository.updateIfStatus(job.id, job.status, updated);
    if (!out) throw new HttpError(409, "Sanitization job changed before status could be updated");
    const actor = actorId ?? out.performerId ?? job.requestedBy;
    const eventType = status === "SANITIZING" || status === "VERIFYING" ? "STARTED" : "AUTHORIZED";
    const result = status === "VERIFYING" ? "SANITIZATION_VERIFICATION_STARTED" : status;
    await this.options.auditLogger({ actorId: actor, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType, result, details: auditDetails(out, `state=${status}; performer=${out.performerId ?? actor}; ${details ?? ""}`) });
    return out;
  }

  async recordVerificationPassed(jobId: string, result: { bytesAffected?: number | null; verificationDetails: Record<string, unknown>; performerId: string }) {
    const job = await this.getById(jobId);
    if (job.status !== "VERIFYING") throw new HttpError(409, "Sanitization job is not verifying");
    const updated = { ...job, bytesAffected: result.bytesAffected ?? null, verificationStatus: "VERIFIED", verificationDetails: result.verificationDetails, performerId: job.performerId ?? result.performerId, updatedAt: new Date() } as SanitizationJobRecord;
    const out = await this.options.repository.updateIfStatus(job.id, job.status, updated);
    if (!out) throw new HttpError(409, "Sanitization job changed before verification could be recorded");
    const actor = out.performerId ?? result.performerId ?? job.requestedBy;
    await this.options.auditLogger({ actorId: actor, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType: "COMPLETED", result: "SANITIZATION_VERIFICATION_COMPLETED", details: auditDetails(out, `state=VERIFYING; verification=VERIFIED; performer=${out.performerId ?? result.performerId}`) });
    return out;
  }

  async completeJob(jobId: string, result: { bytesAffected?: number | null; verificationStatus?: string | null; verificationHash?: string | null; verificationDetails?: Record<string, unknown>; performerId?: string | null }) {
    const job = await this.getById(jobId);
    if (!this.isAllowedTransition(job.status, "COMPLETED")) throw new HttpError(409, `Invalid state transition ${job.status} -> COMPLETED`);
    const updated = { ...job, status: "COMPLETED", completedAt: new Date(), verificationStatus: result.verificationStatus ?? null, verificationHash: result.verificationHash ?? null, verificationDetails: result.verificationDetails ?? {}, bytesAffected: result.bytesAffected ?? null, performerId: result.performerId ?? null, updatedAt: new Date() } as SanitizationJobRecord;
    const out = await this.options.repository.updateIfStatus(job.id, job.status, updated);
    if (!out) throw new HttpError(409, "Sanitization job changed before it could be completed");
    const actor = out.performerId ?? result.performerId ?? job.requestedBy;
    await this.options.auditLogger({ actorId: actor, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType: "COMPLETED", result: "SANITIZATION_COMPLETED", details: auditDetails(out, `state=COMPLETED; certificate=${out.certificateId}; performer=${out.performerId ?? result.performerId ?? "none"}`) });
    return out;
  }

  async completeCertifiedJob(jobId: string, certificateId: string, performerId?: string) {
    const job = await this.getById(jobId);
    if (!this.isAllowedTransition(job.status, "COMPLETED")) throw new HttpError(409, `Invalid state transition ${job.status} -> COMPLETED`);
    const updated = { ...job, status: "COMPLETED", completedAt: new Date(), performerId: job.performerId ?? performerId ?? null, updatedAt: new Date() } as SanitizationJobRecord;
    const out = await this.options.repository.updateIfStatus(job.id, job.status, updated);
    if (!out) throw new HttpError(409, "Sanitization job changed before it could be completed");
    const actor = out.performerId ?? performerId ?? job.requestedBy;
    await this.options.auditLogger({ actorId: actor, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType: "COMPLETED", result: "SANITIZATION_COMPLETED", details: auditDetails(out, `state=COMPLETED; certificate=${certificateId}; performer=${out.performerId ?? performerId ?? "none"}`) });
    return out;
  }

  async failJob(jobId: string, message: string, performerId?: string) {
    const job = await this.getById(jobId);
    if (!this.isAllowedTransition(job.status, "SANITIZATION_FAILED")) throw new HttpError(409, `Invalid state transition ${job.status} -> SANITIZATION_FAILED`);
    const updated = { ...job, status: "SANITIZATION_FAILED", failureReason: message, completedAt: new Date(), performerId: job.performerId ?? performerId ?? null, updatedAt: new Date() } as SanitizationJobRecord;
    const out = await this.options.repository.updateIfStatus(job.id, job.status, updated);
    if (!out) throw new HttpError(409, "Sanitization job changed before it could be failed");
    const actor = out.performerId ?? performerId ?? job.requestedBy;
    await this.options.auditLogger({ actorId: actor, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType: "FAILED", result: "SANITIZATION_FAILED", details: auditDetails(out, `state=SANITIZATION_FAILED; reason=${message}; performer=${out.performerId ?? "none"}`) });
    return out;
  }

  async failVerification(jobId: string, details: Record<string, unknown>, performerId?: string) {
    const job = await this.getById(jobId);
    const failureReason = typeof details.failureReason === "string" ? details.failureReason : "Post-sanitization verification failed";
    if (!this.isAllowedTransition(job.status, "VERIFICATION_FAILED")) throw new HttpError(409, `Invalid state transition ${job.status} -> VERIFICATION_FAILED`);
    const updated = { ...job, status: "VERIFICATION_FAILED", verificationStatus: "FAILED", verificationDetails: details, failureReason, completedAt: new Date(), performerId: job.performerId ?? performerId ?? null, updatedAt: new Date() } as SanitizationJobRecord;
    const out = await this.options.repository.updateIfStatus(job.id, job.status, updated);
    if (!out) throw new HttpError(409, "Sanitization job changed before verification failure could be recorded");
    const actor = out.performerId ?? performerId ?? job.requestedBy;
    await this.options.auditLogger({ actorId: actor, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType: "FAILED", result: "SANITIZATION_VERIFICATION_FAILED", details: auditDetails(out, `state=VERIFICATION_FAILED; reason=${failureReason}; performer=${out.performerId ?? "none"}`) });
    return out;
  }
  async failCertificate(jobId: string, message: string, performerId?: string) {
    const job = await this.getById(jobId);
    if (!this.isAllowedTransition(job.status, "CERTIFICATE_FAILED")) throw new HttpError(409, `Invalid state transition ${job.status} -> CERTIFICATE_FAILED`);
    const updated = { ...job, status: "CERTIFICATE_FAILED", failureReason: message, completedAt: new Date(), performerId: job.performerId ?? performerId ?? null, updatedAt: new Date() } as SanitizationJobRecord;
    const out = await this.options.repository.updateIfStatus(job.id, job.status, updated);
    if (!out) throw new HttpError(409, "Sanitization job changed before certificate failure could be recorded");
    const actor = out.performerId ?? performerId ?? job.requestedBy;
    await this.options.auditLogger({ actorId: actor, investigationId: out.investigationId, authorizationId: out.authorizationId, sanitizationJobId: out.id, eventType: "FAILED", result: "SANITIZATION_CERTIFICATE_FAILED", details: auditDetails(out, `state=CERTIFICATE_FAILED; reason=${message}; performer=${out.performerId ?? "none"}`) });
    return out;
  }
}

export class DrizzleSanitizationJobRepository implements SanitizationJobRepository {
  async getById(id: string) {
    const db = getDb();
    const [row] = await db.select().from(sanitization_jobs).where(eq(sanitization_jobs.id, id)).limit(1);
    if (!row) return null;
    return fromRow(row);
  }

  async listForInvestigation(investigationId: string) {
    const db = getDb();
    const rows = await db.select().from(sanitization_jobs).where(eq(sanitization_jobs.investigationId, investigationId)).orderBy(desc(sanitization_jobs.createdAt));
    return rows.map(fromRow);
  }

  async findNextQueued() {
    const db = getDb();
    const [row] = await db.select().from(sanitization_jobs).where(eq(sanitization_jobs.status, "QUEUED")).orderBy(asc(sanitization_jobs.createdAt)).limit(1);
    return row ? fromRow(row) : null;
  }

  async findAndClaimNextQueued(workerId: string) {
    const db = getDb();
    return db.transaction(async (tx) => {
      // Lock one queued row until its state change commits. SKIP LOCKED lets a
      // concurrent worker continue looking for other queued work instead of
      // observing or waiting on this claim.
      const [queued] = await tx
        .select()
        .from(sanitization_jobs)
        .where(eq(sanitization_jobs.status, "QUEUED"))
        .orderBy(asc(sanitization_jobs.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });

      if (!queued) return null;

      const now = new Date();
      const [claimed] = await tx
        .update(sanitization_jobs)
        .set({
          status: "SANITIZING",
          performerId: workerId,
          startedAt: now,
          updatedAt: now,
        })
        // Keep the state predicate as a defense in depth check: only a queued
        // row can ever be returned from a claim operation.
        .where(and(eq(sanitization_jobs.id, queued.id), eq(sanitization_jobs.status, "QUEUED")))
        .returning();

      return claimed ? fromRow(claimed) : null;
    });
  }

  async cancelIfPending(id: string) {
    const db = getDb();
    const now = new Date();
    const [cancelled] = await db
      .update(sanitization_jobs)
      .set({ status: "CANCELLED", completedAt: now, updatedAt: now })
      .where(and(eq(sanitization_jobs.id, id), inArray(sanitization_jobs.status, ["AUTHORIZED", "QUEUED"])))
      .returning();
    return cancelled ? fromRow(cancelled) : null;
  }

  async insert(record: SanitizationJobRecord) {
    const db = getDb();
    const [row] = await db.insert(sanitization_jobs).values(toRow(record)).returning();
    if (!row) throw new HttpError(500, "Failed to create sanitization job");
    return fromRow(row);
  }

  async update(record: SanitizationJobRecord) {
    const db = getDb();
    const [row] = await db.update(sanitization_jobs).set(toRow(record)).where(eq(sanitization_jobs.id, record.id)).returning();
    if (!row) throw new HttpError(500, "Failed to update sanitization job");
    return fromRow(row);
  }

  async updateIfStatus(id: string, expectedStatuses: SanitizationJobRecord["status"] | SanitizationJobRecord["status"][], record: SanitizationJobRecord) {
    const db = getDb();
    const expected: SanitizationJobRecord["status"][] = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
    let res;
    if (expected.length === 1) {
      const [row] = await db.update(sanitization_jobs).set(toRow(record)).where(and(eq(sanitization_jobs.id, id), eq(sanitization_jobs.status, expected[0]))).returning();
      res = row;
    } else {
      const [row] = await db.update(sanitization_jobs).set(toRow(record)).where(and(eq(sanitization_jobs.id, id), inArray(sanitization_jobs.status, expected))).returning();
      res = row;
    }
    return res ? fromRow(res) : null;
  }
}

function toRow(record: SanitizationJobRecord) {
  return {
    id: record.id,
    investigationId: record.investigationId,
    authorizationId: record.authorizationId,
    requestedBy: record.requestedBy,
    targetType: record.targetType,
    targetReference: record.targetReference,
    targetStableIdentifier: record.targetStableIdentifier,
    storageType: record.storageType,
    sanitizationMethod: record.sanitizationMethod,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    bytesAffected: record.bytesAffected ?? null,
    verificationStatus: record.verificationStatus ?? null,
    verificationHash: record.verificationHash ?? null,
    verificationDetails: record.verificationDetails ?? {},
    certificateId: record.certificateId ?? null,
    failureReason: record.failureReason ?? null,
    performerId: record.performerId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromRow(row: any): SanitizationJobRecord {
  return {
    id: row.id,
    investigationId: row.investigationId,
    authorizationId: row.authorizationId,
    requestedBy: row.requestedBy,
    targetType: row.targetType,
    targetReference: row.targetReference,
    targetStableIdentifier: row.targetStableIdentifier,
    storageType: row.storageType,
    sanitizationMethod: row.sanitizationMethod,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    bytesAffected: row.bytesAffected ?? null,
    verificationStatus: row.verificationStatus ?? null,
    verificationHash: row.verificationHash ?? null,
    verificationDetails: row.verificationDetails ?? {},
    certificateId: row.certificateId ?? null,
    failureReason: row.failureReason ?? null,
    performerId: row.performerId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function cryptoRandomId() {
  return crypto.randomUUID();
}

function auditDetails(job: SanitizationJobRecord, result: string) {
  return `job=${job.id}; investigation=${job.investigationId}; targetType=${job.targetType}; target=${job.targetReference}; method=${job.sanitizationMethod}; ${result}`;
}

export async function logSanitizationJobAudit(input: { actorId: string; investigationId: string; authorizationId?: string | null; sanitizationJobId?: string | null; eventType: string; result: string; details?: string | null; }) {
  const db = getDb();
  await db.insert(auditEvents).values({ investigationId: input.investigationId, authorizationId: input.authorizationId ?? null, actorId: input.actorId, eventType: input.eventType as any, result: input.result, details: input.details ?? null });
}
