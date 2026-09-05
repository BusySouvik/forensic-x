import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Readable } from "node:stream";
import type { WorkingCopyStatus } from "../../shared/types";
import { getDb } from "../db";
import { auditEvents, evidenceRecords, operationAuthorizations, workingCopies } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { getEvidenceStorageService } from "./evidenceStorage";
import { getInvestigation } from "./investigations";

export type WorkingCopyRecord = {
  id: string;
  investigationId: string;
  masterEvidenceId: string;
  masterStorageObjectId: string;
  sourceMasterSHA256: string;
  workingCopySHA256: string;
  investigatorId: string;
  authorizationId: string;
  storageObjectId: string;
  status: WorkingCopyStatus;
  createdAt: Date;
  completedAt: Date | null;
  failureReason: string | null;
};

export interface WorkingCopyRepository {
  getById(id: string): Promise<WorkingCopyRecord | null>;
  listForInvestigation(investigationId: string): Promise<WorkingCopyRecord[]>;
  insert(record: WorkingCopyRecord): Promise<WorkingCopyRecord>;
  update(record: WorkingCopyRecord): Promise<WorkingCopyRecord>;
}

export type MasterEvidenceContext = {
  id: string;
  investigationId: string;
  masterStorageObjectId: string;
  status: "AVAILABLE" | "REJECTED";
  sha256: string | null;
};

export type WorkingCopyAuditInput = {
  actorId: string;
  investigationId: string;
  masterEvidenceId?: string | null;
  workingCopyId?: string | null;
  authorizationId?: string | null;
  eventType: string;
  result: string;
  details?: string | null;
  sourceHash?: string | null;
  destinationHash?: string | null;
};

export type WorkingCopyServiceOptions = {
  repository: WorkingCopyRepository;
  evidenceStorage?: ReturnType<typeof getEvidenceStorageService>;
  auditLogger: (input: WorkingCopyAuditInput) => Promise<void>;
  validateInvestigation?: (investigationId: string) => Promise<unknown>;
  validateMasterEvidence?: (masterEvidenceId: string) => Promise<MasterEvidenceContext | null>;
  requireApprovedAuthorization?: (input: {
    investigationId: string;
    authorizationId: string;
    investigatorId: string;
  }) => Promise<{ id: string; investigationId: string; requestedBy: string; status: string; operationType: string }>;
};

export function createWorkingCopyService(options: WorkingCopyServiceOptions) {
  return new WorkingCopyService(options);
}

export class WorkingCopyService {
  constructor(private readonly options: WorkingCopyServiceOptions) {}

  async getById(id: string) {
    const record = await this.options.repository.getById(id);
    if (!record) {
      throw new HttpError(404, "Working copy not found");
    }
    return record;
  }

  async listForInvestigation(investigationId: string) {
    return this.options.repository.listForInvestigation(investigationId);
  }

