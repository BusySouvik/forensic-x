import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { MemoryObjectStore } from "../storage/memoryObjectStore";
import { createEvidenceStorageService, MemoryStorageReferenceStore } from "./evidenceStorage";
import { createRecoveryJobService, type RecoveryJobRecord, type RecoveryJobRepository } from "./recoveryJobs";
import type { RecoveryEngine, RecoveryMethod } from "../../shared/types";

class MemoryRecoveryJobRepository implements RecoveryJobRepository {
  private readonly records = new Map<string, RecoveryJobRecord>();

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

  async insert(record: RecoveryJobRecord) {
    this.records.set(record.id, record);
    return record;
  }

  async update(record: RecoveryJobRecord) {
    this.records.set(record.id, record);
    return record;
  }
}

describe("RecoveryJobService", () => {
  it("creates a queued recovery job from an authorized working copy", async () => {
    const { service, workingCopy, authorization, investigationId } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
    });

    const job = await service.createRecoveryJob({
      investigationId,
      workingCopyId: workingCopy.id,
      requestedBy: "22222222-2222-4222-8222-222222222222",
      authorizationId: authorization.id,
      method: "FILESYSTEM",
      engine: "TSK",
      config: { includeDeleted: true },
    });

    expect(job.status).toBe("QUEUED");
    expect(job.workingCopyId).toBe(workingCopy.id);
    expect(job.masterEvidenceId).toBe(workingCopy.masterEvidenceId);
    expect(job.method).toBe("FILESYSTEM");
    expect(job.engine).toBe("TSK");
  });

  it("rejects a missing working copy", async () => {
    const { service, investigationId, authorization } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
    });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: "11111111-1111-4111-8111-999999999999",
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: authorization.id,
        method: "FILESYSTEM",
        engine: "TSK",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects a working copy from another investigation", async () => {
    const { service, authorization, workingCopy } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
      workingCopyInvestigationId: "22222222-2222-4222-8222-222222222222",
    });

    await expect(
      service.createRecoveryJob({
        investigationId: "11111111-1111-4111-8111-111111111111",
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: authorization.id,
        method: "FILESYSTEM",
        engine: "TSK",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects authorization for another investigation", async () => {
    const { service, investigationId, workingCopy } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
      authorizationInvestigationId: "33333333-3333-4333-8333-333333333333",
    });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: "33333333-3333-4333-8333-111111111111",
        method: "FILESYSTEM",
        engine: "TSK",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects unapproved authorization", async () => {
    const { service, investigationId, workingCopy } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
      authorizationStatus: "PENDING",
    });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: "auth-1",
        method: "FILESYSTEM",
        engine: "TSK",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects authorization for a different operation type", async () => {
    const { service, investigationId, workingCopy } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
      authorizationOperationType: "EXAMINATION",
    });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: "auth-1",
        method: "FILESYSTEM",
        engine: "TSK",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects master evidence as the recovery source", async () => {
    const { service, investigationId, masterRecord } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
    });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: masterRecord.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: "auth-1",
        method: "FILESYSTEM",
        engine: "TSK",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects invalid method and engine values", async () => {
    const { service, investigationId, workingCopy, authorization } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
    });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: authorization.id,
        method: "INVALID" as RecoveryMethod,
        engine: "TSK",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: authorization.id,
        method: "FILESYSTEM",
        engine: "INVALID" as RecoveryEngine,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects dangerous client-supplied recovery configuration values", async () => {
    const { service, investigationId, workingCopy, authorization } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
    });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: authorization.id,
        method: "FILESYSTEM",
        engine: "TSK",
        config: {
          executablePath: "C:/evil/ewfacquire.exe",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: authorization.id,
        method: "FILESYSTEM",
        engine: "TSK",
        config: {
          filesystemPath: "C:/temp/source.img",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: authorization.id,
        method: "FILESYSTEM",
        engine: "TSK",
        config: {
          minioBucket: "forensic-images",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses duplicate active recovery jobs for the same working copy", async () => {
    const { service, investigationId, workingCopy, authorization } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
    });

    await service.createRecoveryJob({
      investigationId,
      workingCopyId: workingCopy.id,
      requestedBy: "22222222-2222-4222-8222-222222222222",
      authorizationId: authorization.id,
      method: "FILESYSTEM",
      engine: "TSK",
    });

    await expect(
      service.createRecoveryJob({
        investigationId,
        workingCopyId: workingCopy.id,
        requestedBy: "22222222-2222-4222-8222-222222222222",
        authorizationId: authorization.id,
        method: "FILESYSTEM",
        engine: "TSK",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("records an audit event for recovery-job creation", async () => {
    const audit: Array<{ eventType?: string; details?: string | null }> = [];
    const { service, investigationId, workingCopy, authorization } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
      auditLogger: async (entry) => {
        audit.push({ eventType: entry.eventType, details: entry.details });
      },
    });

    await service.createRecoveryJob({
      investigationId,
      workingCopyId: workingCopy.id,
      requestedBy: "22222222-2222-4222-8222-222222222222",
      authorizationId: authorization.id,
      method: "FILESYSTEM",
      engine: "TSK",
    });

    expect(audit.some((entry) => entry.eventType === "RECOVERY_JOB_REQUESTED")).toBe(true);
  });

  it("admin can inspect recovery jobs for an investigation", async () => {
    const { service, investigationId, workingCopy, authorization } = await createRecoveryScenario({
      method: "FILESYSTEM",
      engine: "TSK",
    });

    const job = await service.createRecoveryJob({
      investigationId,
      workingCopyId: workingCopy.id,
      requestedBy: "22222222-2222-4222-8222-222222222222",
      authorizationId: authorization.id,
      method: "FILESYSTEM",
      engine: "TSK",
    });

    const list = await service.listForInvestigation(investigationId);
    expect(list.some((item) => item.id === job.id)).toBe(true);
  });
});

