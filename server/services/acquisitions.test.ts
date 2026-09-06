import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AcquisitionWorker } from "../agent/worker/acquisitionWorker";
import { TestFileAcquisitionAdapter } from "../agent/adapters/testFileAcquisition";
import { MemoryObjectStore } from "../storage/memoryObjectStore";
import { createEvidenceStorageService, MemoryStorageReferenceStore } from "./evidenceStorage";
import { createAcquisitionService, type AcquisitionJobRecord, type AcquisitionRepository } from "./acquisitions";

vi.mock("./ledger", () => ({
  recordAcquisitionEvent: vi.fn().mockResolvedValue(null),
}));

class MemoryAcquisitionRepository implements AcquisitionRepository {
  private readonly jobs = new Map<string, AcquisitionJobRecord>();

  async getById(id: string) {
    return this.jobs.get(id) ?? null;
  }

  async listForInvestigation(investigationId: string) {
    return Array.from(this.jobs.values()).filter((job) => job.investigationId === investigationId);
  }

  async findNextQueued() {
    return Array.from(this.jobs.values())
      .filter((job) => job.status === "QUEUED")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
  }

  async insert(job: AcquisitionJobRecord) {
    this.jobs.set(job.id, job);
    return job;
  }

  async update(job: AcquisitionJobRecord) {
    this.jobs.set(job.id, job);
    return job;
  }
}

describe("TestFileAcquisitionAdapter", () => {
  it("rejects a path traversal source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "forensic-x-test-"));
    const adapter = new TestFileAcquisitionAdapter({ allowedRoot: root });

    await expect(adapter.acquire("../secrets.txt")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reads a controlled source and hashes the actual bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "forensic-x-test-"));
    const sourcePath = path.join(root, "sample.bin");
    const bytes = Buffer.from("forensic-x acquisition test\n", "utf8");
    await writeFile(sourcePath, bytes);

    const adapter = new TestFileAcquisitionAdapter({ allowedRoot: root });
    const result = await adapter.acquire(sourcePath);

    expect(result.size).toBe(bytes.byteLength);
    expect(result.sha256).toMatch(/[a-f0-9]{64}/);
    expect(result.bytes.equals(bytes)).toBe(true);
  });
});

describe("AcquisitionService", () => {
  it("creates an acquisition job in QUEUED state and does not execute the adapter immediately", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "forensic-x-acq-"));
    const sourcePath = path.join(root, "master.bin");
    const bytes = Buffer.from("master image bytes\n", "utf8");
    await writeFile(sourcePath, bytes);

    const repository = new MemoryAcquisitionRepository();
    const store = new MemoryObjectStore();
    const references = new MemoryStorageReferenceStore();
    const evidenceStorage = createEvidenceStorageService(store, references);
    await evidenceStorage.ensureBuckets();

    const service = createAcquisitionService({
      repository,
      evidenceStorage,
      acquisitionAdapter: new TestFileAcquisitionAdapter({ allowedRoot: root }),
      auditLogger: async () => undefined,
      validateInvestigation: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
      validateDevice: async () => ({ id: "55555555-5555-4555-8555-555555555555", investigationId: "11111111-1111-4111-8111-111111111111" }),
      createEvidenceRecord: async (input) => ({
        id: `evidence-${input.acquisitionJobId}`,
        ...input,
      }),
    });

    const job = await service.createJob({
      investigationId: "11111111-1111-4111-8111-111111111111",
      deviceId: null,
      requestedBy: "22222222-2222-4222-8222-222222222222",
      authorizationId: "33333333-3333-4333-8333-333333333333",
      sourceType: "TEST_FILE",
      sourceIdentifier: sourcePath,
    });

    expect(job.status).toBe("QUEUED");
    expect(await repository.getById(job.id)).toMatchObject({ status: "QUEUED" });
  });

  it("worker can claim a queued job and process it to completion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "forensic-x-worker-"));
    const sourcePath = path.join(root, "master.bin");
    const bytes = Buffer.from("worker acquisition\n", "utf8");
    await writeFile(sourcePath, bytes);

    const repository = new MemoryAcquisitionRepository();
    const store = new MemoryObjectStore();
    const references = new MemoryStorageReferenceStore();
    const evidenceStorage = createEvidenceStorageService(store, references);
    await evidenceStorage.ensureBuckets();

    const service = createAcquisitionService({
      repository,
      evidenceStorage,
      acquisitionAdapter: new TestFileAcquisitionAdapter({ allowedRoot: root }),
      auditLogger: async () => undefined,
      validateInvestigation: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
      validateDevice: async () => ({ id: "55555555-5555-4555-8555-555555555555", investigationId: "11111111-1111-4111-8111-111111111111" }),
      createEvidenceRecord: async (input) => ({
        id: `evidence-${input.acquisitionJobId}`,
        ...input,
      }),
    });

    const job = await service.createJob({
      investigationId: "11111111-1111-4111-8111-111111111111",
      deviceId: null,
      requestedBy: "22222222-2222-4222-8222-222222222222",
      authorizationId: "33333333-3333-4333-8333-333333333333",
      sourceType: "TEST_FILE",
      sourceIdentifier: sourcePath,
    });

    const worker = new AcquisitionWorker({ service, adapter: new TestFileAcquisitionAdapter({ allowedRoot: root }) });
    const claimed = await service.claimNextQueuedJob();
    expect(claimed?.id).toBe(job.id);

    const result = await worker.processJob(job.id);
    expect(result.status).toBe("COMPLETED");
    expect(result.sha256).toMatch(/[a-f0-9]{64}/);
    const stored = await references.getById(result.storageObjectId as string);
    expect(stored?.deletionPolicy).toBe("MASTER_IMAGE_PROTECTED");
  });
});