  async createWorkingCopy(input: {
    investigationId: string;
    masterEvidenceId: string;
    investigatorId: string;
    authorizationId: string;
  }) {
    await (this.options.validateInvestigation ?? getInvestigation)(input.investigationId);

    const master = await (this.options.validateMasterEvidence ?? getMasterEvidenceContext)(input.masterEvidenceId);
    if (!master) {
      throw new HttpError(404, "Master evidence not found");
    }
    if (master.investigationId !== input.investigationId) {
      throw new HttpError(403, "Master evidence does not belong to the investigation");
    }
    if (master.status !== "AVAILABLE") {
      throw new HttpError(409, "Master evidence is not available for working-copy creation");
    }

    const authorization = await (this.options.requireApprovedAuthorization ?? requireApprovedAuthorization)({
      investigationId: input.investigationId,
      authorizationId: input.authorizationId,
      investigatorId: input.investigatorId,
    });

    const storage = this.options.evidenceStorage ?? getEvidenceStorageService();
    const masterReference = await storage.getMetadata(master.masterStorageObjectId);
    if (masterReference.record.status === "DELETED") {
      throw new HttpError(404, "Master storage object is missing");
    }

    const masterHashFromMetadata = masterReference.record.sha256;
    const sourceMasterSHA256 = master.sha256 ?? masterHashFromMetadata;
    if (!sourceMasterSHA256) {
      throw new HttpError(500, "Master hash metadata is unavailable");
    }
    if (sourceMasterSHA256 !== masterHashFromMetadata) {
      throw new HttpError(500, "Master integrity metadata mismatch");
    }

    const workingCopyId = cryptoRandomId();
    const workingCopyRecord: WorkingCopyRecord = {
      id: workingCopyId,
      investigationId: input.investigationId,
      masterEvidenceId: input.masterEvidenceId,
      masterStorageObjectId: master.masterStorageObjectId,
      sourceMasterSHA256: sourceMasterSHA256,
      workingCopySHA256: "",
      investigatorId: input.investigatorId,
      authorizationId: input.authorizationId,
      storageObjectId: "",
      status: "QUEUED",
      createdAt: new Date(),
      completedAt: null,
      failureReason: null,
    };

    const requestDetails = buildAuditDetails({
      investigationId: input.investigationId,
      masterEvidenceId: input.masterEvidenceId,
      authorizationId: input.authorizationId,
      investigatorId: input.investigatorId,
      sourceMasterSHA256: sourceMasterSHA256,
    });

    await this.options.auditLogger({
      actorId: input.investigatorId,
      investigationId: input.investigationId,
      masterEvidenceId: input.masterEvidenceId,
      authorizationId: input.authorizationId,
      eventType: "WORKING_COPY_REQUESTED",
      result: "SUCCESS",
      details: requestDetails,
      sourceHash: sourceMasterSHA256,
    });

    try {
      const updated = await this.options.repository.insert({
        ...workingCopyRecord,
        status: "CREATING",
      });

      const { stream } = await storage.download(master.masterStorageObjectId);
      const masterBytes = await readStreamToBuffer(stream);
      const workingCopyObject = await storage.upload({
        storageClass: "WORKING_COPY",
        filename: `working-copy-${workingCopyId}.E01`,
        body: masterBytes,
        contentType: masterReference.record.contentType,
        investigationId: input.investigationId,
        evidenceId: input.masterEvidenceId,
      });

      const { stream: workingCopyStream } = await storage.download(workingCopyObject.id);
      const destinationBytes = await readStreamToBuffer(workingCopyStream);
      const workingCopySHA256 = createHash("sha256").update(destinationBytes).digest("hex");

      if (!destinationBytes.equals(masterBytes)) {
        throw new HttpError(500, "Working-copy verification failed: destination bytes differ from source master");
      }
      if (workingCopySHA256 !== sourceMasterSHA256) {
        throw new HttpError(500, "Working-copy hash mismatch with source master");
      }

      const completed = await this.options.repository.update({
        ...updated,
        storageObjectId: workingCopyObject.id,
        workingCopySHA256,
        status: "VERIFYING",
        failureReason: null,
      });

      const finalRecord = await this.options.repository.update({
        ...completed,
        status: "COMPLETED",
        completedAt: new Date(),
      });

      const completionDetails = buildAuditDetails({
        investigationId: input.investigationId,
        masterEvidenceId: input.masterEvidenceId,
        authorizationId: input.authorizationId,
        investigatorId: input.investigatorId,
        workingCopyId: finalRecord.id,
        sourceMasterSHA256: sourceMasterSHA256,
        workingCopySHA256: finalRecord.workingCopySHA256,
      });

      await this.options.auditLogger({
        actorId: input.investigatorId,
        investigationId: input.investigationId,
        masterEvidenceId: input.masterEvidenceId,
        workingCopyId: finalRecord.id,
        authorizationId: input.authorizationId,
        eventType: "WORKING_COPY_COMPLETED",
        result: "SUCCESS",
        details: completionDetails,
        sourceHash: sourceMasterSHA256,
        destinationHash: finalRecord.workingCopySHA256,
      });

      return finalRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown working-copy failure";
      const failed = await this.options.repository.insert({
        ...workingCopyRecord,
        status: "FAILED",
        failureReason: message,
        completedAt: new Date(),
      });
      const failureDetails = buildAuditDetails({
        investigationId: input.investigationId,
        masterEvidenceId: input.masterEvidenceId,
        authorizationId: input.authorizationId,
        investigatorId: input.investigatorId,
        workingCopyId: failed.id,
        sourceMasterSHA256: sourceMasterSHA256,
        failureReason: message,
      });

      await this.options.auditLogger({
        actorId: input.investigatorId,
        investigationId: input.investigationId,
        masterEvidenceId: input.masterEvidenceId,
        workingCopyId: failed.id,
        authorizationId: input.authorizationId,
        eventType: "WORKING_COPY_FAILED",
        result: "ERROR",
        details: failureDetails,
        sourceHash: sourceMasterSHA256,
      });
      throw error;
    }
  }