async function createRecoveryScenario(input: {
  method: RecoveryMethod;
  engine: RecoveryEngine;
  workingCopyInvestigationId?: string;
  authorizationInvestigationId?: string;
  authorizationStatus?: "PENDING" | "APPROVED" | "DENIED";
  authorizationOperationType?: "ACQUISITION" | "RECOVERY" | "EXAMINATION" | "SANITIZATION" | "EXPORT" | "OTHER";
  auditLogger?: (entry: any) => Promise<void>;
}) {
  const investigationId = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";
  const store = new MemoryObjectStore();
  const refs = new MemoryStorageReferenceStore();
  await store.ensureBuckets(["forensic-images", "working-copies"]);
  const evidenceStorage = createEvidenceStorageService(store, refs);
  const masterRecord = await evidenceStorage.upload({
    storageClass: "FORENSIC_IMAGE",
    filename: "master.E01",
    body: Buffer.from("test master image\n", "utf8"),
    contentType: "application/x-ewf",
    investigationId,
  });

  const workingCopyRecord = await evidenceStorage.upload({
    storageClass: "WORKING_COPY",
    filename: "working-copy.E01",
    body: Buffer.from("test working copy\n", "utf8"),
    contentType: "application/x-ewf",
    investigationId,
    evidenceId: "master-evidence-1",
  });

  const workingCopy = {
    id: "11111111-1111-4111-8111-222222222222",
    investigationId: input.workingCopyInvestigationId ?? investigationId,
    masterEvidenceId: "master-evidence-1",
    masterStorageObjectId: masterRecord.id,
    sourceMasterSHA256: createHash("sha256").update(Buffer.from("test working copy\n", "utf8")).digest("hex"),
    workingCopySHA256: createHash("sha256").update(Buffer.from("test working copy\n", "utf8")).digest("hex"),
    investigatorId: userId,
    authorizationId: "auth-1",
    storageObjectId: workingCopyRecord.id,
    status: "COMPLETED" as const,
    createdAt: new Date(),
    completedAt: new Date(),
    failureReason: null,
  };

  const authorization = {
    id: input.authorizationInvestigationId ? "33333333-3333-4333-8333-111111111111" : "auth-1",
    investigationId: input.authorizationInvestigationId ?? investigationId,
    requestedBy: userId,
    approvedBy: "33333333-3333-4333-8333-333333333333",
    status: input.authorizationStatus ?? "APPROVED",
    operationType: input.authorizationOperationType ?? "RECOVERY",
    reason: "Recovery authorization",
    requestedAt: new Date(),
    approvedAt: new Date(),
    expiresAt: null,
    deviceId: null,
  };

  const repository = new MemoryRecoveryJobRepository();
  const service = createRecoveryJobService({
    repository,
    auditLogger: input.auditLogger ?? (async () => undefined),
    getInvestigation: async () => ({ id: investigationId }),
    getWorkingCopyById: async (id) => {
      if (id !== workingCopy.id) return null;
      return { ...workingCopy, investigationId: input.workingCopyInvestigationId ?? investigationId };
    },
    getAuthorizationById: async (id) => {
      if (id !== authorization.id) return null;
      return authorization;
    },
    getMasterEvidenceById: async (id) => {
      if (id !== masterRecord.id && id !== "master-evidence-1") {
        return null;
      }
      return {
        id: masterRecord.id,
        investigationId,
        masterStorageObjectId: masterRecord.id,
        sha256: masterRecord.sha256,
        status: "AVAILABLE",
      };
    },
  });

  return {
    service,
    investigationId,
    workingCopy,
    authorization,
    masterRecord,
  };
}
