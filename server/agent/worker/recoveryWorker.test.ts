import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecoveryWorker, type RecoveryAdapterLike, type RecoveryExecutionResult } from "./recoveryWorker";
import type { RecoveryJobRecord, RecoveryJobRepository } from "../../services/recoveryJobs";

class MemoryRecoveryJobRepository implements RecoveryJobRepository {
  private readonly records = new Map<string, RecoveryJobRecord>();
  async getById(id: string) { return this.records.get(id) ?? null; }
  async listForInvestigation(investigationId: string) { return Array.from(this.records.values()).filter((record) => record.investigationId === investigationId); }
  async findNextQueued() { return Array.from(this.records.values()).find((record) => record.status === "QUEUED") ?? null; }
  async insert(record: RecoveryJobRecord) { this.records.set(record.id, record); return record; }
  async update(record: RecoveryJobRecord) { this.records.set(record.id, record); return record; }
}

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function queuedJob(engine: RecoveryJobRecord["engine"]): RecoveryJobRecord {
  return {
    id: `job-${engine.toLowerCase()}`, investigationId: "investigation-1", workingCopyId: "working-copy-1", masterEvidenceId: "master-evidence-1",
    requestedBy: "user-1", authorizationId: "auth-1", status: "QUEUED", method: engine === "FOREMOST" ? "CARVING" : "FILESYSTEM", engine, config: {},
    outputLocation: null, startedAt: null, completedAt: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
  };
}

async function adapterResult(engine: "TSK" | "FOREMOST"): Promise<RecoveryExecutionResult> {
  const outputLocation = await mkdtemp(path.join(tmpdir(), `forensic-x-${engine.toLowerCase()}-`));
  temporaryDirectories.push(outputLocation);
  const artifactPath = path.join(outputLocation, "candidate.bin");
  const contents = `${engine}-candidate`;
  await writeFile(artifactPath, contents);
  return {
    engine, executable: `${engine.toLowerCase()}-binary`, args: [], outputLocation,
    artifacts: [{ path: artifactPath, size: Buffer.byteLength(contents), sha256: `${engine.toLowerCase()}-sha256`, contentType: "application/octet-stream", kind: "FILE" }],
    stdout: `${engine} output`, stderr: "", exitCode: 0, startedAt: new Date(), finishedAt: new Date(),
  };
}

function mockAdapter(result: RecoveryExecutionResult): RecoveryAdapterLike {
  return { validateEngine: vi.fn(() => true), recover: vi.fn(async () => result) };
}

async function createWorker(
  job: RecoveryJobRecord,
  adapters: Partial<Record<"TSK" | "FOREMOST", RecoveryAdapterLike>>,
  workingCopyOverrides: Partial<{ investigationId: string; masterEvidenceId: string; storageObjectId: string; status: "QUEUED" | "CREATING" | "VERIFYING" | "COMPLETED" | "FAILED" }> = {},
) {
  const repository = new MemoryRecoveryJobRepository();
  await repository.insert(job);
  const uploaded: any[] = [];
  const persisted: any[][] = [];
  const storage = {
    download: vi.fn(async (id: string) => {
      expect(id).toBe("working-copy-storage-1");
      return { record: { originalFilename: "fixture.raw" }, stream: Readable.from(Buffer.from("disposable working-copy bytes")) };
    }),
    upload: vi.fn(async (input: any) => {
      uploaded.push(input);
      return { id: "recovered-storage-1", objectKey: "investigations/investigation-1/recovered_evidence/recovered-storage-1/candidate.bin" };
    }),
  };
  const worker = new RecoveryWorker({
    repository, adapters, storage,
    getWorkingCopyById: async () => ({
      id: "working-copy-1", investigationId: "investigation-1", masterEvidenceId: "master-evidence-1", storageObjectId: "working-copy-storage-1",
      status: "COMPLETED", investigatorId: "user-1", authorizationId: "auth-1", ...workingCopyOverrides,
    }),
    insertRecoveredCandidates: async (items) => { persisted.push(items); },
    logAudit: async () => undefined,
  });
  return { worker, repository, storage, uploaded, persisted };
}

