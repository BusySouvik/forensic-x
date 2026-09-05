import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEvidenceStorageService, MemoryStorageReferenceStore } from "./evidenceStorage";
import { MemoryObjectStore } from "../storage/memoryObjectStore";
import {
  assertTestFixtureEnvironment,
  ingestTestFixture,
  readRegularFixtureFile,
  type TestFixtureIngestionRepository,
} from "./testFixtureIngestion";
import { createWorkingCopyService, type WorkingCopyRecord, type WorkingCopyRepository } from "./workingCopies";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createRawFixture(contents = "disposable raw fixture") {
  const directory = await mkdtemp(path.join(tmpdir(), "forensic-x-fixture-"));
  temporaryDirectories.push(directory);
  const fixturePath = path.join(directory, "fixture.raw");
  await writeFile(fixturePath, contents);
  return { fixturePath, bytes: Buffer.from(contents) };
}

class MemoryFixtureRepository implements TestFixtureIngestionRepository {
  authorized = false;
  masterInput: any = null;
  async assertAuthorized() { this.authorized = true; }
  async createMaster(input: any) {
    this.masterInput = input;
    return { acquisitionJobId: "fixture-acquisition-1", masterEvidenceId: "fixture-master-1" };
  }
}

async function createStorage() {
  const store = new MemoryObjectStore();
  const refs = new MemoryStorageReferenceStore();
  return { storage: createEvidenceStorageService(store, refs) };
}

describe("test fixture ingestion", () => {
  it("requires an explicit development/test guard", () => {
    expect(() => assertTestFixtureEnvironment("production", "true")).toThrow(/development or test/i);
    expect(() => assertTestFixtureEnvironment("test", undefined)).toThrow(/FORENSIC_X_ENABLE_TEST_FIXTURE_INGESTION/i);
  });

  it("rejects missing files, directories, and physical/device paths", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "forensic-x-fixture-directory-"));
    temporaryDirectories.push(directory);
    await expect(readRegularFixtureFile(path.join(directory, "missing.raw"))).rejects.toMatchObject({ statusCode: 404 });
    await expect(readRegularFixtureFile(directory)).rejects.toMatchObject({ statusCode: 400 });
    await expect(readRegularFixtureFile("\\\\.\\PhysicalDrive0")).rejects.toMatchObject({ statusCode: 400 });
    await expect(readRegularFixtureFile("PhysicalDrive1")).rejects.toMatchObject({ statusCode: 400 });
    await expect(readRegularFixtureFile("\\\\server\\share\\fixture.raw")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("stores ordinary fixture bytes as a protected master with TEST_FIXTURE provenance", async () => {
    const fixture = await createRawFixture("actual fixture bytes");
    const { storage } = await createStorage();
    const repository = new MemoryFixtureRepository();
    const result = await ingestTestFixture({
      fixturePath: fixture.fixturePath, investigationId: "investigation-1", actorId: "actor-1", authorizationId: "authorization-1",
      environment: "test", enabled: "true",
    }, { storage, repository });

    const expectedHash = createHash("sha256").update(fixture.bytes).digest("hex");
    expect(result.sha256).toBe(expectedHash);
    expect(result.size).toBe(fixture.bytes.byteLength);
    expect(result.provenance).toBe("TEST_FIXTURE");
    expect(result.storageObject.storageClass).toBe("FORENSIC_IMAGE");
    expect(result.storageObject.deletionPolicy).toBe("MASTER_IMAGE_PROTECTED");
    expect(repository.authorized).toBe(true);
    expect(repository.masterInput).toMatchObject({
      storageObjectId: result.storageObject.id, sha256: expectedHash, size: fixture.bytes.byteLength, fixtureFilename: "fixture.raw",
    });
    expect(repository.masterInput).not.toHaveProperty("bytes");
    const downloaded = await storage.download(result.storageObject.id);
    const chunks: Buffer[] = [];
    for await (const chunk of downloaded.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(fixture.bytes);
    await expect(storage.delete(result.storageObject.id)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("produces a master context consumable by the existing working-copy service", async () => {
    const fixture = await createRawFixture();
    const { storage } = await createStorage();
    const ingested = await ingestTestFixture({
      fixturePath: fixture.fixturePath, investigationId: "investigation-1", actorId: "actor-1", authorizationId: "authorization-1",
      environment: "test", enabled: "true",
    }, { storage, repository: new MemoryFixtureRepository() });
    const records = new Map<string, WorkingCopyRecord>();
    const repository: WorkingCopyRepository = {
      getById: async (id) => records.get(id) ?? null,
      listForInvestigation: async () => Array.from(records.values()),
      insert: async (record) => { records.set(record.id, record); return record; },
      update: async (record) => { records.set(record.id, record); return record; },
    };
    const service = createWorkingCopyService({
      repository, evidenceStorage: storage, auditLogger: async () => undefined,
      validateInvestigation: async () => ({ id: "investigation-1" }),
      validateMasterEvidence: async (id) => id === ingested.masterEvidenceId ? ({
        id, investigationId: "investigation-1", masterStorageObjectId: ingested.storageObject.id, status: "AVAILABLE", sha256: ingested.sha256,
      }) : null,
      requireApprovedAuthorization: async () => ({
        id: "recovery-authorization-1", investigationId: "investigation-1", requestedBy: "actor-1", status: "APPROVED", operationType: "RECOVERY",
      }),
    });
    const workingCopy = await service.createWorkingCopy({
      investigationId: "investigation-1", masterEvidenceId: ingested.masterEvidenceId, investigatorId: "actor-1", authorizationId: "recovery-authorization-1",
    });
    expect(workingCopy.status).toBe("COMPLETED");
    expect(workingCopy.masterStorageObjectId).toBe(ingested.storageObject.id);
    expect(workingCopy.sourceMasterSHA256).toBe(ingested.sha256);
  });
});
