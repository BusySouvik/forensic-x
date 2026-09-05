import { setTimeout as delay } from "node:timers/promises";
import { TestSanitizationAdapter, type TestSanitizationResult, type TestSanitizationVerificationResult } from "./testSanitizationAdapter";
import { createSanitizationJobService, DrizzleSanitizationJobRepository, logSanitizationJobAudit, type SanitizationJobRecord } from "../../services/sanitizationJobs";
import { sanitizationCertificateCreator, type SanitizationCertificateCreator } from "../../services/sanitizationCertificates";
import { env } from "../../config/env";
import { getDb } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";

export type SanitizationWorkerOptions = {
  service?: ReturnType<typeof createSanitizationJobService>;
  adapter?: SanitizationAdapter;
  certificateCreator?: SanitizationCertificateCreator;
  workerId?: string;
  workerIdentityValidator?: (workerId: string) => Promise<boolean>;
  pollIntervalMs?: number;
};

export type SanitizationAdapter = {
  sanitize(targetPath: string, method: string): Promise<TestSanitizationResult>;
  verify(targetPath: string, method: string, executionResult: TestSanitizationResult): Promise<TestSanitizationVerificationResult>;
};

export function resolveSanitizationWorkerId(configuredWorkerId = env.FORENSIC_X_WORKER_ID) {
  if (!configuredWorkerId) {
    throw new Error("FORENSIC_X_WORKER_ID must be configured with an existing users.id UUID before starting the sanitization worker");
  }
  return configuredWorkerId;
}

export class SanitizationWorker {
  private readonly service: ReturnType<typeof createSanitizationJobService>;
  private readonly adapter: SanitizationAdapter;
  private readonly certificateCreator: SanitizationCertificateCreator;
  private readonly workerId: string;
  private readonly workerIdentityValidator: (workerId: string) => Promise<boolean>;
  private identityValidated = false;
  private readonly pollIntervalMs: number;

  constructor(options: SanitizationWorkerOptions = {}) {
    this.adapter = options.adapter ?? new TestSanitizationAdapter();
    this.certificateCreator = options.certificateCreator ?? sanitizationCertificateCreator;
    this.workerId = options.workerId ?? resolveSanitizationWorkerId();
    this.workerIdentityValidator = options.workerIdentityValidator ?? (options.service
      ? async () => true
      : async (workerId) => Boolean((await getDb().select({ id: users.id }).from(users).where(eq(users.id, workerId)).limit(1))[0]));
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.service = options.service ?? createSanitizationJobService({ repository: new DrizzleSanitizationJobRepository(), auditLogger: logSanitizationJobAudit });
  }