describe("RecoveryWorker engine dispatch", () => {
  it("selects the TSK adapter for a queued TSK job and uses the common persistence pipeline", async () => {
    const tsk = mockAdapter(await adapterResult("TSK"));
    const foremost = mockAdapter(await adapterResult("FOREMOST"));
    const { worker, repository, uploaded, persisted } = await createWorker(queuedJob("TSK"), { TSK: tsk, FOREMOST: foremost });

    await worker.processJob("job-tsk");

    expect(tsk.recover).toHaveBeenCalledOnce();
    expect(foremost.recover).not.toHaveBeenCalled();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatchObject({ storageClass: "RECOVERED_EVIDENCE", evidenceId: "master-evidence-1" });
    expect(persisted).toHaveLength(1);
    expect(persisted[0][0]).toMatchObject({ engine: "TSK", workingCopyId: "working-copy-1", storageObjectId: "recovered-storage-1" });
    expect((tsk.recover as any).mock.calls[0][0]).toContain("fixture.raw");
    expect((tsk.recover as any).mock.calls[0][0]).not.toContain("master-evidence-1");
    expect((await repository.getById("job-tsk"))?.status).toBe("COMPLETED");
  });

  it("selects the Foremost adapter for a queued FOREMOST job and uses the same persistence pipeline", async () => {
    const tsk = mockAdapter(await adapterResult("TSK"));
    const foremost = mockAdapter(await adapterResult("FOREMOST"));
    const { worker, repository, uploaded, persisted } = await createWorker(queuedJob("FOREMOST"), { TSK: tsk, FOREMOST: foremost });

    await worker.processJob("job-foremost");

    expect(foremost.recover).toHaveBeenCalledOnce();
    expect(tsk.recover).not.toHaveBeenCalled();
    expect(uploaded).toHaveLength(1);
    expect(persisted[0][0]).toMatchObject({ engine: "FOREMOST", workingCopyId: "working-copy-1" });
    expect((foremost.recover as any).mock.calls[0][0]).toContain("fixture.raw");
    expect((await repository.getById("job-foremost"))?.status).toBe("COMPLETED");
  });

  it("marks an unsupported persisted engine as FAILED without invoking an adapter", async () => {
    const tsk = mockAdapter(await adapterResult("TSK"));
    const foremost = mockAdapter(await adapterResult("FOREMOST"));
    const job = queuedJob("CUSTOM");
    const { worker, repository } = await createWorker(job, { TSK: tsk, FOREMOST: foremost });

    await expect(worker.processJob(job.id)).rejects.toMatchObject({ statusCode: 503 });

    expect(tsk.recover).not.toHaveBeenCalled();
    expect(foremost.recover).not.toHaveBeenCalled();
    const failed = await repository.getById(job.id);
    expect(failed?.status).toBe("FAILED");
    expect(failed?.errorMessage).toContain("Recovery engine CUSTOM is not supported by this worker");
  });

  it("rejects invalid working-copy provenance before downloading or executing recovery", async () => {
    const tsk = mockAdapter(await adapterResult("TSK"));
    const { worker, repository, storage } = await createWorker(
      queuedJob("TSK"),
      { TSK: tsk },
      { masterEvidenceId: "different-master-evidence" },
    );

    await expect(worker.processJob("job-tsk")).rejects.toMatchObject({ statusCode: 503 });

    expect(storage.download).not.toHaveBeenCalled();
    expect(tsk.recover).not.toHaveBeenCalled();
    const failed = await repository.getById("job-tsk");
    expect(failed?.status).toBe("FAILED");
    expect(failed?.errorMessage).toContain("Working copy master evidence does not match the recovery job");
  });
});