  async deleteWorkingCopy(id: string, actorId: string) {
    const record = await this.getById(id);
    const storage = this.options.evidenceStorage ?? getEvidenceStorageService();
    await storage.delete(record.storageObjectId);
    const deleted = await this.options.repository.update({
      ...record,
      status: "FAILED",
      failureReason: "Deleted by operator",
      completedAt: record.completedAt ?? new Date(),
    });
    const deleteDetails = buildAuditDetails({
      investigationId: deleted.investigationId,
      masterEvidenceId: deleted.masterEvidenceId,
      authorizationId: deleted.authorizationId,
      investigatorId: deleted.investigatorId,
      workingCopyId: deleted.id,
      sourceMasterSHA256: deleted.sourceMasterSHA256,
      workingCopySHA256: deleted.workingCopySHA256,
      failureReason: deleted.failureReason,
    });

    await this.options.auditLogger({
      actorId,
      investigationId: deleted.investigationId,
      masterEvidenceId: deleted.masterEvidenceId,
      workingCopyId: deleted.id,
      authorizationId: deleted.authorizationId,
      eventType: "WORKING_COPY_DELETED",
      result: "SUCCESS",
      details: deleteDetails,
      sourceHash: deleted.sourceMasterSHA256,
      destinationHash: deleted.workingCopySHA256,
    });
    return deleted;
  }
}

export async function getWorkingCopyById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(workingCopies).where(eq(workingCopies.id, id)).limit(1);
  return row ?? null;
}

export class DrizzleWorkingCopyRepository implements WorkingCopyRepository {
  async getById(id: string) {
    const db = getDb();
    const [row] = await db.select().from(workingCopies).where(eq(workingCopies.id, id)).limit(1);
    if (!row) {
      return null;
    }
    return fromRow(row);
  }

  async listForInvestigation(investigationId: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(workingCopies)
      .where(eq(workingCopies.investigationId, investigationId))
      .orderBy(desc(workingCopies.createdAt));
    return rows.map(fromRow);
  }

  async insert(record: WorkingCopyRecord) {
    const db = getDb();
    const [row] = await db.insert(workingCopies).values(toRow(record)).returning();
    if (!row) {
      throw new HttpError(500, "Failed to create working-copy record");
    }
    return fromRow(row);
  }

  async update(record: WorkingCopyRecord) {
    const db = getDb();
    const [row] = await db.update(workingCopies).set(toRow(record)).where(eq(workingCopies.id, record.id)).returning();
    if (!row) {
      throw new HttpError(500, "Failed to update working-copy record");
    }
    return fromRow(row);
  }
}

async function getMasterEvidenceContext(masterEvidenceId: string): Promise<MasterEvidenceContext | null> {
  const db = getDb();
  const [row] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, masterEvidenceId)).limit(1);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    investigationId: row.investigationId,
    masterStorageObjectId: row.masterStorageObjectId,
    status: row.status,
    sha256: row.sha256,
  };
}

