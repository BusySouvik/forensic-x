import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { HttpError } from "../../middleware/httpError";
import { getEvidenceStorageService } from "../../services/evidenceStorage";
import { insertRecoveredCandidates } from "../../services/recoveredCandidates";
import type { RecoveryJobRecord, RecoveryJobRepository } from "../../services/recoveryJobs";
import { createStagingDirectory } from "./commandRunner";
import { ForemostRecoveryAdapter } from "./foremostRecoveryAdapter";
import { TskRecoveryAdapter } from "./tskRecoveryAdapter";

export type RecoveryArtifact = {
  path: string;
  size: number;
  sha256: string;
  contentType: string;
  kind: "FILE" | "DIRECTORY";
};

export type RecoveryExecutionContext = {
  jobId?: string;
  config?: Record<string, unknown>;
  stagingRoot?: string;
  stagedInput?: string;
};

export type RecoveryExecutionResult = {
  engine: string;
  executable: string;
  args: string[];
  outputLocation: string;
  artifacts: RecoveryArtifact[];
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: Date;
  finishedAt: Date;
  stagedInput?: string;
};

export interface RecoveryAdapterLike {
  recover(sourceIdentifier: string, context?: RecoveryExecutionContext): Promise<RecoveryExecutionResult>;
  validateEngine(): Promise<boolean> | boolean;
}

export type WorkingCopyContext = {
  id: string;
  investigationId: string;
  masterEvidenceId: string;
  storageObjectId: string;
  status: "QUEUED" | "CREATING" | "VERIFYING" | "COMPLETED" | "FAILED";
  investigatorId: string;
  authorizationId: string;
};

export type RecoveryWorkerOptions = {
  repository: RecoveryJobRepository;
  /** @deprecated Use adapters.TSK or adapters.FOREMOST. Retained for TSK worker callers. */
  adapter?: RecoveryAdapterLike;
  adapters?: Partial<Record<"TSK" | "FOREMOST", RecoveryAdapterLike>>;
  workerId?: string;
  pollIntervalMs?: number;
  getWorkingCopyById?: (id: string) => Promise<WorkingCopyContext | null>;
  getRecoveryJobById?: (id: string) => Promise<RecoveryJobRecord | null>;
  updateRecoveryJob?: (job: RecoveryJobRecord) => Promise<RecoveryJobRecord>;
  failRecoveryJob?: (jobId: string, message: string) => Promise<void>;
  logAudit?: (input: {
    actorId: string;
    investigationId: string;
    authorizationId?: string | null;
    recoveryJobId?: string | null;
    eventType: string;
    result: string;
    details?: string | null;
  }) => Promise<void>;
  storage?: any;
  insertRecoveredCandidates?: typeof insertRecoveredCandidates;
};

export class RecoveryWorker {
  private readonly repository: RecoveryJobRepository;
  private readonly adapters: Record<"TSK" | "FOREMOST", RecoveryAdapterLike>;
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly getWorkingCopyById: (id: string) => Promise<WorkingCopyContext | null>;
  private readonly getRecoveryJobById: (id: string) => Promise<RecoveryJobRecord | null>;
  private readonly updateRecoveryJob: (job: RecoveryJobRecord) => Promise<RecoveryJobRecord>;
  private readonly failRecoveryJob: (jobId: string, message: string) => Promise<void>;
  private readonly logAudit: NonNullable<RecoveryWorkerOptions["logAudit"]>;
  private readonly storageService: any | null;
  private readonly persistRecoveredCandidates: typeof insertRecoveredCandidates;

  constructor(options: RecoveryWorkerOptions) {
    this.repository = options.repository;
    this.adapters = {
      TSK: options.adapters?.TSK ?? options.adapter ?? new TskRecoveryAdapter(),
      FOREMOST: options.adapters?.FOREMOST ?? new ForemostRecoveryAdapter(),
    };
    this.workerId = options.workerId ?? `recovery-worker-${process.pid}`;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.getWorkingCopyById = options.getWorkingCopyById ?? (async () => null);
    this.getRecoveryJobById = options.getRecoveryJobById ?? ((id) => this.repository.getById(id));
    this.updateRecoveryJob = options.updateRecoveryJob ?? ((job) => this.repository.update(job));
    this.failRecoveryJob = options.failRecoveryJob ?? (async (jobId, message) => {
      const existing = await this.repository.getById(jobId);
      if (!existing) return;
      await this.repository.update({
        ...existing,
        status: "FAILED",
        errorMessage: message,
        updatedAt: new Date(),
      });
    });
    this.logAudit = options.logAudit ?? (async () => undefined);
    this.storageService = options.storage ?? null;
    this.persistRecoveredCandidates = options.insertRecoveredCandidates ?? insertRecoveredCandidates;
  }

