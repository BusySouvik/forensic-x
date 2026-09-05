import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { auditEvents, evidenceRecords, investigations, operationAuthorizations, recoveryJobs, workingCopies } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import type { RecoveryEngine, RecoveryJobStatus, RecoveryMethod } from "../../shared/types";

export type RecoveryJobRecord = {
  id: string;
  investigationId: string;
  workingCopyId: string;
  masterEvidenceId: string;
  requestedBy: string;
  authorizationId: string;
  status: RecoveryJobStatus;
  method: RecoveryMethod;
  engine: RecoveryEngine;
  config: Record<string, unknown>;
  outputLocation: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface RecoveryJobRepository {
  getById(id: string): Promise<RecoveryJobRecord | null>;
  listForInvestigation(investigationId: string): Promise<RecoveryJobRecord[]>;
  findNextQueued(): Promise<RecoveryJobRecord | null>;
  insert(record: RecoveryJobRecord): Promise<RecoveryJobRecord>;
  update(record: RecoveryJobRecord): Promise<RecoveryJobRecord>;
}

export type RecoveryJobServiceOptions = {
  repository: RecoveryJobRepository;
  auditLogger: (input: {
    actorId: string;
    investigationId: string;
    authorizationId?: string | null;
    recoveryJobId?: string | null;
    eventType: string;
    result: string;
    details?: string | null;
  }) => Promise<void>;
  getInvestigation?: (investigationId: string) => Promise<{ id: string } | null>;
  getWorkingCopyById?: (id: string) => Promise<WorkingCopyContext | null>;
  getAuthorizationById?: (id: string) => Promise<AuthorizationContext | null>;
  getMasterEvidenceById?: (id: string) => Promise<MasterEvidenceContext | null>;
};

export type WorkingCopyContext = {
  id: string;
  investigationId: string;
  masterEvidenceId: string;
  storageObjectId: string;
  status: "QUEUED" | "CREATING" | "VERIFYING" | "COMPLETED" | "FAILED";
  investigatorId: string;
  authorizationId: string;
};

export type AuthorizationContext = {
  id: string;
  investigationId: string;
  requestedBy: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "REVOKED";
  operationType: "ACQUISITION" | "RECOVERY" | "EXAMINATION" | "SANITIZATION" | "EXPORT" | "OTHER";
};

export type MasterEvidenceContext = {
  id: string;
  investigationId: string;
  masterStorageObjectId: string;
  sha256: string | null;
  status: "AVAILABLE" | "REJECTED";
};

export function createRecoveryJobService(options: RecoveryJobServiceOptions) {
  return new RecoveryJobService(options);
}

export class RecoveryJobService {
  constructor(private readonly options: RecoveryJobServiceOptions) {}

  async getById(id: string) {
    const job = await this.options.repository.getById(id);
    if (!job) {
      throw new HttpError(404, "Recovery job not found");
    }
    return job;
  }

  async listForInvestigation(investigationId: string) {
    return this.options.repository.listForInvestigation(investigationId);
  }

  async createRecoveryJob(input: {
    investigationId: string;
    workingCopyId: string;
    requestedBy: string;
    authorizationId: string;
    method: RecoveryMethod;
    engine: RecoveryEngine;
    config?: Record<string, unknown>;
  }) {
    validateRecoveryInputs(input.method, input.engine, input.config);

    await (this.options.getInvestigation ?? getInvestigation)(input.investigationId);

    const masterEvidenceById = await (this.options.getMasterEvidenceById ?? getMasterEvidenceById)(input.workingCopyId);
    if (masterEvidenceById) {
      throw new HttpError(400, "Master evidence cannot be used as a recovery source");
    }

    const workingCopy = await (this.options.getWorkingCopyById ?? getWorkingCopyById)(input.workingCopyId);
    if (!workingCopy) {
      throw new HttpError(404, "Working copy not found");
    }
    if (workingCopy.investigationId !== input.investigationId) {
      throw new HttpError(403, "Working copy does not belong to the investigation");
    }
    if (workingCopy.status !== "COMPLETED") {
      throw new HttpError(409, "Working copy is not ready for recovery");
    }
    if (workingCopy.storageObjectId === "") {
      throw new HttpError(400, "Working copy storage object is missing");
    }

    const authorization = await (this.options.getAuthorizationById ?? getAuthorizationById)(input.authorizationId);
    if (!authorization) {
      throw new HttpError(404, "Authorization not found");
    }
    if (authorization.investigationId !== input.investigationId) {
      throw new HttpError(403, "Authorization does not belong to the investigation");
    }
    if (authorization.operationType !== "RECOVERY") {
      throw new HttpError(403, "Authorization is not for recovery");
    }
    if (authorization.status !== "APPROVED") {
      throw new HttpError(403, "Recovery authorization is not approved");
    }

    const masterEvidence = await (this.options.getMasterEvidenceById ?? getMasterEvidenceById)(workingCopy.masterEvidenceId);
    if (!masterEvidence) {
      throw new HttpError(404, "Master evidence not found");
    }
    if (masterEvidence.investigationId !== input.investigationId) {
      throw new HttpError(403, "Master evidence does not belong to the investigation");
    }

    const duplicate = await this.options.repository.listForInvestigation(input.investigationId);
    const hasActiveDuplicate = duplicate.some(
      (job) => job.workingCopyId === input.workingCopyId && ["QUEUED", "VALIDATING", "RECOVERING", "COLLECTING"].includes(job.status),
    );
    if (hasActiveDuplicate) {
      throw new HttpError(409, "An active recovery job already exists for this working copy");
    }

    const job: RecoveryJobRecord = {
      id: cryptoRandomId(),
      investigationId: input.investigationId,
      workingCopyId: input.workingCopyId,
      masterEvidenceId: workingCopy.masterEvidenceId,
      requestedBy: input.requestedBy,
      authorizationId: input.authorizationId,
      status: "QUEUED",
      method: input.method,
      engine: input.engine,
      config: sanitizeConfig(input.config ?? {}),
      outputLocation: null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const created = await this.options.repository.insert(job);

    await this.options.auditLogger({
      actorId: input.requestedBy,
      investigationId: input.investigationId,
      authorizationId: input.authorizationId,
      recoveryJobId: created.id,
      eventType: "RECOVERY_JOB_REQUESTED",
      result: "SUCCESS",
      details: `recoveryJobId=${created.id}; workingCopyId=${input.workingCopyId}; method=${input.method}; engine=${input.engine}`,
    });

    return created;
  }
}

export class DrizzleRecoveryJobRepository implements RecoveryJobRepository {
  async getById(id: string) {
    const db = getDb();
    const [row] = await db.select().from(recoveryJobs).where(eq(recoveryJobs.id, id)).limit(1);
    if (!row) return null;
    return fromRow(row);
  }

  async listForInvestigation(investigationId: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(recoveryJobs)
      .where(eq(recoveryJobs.investigationId, investigationId))
      .orderBy(desc(recoveryJobs.createdAt));
    return rows.map(fromRow);
  }

  async findNextQueued() {
    const db = getDb();
    const [row] = await db
      .select()
      .from(recoveryJobs)
      .where(eq(recoveryJobs.status, "QUEUED"))
      .orderBy(asc(recoveryJobs.createdAt))
      .limit(1);
    return row ? fromRow(row) : null;
  }

  async insert(record: RecoveryJobRecord) {
    const db = getDb();
    const [row] = await db.insert(recoveryJobs).values(toRow(record)).returning();
    if (!row) throw new HttpError(500, "Failed to create recovery job");
    return fromRow(row);
  }

  async update(record: RecoveryJobRecord) {
    const db = getDb();
    const [row] = await db.update(recoveryJobs).set(toRow(record)).where(eq(recoveryJobs.id, record.id)).returning();
    if (!row) throw new HttpError(500, "Failed to update recovery job");
    return fromRow(row);
  }
}

async function getInvestigation(investigationId: string) {
  const db = getDb();
  const [row] = await db.select().from(investigations).where(eq(investigations.id, investigationId)).limit(1);
  if (!row) throw new HttpError(404, "Investigation not found");
  return row;
}

async function getWorkingCopyById(id: string): Promise<WorkingCopyContext | null> {
  const db = getDb();
  const [row] = await db.select().from(workingCopies).where(eq(workingCopies.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    investigationId: row.investigationId,
    masterEvidenceId: row.masterEvidenceId,
    storageObjectId: row.storageObjectId,
    status: row.status,
    investigatorId: row.investigatorId,
    authorizationId: row.authorizationId,
  };
}

async function getAuthorizationById(id: string): Promise<AuthorizationContext | null> {
  const db = getDb();
  const [row] = await db.select().from(operationAuthorizations).where(eq(operationAuthorizations.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    investigationId: row.investigationId,
    requestedBy: row.requestedBy,
    status: row.status,
    operationType: row.operationType,
  };
}

async function getMasterEvidenceById(id: string): Promise<MasterEvidenceContext | null> {
  const db = getDb();
  const [row] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    investigationId: row.investigationId,
    masterStorageObjectId: row.masterStorageObjectId,
    sha256: row.sha256,
    status: row.status,
  };
}

function sanitizeConfig(config: Record<string, unknown>) {
  const keys = new Set(["includeDeleted", "maxFiles", "outputDir", "caseNumber"]);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!keys.has(key)) {
      throw new HttpError(400, `Unsupported recovery config key: ${key}`);
    }
    if (typeof key === "string" && key.startsWith("/")) {
      throw new HttpError(400, "Recovery config key is invalid");
    }
    if (typeof value === "string" && /^(?:[A-Za-z]:\\|\/|\\\\)/.test(value)) {
      throw new HttpError(400, `Unsafe recovery config value for ${key}`);
    }
    next[key] = value;
  }
  return next;
}

function validateRecoveryInputs(method: RecoveryMethod, engine: RecoveryEngine, config?: Record<string, unknown>) {
  const methods = ["FILESYSTEM", "CARVING", "STRING_SEARCH", "TIMELINE"] as const;
  const engines = ["TSK", "FOREMOST", "BULK_EXTRACTOR", "CUSTOM"] as const;

  if (!methods.includes(method as (typeof methods)[number])) {
    throw new HttpError(400, "Invalid recovery method");
  }
  if (!engines.includes(engine as (typeof engines)[number])) {
    throw new HttpError(400, "Invalid recovery engine");
  }
  if (config) {
    sanitizeConfig(config);
  }
}

function toRow(record: RecoveryJobRecord) {
  return {
    id: record.id,
    investigationId: record.investigationId,
    workingCopyId: record.workingCopyId,
    masterEvidenceId: record.masterEvidenceId,
    requestedBy: record.requestedBy,
    authorizationId: record.authorizationId,
    status: record.status,
    method: record.method,
    engine: record.engine,
    config: record.config,
    outputLocation: record.outputLocation,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromRow(row: {
  id: string;
  investigationId: string;
  workingCopyId: string;
  masterEvidenceId: string;
  requestedBy: string;
  authorizationId: string;
  status: RecoveryJobStatus;
  method: RecoveryMethod;
  engine: RecoveryEngine;
  config: unknown;
  outputLocation: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RecoveryJobRecord {
  return {
    id: row.id,
    investigationId: row.investigationId,
    workingCopyId: row.workingCopyId,
    masterEvidenceId: row.masterEvidenceId,
    requestedBy: row.requestedBy,
    authorizationId: row.authorizationId,
    status: row.status,
    method: row.method,
    engine: row.engine,
    config: normalizeConfigValue(row.config),
    outputLocation: row.outputLocation,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeConfigValue(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function cryptoRandomId() {
  return crypto.randomUUID();
}

export async function logRecoveryJobAudit(input: {
  actorId: string;
  investigationId: string;
  authorizationId?: string | null;
  recoveryJobId?: string | null;
  eventType: string;
  result: string;
  details?: string | null;
}) {
  const db = getDb();
  await db.insert(auditEvents).values({
    investigationId: input.investigationId,
    authorizationId: input.authorizationId ?? null,
    actorId: input.actorId,
    eventType: input.eventType as any,
    result: input.result,
    details: input.details ?? null,
  });
}