async function requireApprovedAuthorization(input: {
  investigationId: string;
  authorizationId: string;
  investigatorId: string;
}) {
  const db = getDb();
  const [authorization] = await db
    .select()
    .from(operationAuthorizations)
    .where(eq(operationAuthorizations.id, input.authorizationId))
    .limit(1);
  if (!authorization) {
    throw new HttpError(404, "Authorization not found");
  }
  if (authorization.investigationId !== input.investigationId) {
    throw new HttpError(403, "Authorization does not belong to the investigation");
  }
  if (authorization.status !== "APPROVED") {
    throw new HttpError(403, "Authorization is not approved");
  }
  if (authorization.requestedBy !== input.investigatorId) {
    throw new HttpError(403, "Authorization does not belong to the investigator");
  }
  return authorization;
}

function toRow(record: WorkingCopyRecord) {
  return {
    id: record.id,
    investigationId: record.investigationId,
    masterEvidenceId: record.masterEvidenceId,
    masterStorageObjectId: record.masterStorageObjectId,
    sourceMasterSha256: record.sourceMasterSHA256,
    workingCopySha256: record.workingCopySHA256,
    investigatorId: record.investigatorId,
    authorizationId: record.authorizationId,
    storageObjectId: record.storageObjectId,
    status: record.status,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    failureReason: record.failureReason,
  };
}

function fromRow(row: {
  id: string;
  investigationId: string;
  masterEvidenceId: string;
  masterStorageObjectId: string;
  sourceMasterSha256: string;
  workingCopySha256: string;
  investigatorId: string;
  authorizationId: string;
  storageObjectId: string;
  status: WorkingCopyStatus;
  createdAt: Date;
  completedAt: Date | null;
  failureReason: string | null;
}): WorkingCopyRecord {
  return {
    id: row.id,
    investigationId: row.investigationId,
    masterEvidenceId: row.masterEvidenceId,
    masterStorageObjectId: row.masterStorageObjectId,
    sourceMasterSHA256: row.sourceMasterSha256,
    workingCopySHA256: row.workingCopySha256,
    investigatorId: row.investigatorId,
    authorizationId: row.authorizationId,
    storageObjectId: row.storageObjectId,
    status: row.status,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    failureReason: row.failureReason,
  };
}

function cryptoRandomId() {
  return crypto.randomUUID();
}

function buildAuditDetails(input: {
  investigationId: string;
  masterEvidenceId?: string | null;
  authorizationId?: string | null;
  investigatorId?: string | null;
  workingCopyId?: string | null;
  sourceMasterSHA256?: string | null;
  workingCopySHA256?: string | null;
  failureReason?: string | null;
}) {
  const parts = [
    `investigationId=${input.investigationId}`,
    input.masterEvidenceId ? `masterEvidenceId=${input.masterEvidenceId}` : null,
    input.authorizationId ? `authorizationId=${input.authorizationId}` : null,
    input.investigatorId ? `investigator=${input.investigatorId}` : null,
    input.workingCopyId ? `workingCopyId=${input.workingCopyId}` : null,
    input.sourceMasterSHA256 ? `sourceMasterSHA256=${input.sourceMasterSHA256}` : null,
    input.workingCopySHA256 ? `workingCopySHA256=${input.workingCopySHA256}` : null,
    input.failureReason ? `failureReason=${input.failureReason}` : null,
  ].filter(Boolean);
  return parts.join("; ");
}

async function readStreamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function logWorkingCopyAudit(input: WorkingCopyAuditInput) {
  const db = getDb();
  await db.insert(auditEvents).values({
    investigationId: input.investigationId,
    acquisitionJobId: null,
    authorizationId: input.authorizationId ?? null,
    actorId: input.actorId,
    eventType: input.eventType as any,
    result: input.result,
    details: input.details ?? null,
  });
}
