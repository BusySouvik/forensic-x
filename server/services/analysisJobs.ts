import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { analysisJobs, analysisResults, auditEvents, recoveryCertificates, workingCopies } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { assertStageAccess } from "./investigationWorkflow";

export async function createAnalysisJob(input: {
  investigationId: string;
  actorId: string;
  validationCertificateId: string;
}) {
  await assertStageAccess(input.investigationId, input.actorId, "ANALYSIS");
  const db = getDb();
  const [certificate] = await db.select().from(recoveryCertificates).where(and(
    eq(recoveryCertificates.id, input.validationCertificateId),
    eq(recoveryCertificates.investigationId, input.investigationId),
  )).limit(1);
  if (!certificate) throw new HttpError(404, "Validated recovery certificate not found");
  if (certificate.status !== "VALIDATED" || !certificate.validationSignature) {
    throw new HttpError(409, "Analysis requires an independently validated recovery certificate");
  }
  const [workingCopy] = await db.select().from(workingCopies).where(and(
    eq(workingCopies.id, certificate.workingCopyId),
    eq(workingCopies.investigationId, input.investigationId),
  )).limit(1);
  if (!workingCopy) throw new HttpError(409, "Validated certificate has no accessible working copy");
  if (workingCopy.status !== "COMPLETED") throw new HttpError(409, "Analysis requires a completed working copy");

  const [existing] = await db.select().from(analysisJobs).where(and(
    eq(analysisJobs.investigationId, input.investigationId),
    eq(analysisJobs.validationCertificateId, input.validationCertificateId),
    eq(analysisJobs.workingCopyId, certificate.workingCopyId),
  )).orderBy(desc(analysisJobs.createdAt)).limit(1);
  if (existing && ["QUEUED", "WAITING_FOR_WORKER", "RUNNING", "COMPLETED"].includes(existing.status)) return existing;

  const [job] = await db.insert(analysisJobs).values({
    investigationId: input.investigationId,
    requestedBy: input.actorId,
    validationCertificateId: certificate.id,
    workingCopyId: workingCopy.id,
    status: "WAITING_FOR_WORKER",
    inputSha256: workingCopy.workingCopySha256 || null,
  }).returning();
  if (!job) throw new HttpError(500, "Failed to create analysis job");
  await db.insert(auditEvents).values({
    investigationId: input.investigationId,
    actorId: input.actorId,
    eventType: "REQUESTED",
    result: "WAITING_FOR_WORKER",
    details: `analysisJob=${job.id}; validationCertificate=${certificate.id}; workingCopy=${workingCopy.id}`,
  });
  return job;
}

export async function listAnalysisJobs(investigationId: string) {
  return getDb().select().from(analysisJobs).where(eq(analysisJobs.investigationId, investigationId)).orderBy(desc(analysisJobs.createdAt));
}

export async function getAnalysisJob(id: string, investigationId: string) {
  const [job] = await getDb().select().from(analysisJobs).where(and(
    eq(analysisJobs.id, id),
    eq(analysisJobs.investigationId, investigationId),
  )).limit(1);
  if (!job) throw new HttpError(404, "Analysis job not found");
  return job;
}

export async function listAnalysisResults(analysisJobId: string, investigationId: string) {
  await getAnalysisJob(analysisJobId, investigationId);
  return getDb().select().from(analysisResults).where(and(
    eq(analysisResults.analysisJobId, analysisJobId),
    eq(analysisResults.investigationId, investigationId),
  )).orderBy(desc(analysisResults.createdAt));
}
