import { createHash } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { acquisitionJobs, auditEvents, evidenceRecords } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { getEvidenceStorageService } from "./evidenceStorage";
import { assertDeviceInInvestigation } from "./devices";
import { getInvestigation } from "./investigations";
import type { AcquisitionStatus, AcquisitionSourceType } from "../../shared/types";
import { getDb as getDbModule } from "../db";

export type AcquisitionJobRecord = {
  id: string;
  investigationId: string;
  deviceId: string | null;
  requestedBy: string;
  authorizationId: string;
  status: AcquisitionStatus;
  sourceType: AcquisitionSourceType;
  sourceIdentifier: string;
  outputStorageObjectId: string | null;
  sha256: string | null;
  size: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface AcquisitionRepository {
  getById(id: string): Promise<AcquisitionJobRecord | null>;
  listForInvestigation(investigationId: string): Promise<AcquisitionJobRecord[]>;
  findNextQueued(): Promise<AcquisitionJobRecord | null>;
  insert(job: AcquisitionJobRecord): Promise<AcquisitionJobRecord>;
  update(job: AcquisitionJobRecord): Promise<AcquisitionJobRecord>;
}

export type AcquisitionJobInput = {
  investigationId: string;
  deviceId?: string | null;
  requestedBy: string;
  authorizationId: string;
  sourceType: AcquisitionSourceType;
  sourceIdentifier: string;
};

export type AcquisitionAdapterLike = {
  acquire(sourceIdentifier: string): Promise<{
    sourceType: AcquisitionSourceType;
    sourceIdentifier: string;
    sourcePath: string;
    sha256: string;
    size: number;
    bytes: Buffer;
    contentType: string;
    metadata?: Record<string, string | number | boolean | null>;
  }>;
};

export type AcquisitionAuditLogger = (input: {
  actorId: string;
  investigationId: string;
  deviceId?: string | null;
  acquisitionJobId?: string | null;
  authorizationId?: string | null;
  eventType: string;
  result: string;
  details?: string | null;
}) => Promise<void>;

export type AcquisitionServiceOptions = {
  repository: AcquisitionRepository;
  evidenceStorage?: ReturnType<typeof getEvidenceStorageService>;
  acquisitionAdapter: AcquisitionAdapterLike;
  auditLogger: AcquisitionAuditLogger;
  validateInvestigation?: (investigationId: string) => Promise<unknown>;
  validateDevice?: (deviceId: string, investigationId: string) => Promise<unknown>;
  createEvidenceRecord?: (input: {
    investigationId: string;
    deviceId: string | null;
    acquisitionJobId: string;
    masterStorageObjectId: string;
    sha256: string;
    size: number;
  }) => Promise<{ id: string; [key: string]: unknown }>;
};

export class DrizzleAcquisitionRepository implements AcquisitionRepository {
  async getById(id: string) {
    const db = getDb();
    const [row] = await db.select().from(acquisitionJobs).where(eq(acquisitionJobs.id, id)).limit(1);
    if (!row) return null;
    return fromRow(row);
  }

  async listForInvestigation(investigationId: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(acquisitionJobs)
      .where(eq(acquisitionJobs.investigationId, investigationId))
      .orderBy(desc(acquisitionJobs.createdAt));
    return rows.map(fromRow);
  }

  async findNextQueued() {
    const db = getDb();
    const [row] = await db
      .select()
      .from(acquisitionJobs)
      .where(eq(acquisitionJobs.status, "QUEUED"))
      .orderBy(asc(acquisitionJobs.createdAt))
      .limit(1);
    return row ? fromRow(row) : null;
  }

  async insert(job: AcquisitionJobRecord) {
    const db = getDb();
    const [row] = await db.insert(acquisitionJobs).values(toRow(job)).returning();
    if (!row) {
      throw new HttpError(500, "Failed to create acquisition job");
    }
    return fromRow(row);
  }

  async update(job: AcquisitionJobRecord) {
    const db = getDb();
    const [row] = await db
      .update(acquisitionJobs)
      .set(toRow(job))
      .where(eq(acquisitionJobs.id, job.id))
      .returning();
    if (!row) {
      throw new HttpError(500, "Failed to update acquisition job");
    }
    return fromRow(row);
  }
}

function toRow(job: AcquisitionJobRecord) {
  return {
    id: job.id,
    investigationId: job.investigationId,
    deviceId: job.deviceId,
    requestedBy: job.requestedBy,
    authorizationId: job.authorizationId,
    status: job.status,
    sourceType: job.sourceType,
    sourceIdentifier: job.sourceIdentifier,
    outputStorageObjectId: job.outputStorageObjectId,
    sha256: job.sha256,
    size: job.size,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function fromRow(row: {
  id: string;
  investigationId: string;
  deviceId: string | null;
  requestedBy: string;
  authorizationId: string;
  status: AcquisitionStatus;
  sourceType: AcquisitionSourceType;
  sourceIdentifier: string;
  outputStorageObjectId: string | null;
  sha256: string | null;
  size: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AcquisitionJobRecord {
  return {
    id: row.id,
    investigationId: row.investigationId,
    deviceId: row.deviceId,
    requestedBy: row.requestedBy,
    authorizationId: row.authorizationId,
    status: row.status,
    sourceType: row.sourceType,
    sourceIdentifier: row.sourceIdentifier,
    outputStorageObjectId: row.outputStorageObjectId,
    sha256: row.sha256,
    size: row.size,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createAcquisitionService(options: AcquisitionServiceOptions) {
  return new AcquisitionService(options);
}

export class AcquisitionService {
  constructor(private readonly options: AcquisitionServiceOptions) {}

  async getById(id: string) {
    const job = await this.options.repository.getById(id);
    if (!job) {
      throw new HttpError(404, "Acquisition job not found");
    }
    return job;
  }

  async listForInvestigation(investigationId: string) {
    return this.options.repository.listForInvestigation(investigationId);
  }

  async claimNextQueuedJob(workerId = "default-worker") {
    const job = await this.options.repository.findNextQueued();
    if (!job) {
      return null;
    }

    const claimed = await this.options.repository.update({
      ...job,
      status: "VALIDATING",
      startedAt: job.startedAt ?? new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    });

    await this.options.auditLogger({
      actorId: job.requestedBy,
      investigationId: claimed.investigationId,
      deviceId: claimed.deviceId,
      acquisitionJobId: claimed.id,
      authorizationId: claimed.authorizationId,
      eventType: "STARTED",
      result: "SUCCESS",
      details: `Queued job claimed by worker ${workerId}`,
    });
    return claimed;
  }

  async claimJob(jobId: string, workerId = "default-worker") {
    const job = await this.getById(jobId);
    if (job.status !== "QUEUED") {
      throw new HttpError(409, "Job is not queued for claiming");
    }

    const claimed = await this.options.repository.update({
      ...job,
      status: "VALIDATING",
      startedAt: job.startedAt ?? new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    });

    await this.options.auditLogger({
      actorId: job.requestedBy,
      investigationId: claimed.investigationId,
      deviceId: claimed.deviceId,
      acquisitionJobId: claimed.id,
      authorizationId: claimed.authorizationId,
      eventType: "STARTED",
      result: "SUCCESS",
      details: `Job claimed by worker ${workerId}`,
    });
    return claimed;
  }

  async createJob(input: AcquisitionJobInput): Promise<AcquisitionJobRecord> {
    await (this.options.validateInvestigation ?? getInvestigation)(input.investigationId);
    if (input.deviceId) {
      await (this.options.validateDevice ?? assertDeviceInInvestigation)(input.deviceId, input.investigationId);
    }
    await this.ensureSingleMasterAcquisition(input);

    const now = new Date();
    const job: AcquisitionJobRecord = {
      id: cryptoRandomId(),
      investigationId: input.investigationId,
      deviceId: input.deviceId ?? null,
      requestedBy: input.requestedBy,
      authorizationId: input.authorizationId,
      status: "QUEUED",
      sourceType: input.sourceType,
      sourceIdentifier: input.sourceIdentifier,
      outputStorageObjectId: null,
      sha256: null,
      size: null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.options.repository.insert(job);
    await this.options.auditLogger({
      actorId: input.requestedBy,
      investigationId: input.investigationId,
      deviceId: input.deviceId ?? null,
      acquisitionJobId: created.id,
      authorizationId: input.authorizationId,
      eventType: "REQUESTED",
      result: "SUCCESS",
      details: `Acquisition queued for ${input.sourceType}`,
    });
    return created;
  }

  async setStatus(jobId: string, status: AcquisitionStatus, details?: string) {
    const job = await this.getById(jobId);
    const next: AcquisitionJobRecord = {
      ...job,
      status,
      startedAt: job.startedAt ?? (status !== "QUEUED" ? new Date() : null),
      updatedAt: new Date(),
      errorMessage: status === "FAILED" ? job.errorMessage : null,
    };
    const updated = await this.options.repository.update(next);
    if (details) {
      await this.options.auditLogger({
        actorId: job.requestedBy,
        investigationId: updated.investigationId,
        deviceId: updated.deviceId,
        acquisitionJobId: updated.id,
        authorizationId: updated.authorizationId,
        eventType: status,
        result: status === "FAILED" ? "ERROR" : "SUCCESS",
        details,
      });
    }
    return updated;
  }

  async runJob(jobId: string) {
    const job = await this.getById(jobId);
    if (job.status !== "VALIDATING" && job.status !== "QUEUED") {
      throw new HttpError(409, "Invalid acquisition state transition");
    }

    const next: AcquisitionJobRecord = {
      ...job,
      status: "ACQUIRING",
      startedAt: job.startedAt ?? new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    };
    const running = await this.options.repository.update(next);
    await this.options.auditLogger({
      actorId: job.requestedBy,
      investigationId: running.investigationId,
      deviceId: running.deviceId,
      acquisitionJobId: running.id,
      authorizationId: running.authorizationId,
      eventType: "STARTED",
      result: "SUCCESS",
      details: "Acquisition engine started",
    });
    return running;
  }

  async completeJob(
    jobId: string,
    request: { sourceType: AcquisitionSourceType; sourceIdentifier: string },
    acquiredImage?: {
      sourceType: AcquisitionSourceType;
      sourceIdentifier: string;
      sourcePath: string;
      sha256: string;
      size: number;
      bytes: Buffer;
      contentType: string;
      metadata?: Record<string, string | number | boolean | null>;
    },
  ) {
    const job = await this.getById(jobId);
    if (!(["VALIDATING", "ACQUIRING", "VERIFYING", "UPLOADING"] as const).includes(job.status as any)) {
      throw new HttpError(409, "Invalid acquisition state transition");
    }

    const duplicate = await this.findExistingMasterAcquisition({
      investigationId: job.investigationId,
      deviceId: job.deviceId,
      sourceIdentifier: request.sourceIdentifier,
      currentJobId: job.id,
    });
    if (duplicate) {
      throw new HttpError(409, "A master acquisition already exists for this investigation and source");
    }

    const acquired = acquiredImage ?? (await this.options.acquisitionAdapter.acquire(request.sourceIdentifier));
    const sha256 = createHash("sha256").update(acquired.bytes).digest("hex");
    if (sha256 !== acquired.sha256) {
      throw new HttpError(500, "Hash mismatch during acquisition");
    }

    const storage = this.options.evidenceStorage ?? getEvidenceStorageService();
    const record = await storage.upload({
      storageClass: "FORENSIC_IMAGE",
      filename: `acquisition-${jobId}.img`,
      body: acquired.bytes,
      contentType: acquired.contentType,
      investigationId: job.investigationId,
      evidenceId: null,
    });

    const evidence = await (this.options.createEvidenceRecord ?? this.createEvidenceRecord.bind(this))({
      investigationId: job.investigationId,
      deviceId: job.deviceId,
      acquisitionJobId: job.id,
      masterStorageObjectId: record.id,
      sha256,
      size: acquired.size,
    });

    // Record ledger acquisition event (idempotent)
    try {
      const ledger = await import("./ledger");
      await ledger.recordAcquisitionEvent({
        investigationId: job.investigationId,
        evidenceId: evidence.id,
        acquisitionJobId: job.id,
        deviceId: job.deviceId,
        masterSha256: sha256,
        masterSize: acquired.size,
        actorId: job.requestedBy,
        authorizationId: job.authorizationId,
      });
    } catch (e) {
      // Do not prevent acquisition completion if ledger service fails; log audit and continue
      await this.options.auditLogger({
        actorId: job.requestedBy,
        investigationId: job.investigationId,
        deviceId: job.deviceId,
        acquisitionJobId: job.id,
        authorizationId: job.authorizationId,
        eventType: "LEDGER",
        result: "ERROR",
        details: String(e),
      });
    }

    const next: AcquisitionJobRecord = {
      ...job,
      status: "COMPLETED",
      outputStorageObjectId: record.id,
      sha256,
      size: acquired.size,
      completedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    };

    const completed = await this.options.repository.update(next);
    await this.options.auditLogger({
      actorId: job.requestedBy,
      investigationId: completed.investigationId,
      deviceId: completed.deviceId,
      acquisitionJobId: completed.id,
      authorizationId: completed.authorizationId,
      eventType: "COMPLETED",
      result: "SUCCESS",
      details: `Acquisition completed: ${completed.sha256}`,
    });

    return {
      ...completed,
      evidenceId: evidence.id,
      storageObjectId: record.id,
    };
  }

  async failJob(jobId: string, errorMessage: string) {
    const job = await this.getById(jobId);
    if (job.status === "COMPLETED" || job.status === "CANCELLED") {
      throw new HttpError(409, "Invalid acquisition state transition");
    }

    const failed = await this.options.repository.update({
      ...job,
      status: "FAILED",
      errorMessage,
      updatedAt: new Date(),
    });
    await this.options.auditLogger({
      actorId: job.requestedBy,
      investigationId: failed.investigationId,
      deviceId: failed.deviceId,
      acquisitionJobId: failed.id,
      authorizationId: failed.authorizationId,
      eventType: "FAILED",
      result: "ERROR",
      details: errorMessage,
    });
    return failed;
  }

  async cancelJob(jobId: string, actorId: string) {
    const job = await this.getById(jobId);
    if (!(["QUEUED", "VALIDATING", "ACQUIRING", "VERIFYING", "UPLOADING"] as const).includes(job.status as any)) {
      throw new HttpError(409, "Invalid acquisition state transition");
    }

    const cancelled = await this.options.repository.update({
      ...job,
      status: "CANCELLED",
      updatedAt: new Date(),
    });
    await this.options.auditLogger({
      actorId,
      investigationId: cancelled.investigationId,
      deviceId: cancelled.deviceId,
      acquisitionJobId: cancelled.id,
      authorizationId: cancelled.authorizationId,
      eventType: "CANCELLED",
      result: "CANCELLED",
      details: "Acquisition cancelled",
    });
    return cancelled;
  }

  async createEvidenceRecord(input: {
    investigationId: string;
    deviceId: string | null;
    acquisitionJobId: string;
    masterStorageObjectId: string;
    sha256: string;
    size: number;
  }) {
    const existing = await this.findExistingMasterEvidence(input.investigationId, input.deviceId, input.acquisitionJobId);
    if (existing) {
      throw new HttpError(409, "Master evidence already exists for this investigation and device");
    }

    const db = getDb();
    const [row] = await db
      .insert(evidenceRecords)
      .values({
        investigationId: input.investigationId,
        deviceId: input.deviceId,
        acquisitionJobId: input.acquisitionJobId,
        masterStorageObjectId: input.masterStorageObjectId,
        sha256: input.sha256,
        size: input.size,
        status: "AVAILABLE",
      })
      .returning();
    if (!row) {
      throw new HttpError(500, "Failed to create evidence record");
    }
    return row;
  }

  private async ensureSingleMasterAcquisition(input: AcquisitionJobInput) {
    const existing = await this.findExistingMasterAcquisition({
      investigationId: input.investigationId,
      deviceId: input.deviceId ?? null,
      sourceIdentifier: input.sourceIdentifier,
    });
    if (existing) {
      throw new HttpError(409, "A master acquisition already exists for this investigation and source");
    }
  }

  private async findExistingMasterAcquisition(input: {
    investigationId: string;
    deviceId: string | null;
    sourceIdentifier: string;
    currentJobId?: string;
  }) {
    const jobs = await this.options.repository.listForInvestigation(input.investigationId);
    return jobs.find((job) => {
      if (input.currentJobId && job.id === input.currentJobId) {
        return false;
      }
      const sameSource = job.sourceIdentifier === input.sourceIdentifier;
      const sameDevice = Boolean(input.deviceId && job.deviceId === input.deviceId);
      if (!sameSource && !sameDevice) {
        return false;
      }
      return ["VALIDATING", "ACQUIRING", "VERIFYING", "UPLOADING", "COMPLETED"].includes(job.status);
    });
  }

  private async findExistingMasterEvidence(investigationId: string, deviceId: string | null, currentJobId: string) {
    const db = getDb();
    const rows = await db.select().from(evidenceRecords).where(eq(evidenceRecords.investigationId, investigationId));
    return rows.find((row) => {
      if (row.acquisitionJobId === currentJobId) {
        return false;
      }
      if (deviceId && row.deviceId === deviceId) {
        return true;
      }
      return row.status === "AVAILABLE";
    });
  }
}

export function getDefaultAcquisitionRepository() {
  return new DrizzleAcquisitionRepository();
}

function cryptoRandomId() {
  return crypto.randomUUID();
}

export async function logAcquisitionAudit(input: {
  actorId: string;
  investigationId: string;
  deviceId?: string | null;
  acquisitionJobId?: string | null;
  authorizationId?: string | null;
  eventType: string;
  result: string;
  details?: string | null;
}) {
  const db = getDbModule();
  await db.insert(auditEvents).values({
    investigationId: input.investigationId,
    deviceId: input.deviceId ?? null,
    acquisitionJobId: input.acquisitionJobId ?? null,
    authorizationId: input.authorizationId ?? null,
    actorId: input.actorId,
    eventType: input.eventType as any,
    result: input.result,
    details: input.details ?? null,
  });
}

export async function getAcquisitionById(id: string) {
  return getDefaultAcquisitionRepository().getById(id);
}

export async function listAcquisitionsForInvestigation(investigationId: string) {
  return getDefaultAcquisitionRepository().listForInvestigation(investigationId);
}
