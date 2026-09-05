import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "../../middleware/httpError";
import { createAcquisitionService, getDefaultAcquisitionRepository, logAcquisitionAudit, type AcquisitionAdapterLike } from "../../services/acquisitions";
import { getEvidenceStorageService } from "../../services/evidenceStorage";
import { EwfAcquisitionAdapter } from "./ewfAcquisitionAdapter";
import { resolveEwfExecutable } from "./commandRunner";

export type AcquisitionWorkerOptions = {
  service?: ReturnType<typeof createAcquisitionService>;
  adapter?: AcquisitionAdapterLike;
  engineExecutable?: string;
  workerId?: string;
  pollIntervalMs?: number;
};

export class AcquisitionWorker {
  private readonly service: ReturnType<typeof createAcquisitionService>;
  private readonly adapter: AcquisitionAdapterLike;
  private readonly workerId: string;
  private readonly pollIntervalMs: number;

  constructor(options: AcquisitionWorkerOptions = {}) {
    const adapter = options.adapter ?? new EwfAcquisitionAdapter({ executable: options.engineExecutable });
    this.adapter = adapter;
    this.workerId = options.workerId ?? `worker-${process.pid}`;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.service = options.service ?? createAcquisitionService({
      repository: getDefaultAcquisitionRepository(),
      evidenceStorage: getEvidenceStorageService(),
      acquisitionAdapter: adapter,
      auditLogger: logAcquisitionAudit,
    });
  }

  async processJob(jobId: string) {
    const job = await this.service.getById(jobId);
    const claimed = job.status === "QUEUED" ? await this.service.claimJob(jobId, this.workerId) : job;

    if (claimed.status !== "VALIDATING") {
      throw new HttpError(409, "Job is not in a claimable state for worker processing");
    }

    await this.service.runJob(claimed.id);

    try {
      await this.service.setStatus(claimed.id, "VERIFYING", "Acquisition complete; verifying E01 hash");
      const acquired = await this.adapter.acquire(job.sourceIdentifier);
      if (!acquired.sha256 || acquired.sha256.length !== 64) {
        throw new HttpError(500, "Acquired image hash is invalid");
      }
      await this.service.setStatus(claimed.id, "UPLOADING", "Validated image ready for master upload");
      const finalJob = await this.service.completeJob(
        claimed.id,
        {
          sourceType: job.sourceType,
          sourceIdentifier: claimed.sourceIdentifier,
        },
        acquired,
      );
      return finalJob;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown acquisition failure";
      await this.service.failJob(claimed.id, message);
      throw error;
    }
  }

  async claimNextQueuedJob() {
    return this.service.claimNextQueuedJob(this.workerId);
  }

  async runLoop() {
    while (true) {
      const queued = await this.service.claimNextQueuedJob(this.workerId);
      if (!queued) {
        await delay(this.pollIntervalMs);
        continue;
      }

      try {
        await this.processJob(queued.id);
      } catch {
        // The job itself is already failed and recorded.
      }
    }
  }

  async validateEngine() {
    resolveEwfExecutable(process.env.FORENSIC_ACQUISITION_EXECUTABLE);
    return true;
  }
}

const workerEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isWorkerEntryPoint = !!workerEntryPath && workerEntryPath === path.resolve(fileURLToPath(import.meta.url));

if (isWorkerEntryPoint) {
  const worker = new AcquisitionWorker({
    engineExecutable: process.env.FORENSIC_ACQUISITION_EXECUTABLE,
    workerId: process.env.FORENSIC_X_WORKER_ID ?? `worker-${process.pid}`,
    pollIntervalMs: Number(process.env.FORENSIC_X_WORKER_POLL_MS ?? 5000),
  });

  worker
    .validateEngine()
    .then(() => {
      console.log(`Starting acquisition worker ${worker["workerId"] ?? "unknown"}`);
      return worker.runLoop();
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown worker startup failure";
      console.error(message);
      process.exitCode = 1;
    });
}