  async processJob(job: SanitizationJobRecord) {
    await this.assertWorkerIdentity();
    if (job.status !== "SANITIZING") throw new Error("Job has not been claimed");
    let result: TestSanitizationResult;
    try {
      result = await this.adapter.sanitize(job.targetReference, job.sanitizationMethod);
    } catch (err) {
      await this.service.failJob(job.id, String(err instanceof Error ? err.message : err), this.workerId);
      throw err;
    }

    if (result.status === "UNSUPPORTED") {
      await this.service.setStatus(job.id, "UNSUPPORTED_METHOD", "Method unsupported on target", this.workerId);
      return;
    }
    if (result.status !== "SUCCEEDED") {
      await this.service.failJob(job.id, `Sanitization failed: ${JSON.stringify(result.executionDetails)}`, this.workerId);
      return;
    }

    await this.service.setStatus(job.id, "VERIFYING", "Sanitization complete; verifying result", this.workerId);
    try {
      const verification = await this.adapter.verify(job.targetReference, job.sanitizationMethod, result);
      if (verification.status === "VERIFIED") {
        const verifiedJob = await this.service.recordVerificationPassed(job.id, { bytesAffected: result.bytesAffected ?? null, verificationDetails: verification.details, performerId: this.workerId });
        try {
          const certificate = await this.certificateCreator.create({
            investigationId: verifiedJob.investigationId,
            sanitizationJobId: verifiedJob.id,
            actorId: verifiedJob.performerId ?? this.workerId,
          });
          await this.service.completeCertifiedJob(job.id, certificate.id, verifiedJob.performerId ?? this.workerId);
        } catch (err) {
          const failureReason = `Certificate creation/finalization failed: ${String(err instanceof Error ? err.message : err)}`;
          // Reload persisted job state to determine whether the certificate
          // creation transaction managed to set CERTIFICATE_READY before failing.
          let persisted: SanitizationJobRecord | null = null;
          try {
            persisted = await this.service.getById(job.id);
          } catch (reloadErr) {
            // If reload fails, emit an audit for certificate generation failure
            // attributed to the persisted performer if available, else the worker.
            const actor = verifiedJob.performerId ?? this.workerId;
            await logSanitizationJobAudit({ actorId: actor, investigationId: verifiedJob.investigationId, authorizationId: verifiedJob.authorizationId, sanitizationJobId: verifiedJob.id, eventType: "FAILED", result: "CERTIFICATE_GENERATION_FAILED", details: `job=${verifiedJob.id}; reason=${failureReason}; reloadError=${String(reloadErr instanceof Error ? reloadErr.message : reloadErr)}` });
            return;
          }

          const actor = persisted?.performerId ?? verifiedJob.performerId ?? this.workerId;
          if (persisted && persisted.status === "CERTIFICATE_READY") {
            // The certificate transaction committed the certificate-ready state
            // before the failure occurred; record certificate failure using the
            // existing guarded path which expects CERTIFICATE_READY -> CERTIFICATE_FAILED.
            try {
              await this.service.failCertificate(job.id, failureReason, actor);
            } catch (failErr) {
              // If recording certificate failure itself fails, emit an audit.
                await logSanitizationJobAudit({ actorId: actor, investigationId: verifiedJob.investigationId, authorizationId: verifiedJob.authorizationId, sanitizationJobId: verifiedJob.id, eventType: "FAILED", result: "CERTIFICATE_GENERATION_FAILED", details: `job=${verifiedJob.id}; reason=${failureReason}; failRecordError=${String(failErr instanceof Error ? failErr.message : failErr)}` });
            }
            return;
          }

          // If the persisted job is still VERIFYING (transaction didn't commit the
          // CERTIFICATE_READY transition), do not call failCertificate as that
          // would be an invalid transition. Instead, write an audit describing
          // the certificate-generation failure while preserving verification data.
          await logSanitizationJobAudit({ actorId: actor, investigationId: verifiedJob.investigationId, authorizationId: verifiedJob.authorizationId, sanitizationJobId: verifiedJob.id, eventType: "FAILED", result: "CERTIFICATE_GENERATION_FAILED", details: `job=${verifiedJob.id}; reason=${failureReason}; persistedStatus=${persisted?.status}` });
          return;
        }
      } else {
        await this.service.failVerification(job.id, verification.details, this.workerId);
      }
    } catch (err) {
      const failureReason = String(err instanceof Error ? err.message : err);
      await this.service.failVerification(job.id, {
        status: "FAILED",
        method: job.sanitizationMethod,
        targetReference: job.targetReference,
        verificationTimestamp: new Date().toISOString(),
        expectedState: "independent verification",
        actualState: "verification-error",
        failureReason,
      }, this.workerId);
      throw err;
    }
  }

  async claimNextQueuedJob() {
    await this.assertWorkerIdentity();
    return this.service.claimNextQueuedJob(this.workerId);
  }

  private async assertWorkerIdentity() {
    if (this.identityValidated) return;
    // Validate UUID format first to fail fast on malformed config
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(this.workerId)) {
      throw new Error(`FORENSIC_X_WORKER_ID=${this.workerId} is not a valid UUID`);
    }
    if (!await this.workerIdentityValidator(this.workerId)) {
      throw new Error(`FORENSIC_X_WORKER_ID=${this.workerId} does not identify an existing user`);
    }
    this.identityValidated = true;
  }

  async runLoop() {
    while (true) {
      const queued = await this.claimNextQueuedJob();
      if (!queued) {
        await delay(this.pollIntervalMs);
        continue;
      }
      try {
        await this.processJob(queued);
      } catch {
        // already handled
      }
    }
  }
}

if (require.main === module) {
  const worker = new SanitizationWorker({ workerId: process.env.FORENSIC_X_WORKER_ID });
  worker.runLoop().catch((err) => { console.error(err); process.exit(1); });
}