  async processJob(jobId: string) {
    const job = await this.getRecoveryJobById(jobId);
    if (!job) {
      throw new HttpError(404, "Recovery job not found");
    }
    if (job.status !== "QUEUED") {
      throw new HttpError(409, "Recovery job is not in a claimable state");
    }

    const workingCopy = await this.getWorkingCopyById(job.workingCopyId);
    if (!workingCopy) {
      throw new HttpError(404, "Working copy not found for recovery job");
    }

    const validating = await this.updateRecoveryJob({
      ...job,
      status: "VALIDATING",
      updatedAt: new Date(),
    });

    try {
      this.validateWorkingCopyProvenance(validating, workingCopy);
      const recovering = await this.updateRecoveryJob({
        ...validating,
        status: "RECOVERING",
        startedAt: validating.startedAt ?? new Date(),
        updatedAt: new Date(),
      });
      const adapter = this.getAdapter(recovering.engine);
      const storage = this.storageService ?? getEvidenceStorageService();
      const dl = await storage.download(workingCopy.storageObjectId);
      // support either { record, stream } or a bare Readable
      let record: any = null;
      let stream: any = null;
      const { Readable } = await import("node:stream");
      if (dl && (dl.readable === true || dl instanceof Readable || typeof dl.pipe === "function")) {
        stream = dl as any;
      } else if (dl && typeof dl === "object") {
        record = (dl as any).record ?? null;
        stream = (dl as any).stream ?? null;
      }
      const stageDir = await createStagingDirectory(path.join(process.cwd(), ".forensic-x", "recovery-"));
      const stagedInput = path.join(stageDir, (record && record.originalFilename) ? record.originalFilename : `${workingCopy.id}.E01`);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await writeFile(stagedInput, Buffer.concat(chunks));

      const result = await adapter.recover(stagedInput, {
        jobId: recovering.id,
        config: recovering.config,
        stagingRoot: path.join(process.cwd(), ".forensic-x", "recovery"),
        stagedInput,
      });

      const collecting = await this.updateRecoveryJob({
        ...recovering,
        status: "COLLECTING",
        outputLocation: result.outputLocation,
        updatedAt: new Date(),
      });

      // Persist recovered artifacts as durable candidates
      try {
        const candidateItems = [] as any[];
        for (const art of result.artifacts) {
          const data = await readFile(art.path);
          const stored = await storage.upload({
            storageClass: "RECOVERED_EVIDENCE",
            filename: path.basename(art.path),
            body: data,
            contentType: art.contentType ?? "application/octet-stream",
            investigationId: recovering.investigationId,
            evidenceId: recovering.masterEvidenceId,
          });

          candidateItems.push({
            investigationId: recovering.investigationId,
            recoveryJobId: recovering.id,
            workingCopyId: recovering.workingCopyId,
            masterEvidenceId: recovering.masterEvidenceId,
            method: recovering.method ?? "TSK",
            engine: result.engine,
            sourcePath: result.stagedInput ?? null,
            sourceOffset: (result as any).provenance?.partitionStartSector ?? null,
            sourceMetadata: JSON.stringify({ listing: result.stdout?.slice?.(0, 4096) ?? null }),
            recoveredPath: stored.objectKey,
            size: art.size,
            storageObjectId: stored.id,
            provisionalSha256: art.sha256,
            status: "COLLECTED",
            provenance: (result as any).provenance ?? {},
          });
        }

        if (candidateItems.length > 0) {
          await this.persistRecoveredCandidates(candidateItems);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.failRecoveryJob(recovering.id, `Failed to persist recovered candidates: ${message}`);
        await this.logAudit({
          actorId: recovering.requestedBy,
          investigationId: recovering.investigationId,
          authorizationId: recovering.authorizationId,
          recoveryJobId: recovering.id,
          eventType: "FAILED",
          result: "ERROR",
          details: `recoveryJobId=${recovering.id}; error=${message}`,
        });
        throw new HttpError(500, `Failed to persist recovered candidates: ${message}`);
      }

      const completed = await this.updateRecoveryJob({
        ...collecting,
        status: "COMPLETED",
        outputLocation: result.outputLocation,
        completedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      });

      await this.logAudit({
        actorId: recovering.requestedBy,
        investigationId: recovering.investigationId,
        authorizationId: recovering.authorizationId,
        recoveryJobId: recovering.id,
        eventType: "COMPLETED",
        result: "SUCCESS",
        details: `recoveryJobId=${recovering.id}; outputLocation=${result.outputLocation}; artifacts=${result.artifacts.length}`,
      });

      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown recovery failure";
      await this.failRecoveryJob(validating.id, message);
      await this.logAudit({
        actorId: validating.requestedBy,
        investigationId: validating.investigationId,
        authorizationId: validating.authorizationId,
        recoveryJobId: validating.id,
        eventType: "FAILED",
        result: "ERROR",
        details: `recoveryJobId=${validating.id}; error=${message}`,
      });
      throw new HttpError(503, message);
    }
  }

  async cancelJob(jobId: string, reason = "Recovery cancelled by operator") {
    const job = await this.getRecoveryJobById(jobId);
    if (!job) {
      throw new HttpError(404, "Recovery job not found");
    }
    if (!["QUEUED", "VALIDATING", "RECOVERING", "COLLECTING"].includes(job.status)) {
      return job;
    }

    const cancelled = await this.updateRecoveryJob({
      ...job,
      status: "CANCELLED",
      errorMessage: reason,
      completedAt: new Date(),
      updatedAt: new Date(),
    });

    await this.logAudit({
      actorId: job.requestedBy,
      investigationId: job.investigationId,
      authorizationId: job.authorizationId,
      recoveryJobId: job.id,
      eventType: "CANCELLED",
      result: "SUCCESS",
      details: `recoveryJobId=${job.id}; reason=${reason}`,
    });

    return cancelled;
  }

  async claimNextQueuedJob() {
    return this.repository.findNextQueued();
  }

  async runLoop() {
    while (true) {
      const queued = await this.repository.findNextQueued();
      if (!queued) {
        await delay(this.pollIntervalMs);
        continue;
      }

      try {
        await this.processJob(queued.id);
      } catch {
        // The job is already marked failed with the reason recorded.
      }
    }
  }

  async validateEngine() {
    return true;
  }

  private getAdapter(engine: RecoveryJobRecord["engine"]): RecoveryAdapterLike {
    if (engine === "TSK" || engine === "FOREMOST") {
      return this.adapters[engine];
    }
    throw new HttpError(400, `Recovery engine ${engine} is not supported by this worker`);
  }

  private validateWorkingCopyProvenance(job: RecoveryJobRecord, workingCopy: WorkingCopyContext) {
    if (workingCopy.investigationId !== job.investigationId) {
      throw new HttpError(403, "Working copy does not belong to the recovery job investigation");
    }
    if (workingCopy.masterEvidenceId !== job.masterEvidenceId) {
      throw new HttpError(403, "Working copy master evidence does not match the recovery job");
    }
    if (workingCopy.status !== "COMPLETED" || !workingCopy.storageObjectId) {
      throw new HttpError(409, "Working copy is not ready for recovery");
    }
  }
}

const workerEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isWorkerEntryPoint = !!workerEntryPath && workerEntryPath === path.resolve(fileURLToPath(import.meta.url));

if (isWorkerEntryPoint) {
  void (async () => {
    const { DrizzleRecoveryJobRepository } = await import("../../services/recoveryJobs");
    const worker = new RecoveryWorker({
      repository: new DrizzleRecoveryJobRepository(),
      workerId: process.env.FORENSIC_X_WORKER_ID ?? `recovery-worker-${process.pid}`,
      pollIntervalMs: Number(process.env.FORENSIC_X_WORKER_POLL_MS ?? 5000),
      getWorkingCopyById: async (id) => {
        const db = await import("../../db");
        const { workingCopies } = await import("../../db/schema");
        const { eq } = await import("drizzle-orm");
        const [row] = await db.getDb().select().from(workingCopies).where(eq(workingCopies.id, id)).limit(1);
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
      },
      logAudit: async (input) => {
        const { logRecoveryJobAudit } = await import("../../services/recoveryJobs");
        await logRecoveryJobAudit(input);
      },
    });

    try {
      console.log(`Starting recovery worker ${worker["workerId"] ?? "unknown"}`);
      await worker.runLoop();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown worker startup failure";
      console.error(message);
      process.exitCode = 1;
    }
  })();
}
