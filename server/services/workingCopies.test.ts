import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryObjectStore } from "../storage/memoryObjectStore";
import { createEvidenceStorageService, MemoryStorageReferenceStore } from "./evidenceStorage";
import { createWorkingCopyService, type WorkingCopyRecord, type WorkingCopyRepository } from "./workingCopies";

class MemoryWorkingCopyRepository implements WorkingCopyRepository {
  private readonly records = new Map<string, WorkingCopyRecord>();

  async getById(id: string) {
    return this.records.get(id) ?? null;
  }

  async listForInvestigation(investigationId: string) {
    return Array.from(this.records.values()).filter((record) => record.investigationId === investigationId);
  }

  async insert(record: WorkingCopyRecord) {
    this.records.set(record.id, record);
    return record;
  }

  async update(record: WorkingCopyRecord) {
    this.records.set(record.id, record);
    return record;
  }
}

describe("WorkingCopyService", () => {
  it("creates a working copy that keeps the master object protected and preserves the original hash", async () => {
    const bytes = Buffer.from("master image bytes\n", "utf8");
    const scenario = await createScenario({
      investigationId: "11111111-1111-4111-8111-111111111111",
      masterEvidenceId: "master-evidence-1",
      investigatorId: "22222222-2222-4222-8222-222222222222",
      authorizationId: "auth-1",
      bytes,
    });

    expect(scenario.error).toBeUndefined();
    expect(scenario.workingCopy.status).toBe("COMPLETED");
    expect(scenario.workingCopy.sourceMasterSHA256).toBe(scenario.masterRecord.sha256);
    expect(scenario.workingCopy.workingCopySHA256).toBe(scenario.masterRecord.sha256);
    expect(scenario.workingCopy.masterStorageObjectId).toBe(scenario.masterRecord.id);
    expect(scenario.workingCopy.storageObjectId).not.toBe(scenario.masterRecord.id);

    const masterObject = await scenario.store.download(scenario.masterRecord.bucket, scenario.masterRecord.objectKey);
    const masterBytes = await readStreamToBuffer(masterObject);
    const workingCopyMetadata = await scenario.evidenceStorage.getMetadata(scenario.workingCopy.storageObjectId);
    const workingCopyObject = await scenario.store.download(
      workingCopyMetadata.record.bucket,
      workingCopyMetadata.record.objectKey,
    );
    const workingCopyBytes = await readStreamToBuffer(workingCopyObject);

    expect(masterBytes.equals(bytes)).toBe(true);
    expect(workingCopyBytes.equals(bytes)).toBe(true);
    expect(scenario.masterRecord.objectKey).not.toBe(workingCopyMetadata.record.objectKey);
    expect(scenario.masterRecord.deletionPolicy).toBe("MASTER_IMAGE_PROTECTED");
  });

  it("calculates the working-copy hash from the exact destination bytes stored in object storage", async () => {
    const expected = Buffer.from("hash verification exact bytes\n", "utf8");
    const scenario = await createScenario({
      investigationId: "11111111-1111-4111-8111-111111111111",
      masterEvidenceId: "master-evidence-1",
      investigatorId: "22222222-2222-4222-8222-222222222222",
      authorizationId: "auth-1",
      bytes: expected,
    });

    const workingCopyMetadata = await scenario.evidenceStorage.getMetadata(scenario.workingCopy.storageObjectId);
    const workingCopyStream = await scenario.store.download(workingCopyMetadata.record.bucket, workingCopyMetadata.record.objectKey);
    const destinationBytes = await readStreamToBuffer(workingCopyStream);
    const actualHash = createHash("sha256").update(destinationBytes).digest("hex");

    expect(actualHash).toBe(scenario.workingCopy.workingCopySHA256);
    expect(actualHash).toBe(scenario.masterRecord.sha256);
    expect(destinationBytes.equals(expected)).toBe(true);
  });

  it("rejects a master that belongs to a different investigation", async () => {
    const bytes = Buffer.from("wrong investigation\n", "utf8");
    const store = new MemoryObjectStore();
    const refs = new MemoryStorageReferenceStore();
    await store.ensureBuckets(["forensic-images", "working-copies"]);
    const evidenceStorage = createEvidenceStorageService(store, refs);
    const masterRecord = await evidenceStorage.upload({
      storageClass: "FORENSIC_IMAGE",
      filename: "master.E01",
      body: bytes,
      contentType: "application/x-ewf",
      investigationId: "33333333-3333-4333-8333-333333333333",
    });

    const service = createWorkingCopyService({
      repository: new MemoryWorkingCopyRepository(),
      evidenceStorage,
      auditLogger: async () => undefined,
      validateInvestigation: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
      validateMasterEvidence: async () => ({
        id: "master-evidence-1",
        investigationId: "33333333-3333-4333-8333-333333333333",
        masterStorageObjectId: masterRecord.id,
        status: "AVAILABLE",
        sha256: masterRecord.sha256,
      }),
      requireApprovedAuthorization: async () => ({
        id: "auth-1",
        investigationId: "11111111-1111-4111-8111-111111111111",
        requestedBy: "22222222-2222-4222-8222-222222222222",
        status: "APPROVED",
        operationType: "EXAMINATION",
      }),
    });

    await expect(
      service.createWorkingCopy({
        investigationId: "11111111-1111-4111-8111-111111111111",
        masterEvidenceId: "master-evidence-1",
        investigatorId: "22222222-2222-4222-8222-222222222222",
        authorizationId: "auth-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects unauthorized investigators before creating a working copy", async () => {
    const bytes = Buffer.from("unauthorized\n", "utf8");
    const scenario = await createScenario({
      investigationId: "11111111-1111-4111-8111-111111111111",
      masterEvidenceId: "master-evidence-1",
      investigatorId: "22222222-2222-4222-8222-222222222222",
      authorizationId: "auth-1",
      bytes,
      requireAuthorization: async () => {
        throw Object.assign(new Error("Unauthorized"), { statusCode: 403 });
      },
    });

    expect(scenario.error).toMatchObject({ statusCode: 403 });
    expect(scenario.workingCopy).toBeUndefined();
  });

  it("fails with 404 when the master storage object is missing", async () => {
    const store = new MemoryObjectStore();
    const refs = new MemoryStorageReferenceStore();
    await store.ensureBuckets(["forensic-images", "working-copies"]);
    const evidenceStorage = createEvidenceStorageService(store, refs);

    const service = createWorkingCopyService({
      repository: new MemoryWorkingCopyRepository(),
      evidenceStorage,
      auditLogger: async () => undefined,
      validateInvestigation: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
      validateMasterEvidence: async () => ({
        id: "master-evidence-1",
        investigationId: "11111111-1111-4111-8111-111111111111",
        masterStorageObjectId: "missing-object",
        status: "AVAILABLE",
        sha256: "abc123",
      }),
      requireApprovedAuthorization: async () => ({
        id: "auth-1",
        investigationId: "11111111-1111-4111-8111-111111111111",
        requestedBy: "22222222-2222-4222-8222-222222222222",
        status: "APPROVED",
        operationType: "EXAMINATION",
      }),
    });

    await expect(
      service.createWorkingCopy({
        investigationId: "11111111-1111-4111-8111-111111111111",
        masterEvidenceId: "master-evidence-1",
        investigatorId: "22222222-2222-4222-8222-222222222222",
        authorizationId: "auth-1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("records provenance with the investigator, authorization, and master/hash details", async () => {
    const auditEvents: Array<{ details?: string | null; sourceHash?: string | null; destinationHash?: string | null; eventType?: string | null }> = [];
    const scenario = await createScenario({
      investigationId: "11111111-1111-4111-8111-111111111111",
      masterEvidenceId: "master-evidence-1",
      investigatorId: "22222222-2222-4222-8222-222222222222",
      authorizationId: "auth-1",
      bytes: Buffer.from("provenance\n", "utf8"),
      auditLogger: async (entry) => {
        auditEvents.push({
          details: entry.details,
          sourceHash: entry.sourceHash,
          destinationHash: entry.destinationHash,
          eventType: entry.eventType,
        });
      },
    });

    const completed = auditEvents.find((entry) => entry.eventType === "WORKING_COPY_COMPLETED");
    expect(completed?.details).toContain("investigationId=11111111-1111-4111-8111-111111111111");
    expect(completed?.details).toContain("masterEvidenceId=master-evidence-1");
    expect(completed?.details).toContain(`sourceMasterSHA256=${scenario.masterRecord.sha256}`);
    expect(completed?.details).toContain(`workingCopySHA256=${scenario.workingCopy.workingCopySHA256}`);
    expect(completed?.details).toContain("authorizationId=auth-1");
    expect(completed?.details).toContain(`investigator=${scenario.investigatorId}`);
  });
});

async function createScenario(input: {
  investigationId: string;
  masterEvidenceId: string;
  investigatorId: string;
  authorizationId: string;
  bytes: Buffer;
  store?: MemoryObjectStore;
  refs?: MemoryStorageReferenceStore;
  repository?: MemoryWorkingCopyRepository;
  requireAuthorization?: () => Promise<unknown>;
  auditLogger?: (entry: any) => Promise<void>;
}) {
  const store = input.store ?? new MemoryObjectStore();
  const refs = input.refs ?? new MemoryStorageReferenceStore();
  await store.ensureBuckets(["forensic-images", "working-copies"]);
  const evidenceStorage = createEvidenceStorageService(store, refs);
  const masterRecord = await evidenceStorage.upload({
    storageClass: "FORENSIC_IMAGE",
    filename: "master.E01",
    body: input.bytes,
    contentType: "application/x-ewf",
    investigationId: input.investigationId,
  });

  const service = createWorkingCopyService({
    repository: input.repository ?? new MemoryWorkingCopyRepository(),
    evidenceStorage,
    auditLogger: input.auditLogger ?? (async () => undefined),
    validateInvestigation: async () => ({ id: input.investigationId }),
    validateMasterEvidence: async () => ({
      id: input.masterEvidenceId,
      investigationId: input.investigationId,
      masterStorageObjectId: masterRecord.id,
      status: "AVAILABLE",
      sha256: masterRecord.sha256,
    }),
    requireApprovedAuthorization: input.requireAuthorization ?? (async () => ({
      id: input.authorizationId,
      investigationId: input.investigationId,
      requestedBy: input.investigatorId,
      status: "APPROVED",
      operationType: "EXAMINATION",
    })),
  });

  let workingCopy: any;
  let error: unknown;
  try {
    workingCopy = await service.createWorkingCopy({
      investigationId: input.investigationId,
      masterEvidenceId: input.masterEvidenceId,
      investigatorId: input.investigatorId,
      authorizationId: input.authorizationId,
    });
  } catch (caught) {
    error = caught;
  }

  return {
    investigationId: input.investigationId,
    masterEvidenceId: input.masterEvidenceId,
    investigatorId: input.investigatorId,
    authorizationId: input.authorizationId,
    store,
    refs,
    evidenceStorage,
    masterRecord,
    workingCopy,
    error,
  };
}

async function readStreamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
