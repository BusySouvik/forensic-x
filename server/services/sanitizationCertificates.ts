import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { getDb } from "../db";
import { HttpError } from "../middleware/httpError";
import { auditEvents, operationAuthorizations, sanitization_certificates, sanitization_jobs } from "../db/schema";
import { signingService } from "./signing";

export type SanitizationCertificateCreator = {
  create(input: { investigationId: string; sanitizationJobId: string; actorId: string }): Promise<{ id: string }>;
};

/** Creates the certificate and makes the verified job CERTIFICATE_READY atomically. */
export async function createSanitizationCertificate(input: { investigationId: string; sanitizationJobId: string; actorId: string }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(sanitization_jobs)
      .where(and(eq(sanitization_jobs.id, input.sanitizationJobId), eq(sanitization_jobs.investigationId, input.investigationId)))
      .limit(1).for("update");
    if (!job) throw new HttpError(404, "Sanitization job not found");
    if (job.status !== "VERIFYING" || job.verificationStatus !== "VERIFIED") throw new HttpError(409, "Sanitization job has not passed verification");
    if (!job.performerId) throw new HttpError(409, "Sanitization job has no persisted performer");

    const [authorization] = await tx.select().from(operationAuthorizations).where(eq(operationAuthorizations.id, job.authorizationId)).limit(1);
    if (!authorization || authorization.investigationId !== job.investigationId || authorization.operationType !== "SANITIZATION" || authorization.status !== "APPROVED") {
      throw new HttpError(403, "Sanitization authorization is not valid for certificate creation");
    }

    const generatedAt = new Date();
    const certificateId = crypto.randomUUID();
    const payload = {
      certificateType: "SANITIZATION",
      certificateId,
      sanitizationJobId: job.id,
      investigationId: job.investigationId,
      authorizationId: job.authorizationId,
      requestedBy: job.requestedBy,
      targetType: job.targetType,
      targetReference: job.targetReference,
      targetStableIdentifier: job.targetStableIdentifier ?? null,
      sanitizationMethod: job.sanitizationMethod,
      bytesAffected: job.bytesAffected ?? null,
      verificationStatus: job.verificationStatus,
      verificationDetails: job.verificationDetails ?? {},
      performerId: job.performerId,
      startedAt: job.startedAt?.toISOString() ?? null,
      generatedAt: generatedAt.toISOString(),
      finalResult: "SANITIZATION_SUCCEEDED_AND_VERIFIED",
      signing: { algorithm: "HMAC-SHA256", environment: "development-only" },
    };
    const payloadHash = signingService.computePayloadHash(payload);
    const signature = signingService.signPayload(job.performerId, payload);
    const [certificate] = await tx.insert(sanitization_certificates).values({
      id: certificateId, investigationId: job.investigationId, sanitizationJobId: job.id, authorizationId: job.authorizationId,
      targetType: job.targetType, targetReference: job.targetReference, targetStableIdentifier: job.targetStableIdentifier ?? null,
      storageMetadata: {}, sanitizationMethod: job.sanitizationMethod, bytesAffected: job.bytesAffected ?? null,
      verificationResult: job.verificationStatus, verificationDetails: job.verificationDetails ?? {}, performerId: job.performerId,
      payload, payloadHash, signature: signature.signature, signerId: job.performerId, createdAt: generatedAt,
    }).returning();

    const [ready] = await tx.update(sanitization_jobs)
      .set({ certificateId: certificate.id, status: "CERTIFICATE_READY", updatedAt: generatedAt })
      .where(and(eq(sanitization_jobs.id, job.id), eq(sanitization_jobs.status, "VERIFYING"))).returning();
    if (!ready) throw new HttpError(409, "Sanitization job changed before certificate could be recorded");

    await tx.insert(auditEvents).values({
      investigationId: job.investigationId,
      authorizationId: job.authorizationId,
      actorId: job.performerId,
      eventType: "COMPLETED" as any,
      result: "SANITIZATION_CERTIFICATE_CREATED",
      details: `job=${job.id}; investigation=${job.investigationId}; targetType=${job.targetType}; target=${job.targetReference}; method=${job.sanitizationMethod}; state=CERTIFICATE_READY; certificate=${certificate.id}; performer=${job.performerId}`,
    });
    return certificate;
  });
}

export const sanitizationCertificateCreator: SanitizationCertificateCreator = { create: createSanitizationCertificate };

export async function getSanitizationCertificateById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(sanitization_certificates).where(eq(sanitization_certificates.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Certificate not found");
  return row;
}
