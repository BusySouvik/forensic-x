import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { HttpError } from "../middleware/httpError";
import { recoveryCertificates, recoveredCandidates, recoveryJobs, workingCopies, evidenceRecords, storageObjects, auditEvents } from "../db/schema";
import { signingService } from "./signing";

export async function createRecoveryCertificate(input: { investigationId: string; recoveredCandidateId: string; actorId: string; }) {
  const db = getDb();
  const [candidate] = await db.select().from(recoveredCandidates).where(eq(recoveredCandidates.id, input.recoveredCandidateId)).limit(1);
  if (!candidate) throw new HttpError(404, "Recovered candidate not found");
  if (candidate.investigationId !== input.investigationId) throw new HttpError(403, "Candidate does not belong to investigation");

  const [job] = await db.select().from(recoveryJobs).where(eq(recoveryJobs.id, candidate.recoveryJobId)).limit(1);
  if (!job) throw new HttpError(404, "Recovery job not found");

  const [wc] = await db.select().from(workingCopies).where(eq(workingCopies.id, candidate.workingCopyId)).limit(1);
  if (!wc) throw new HttpError(404, "Working copy not found");

  const [master] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, candidate.masterEvidenceId)).limit(1);
  if (!master) throw new HttpError(404, "Master evidence not found");

  let artifact: any = null;
  if (candidate.storageObjectId) {
    const [a] = await db.select().from(storageObjects).where(eq(storageObjects.id, candidate.storageObjectId)).limit(1);
    artifact = a ?? null;
  }
  if (!artifact) throw new HttpError(404, "Recovered artifact storage object not found");

  const payload = {
    recoveryJobId: job.id,
    workingCopyId: wc.id,
    masterEvidenceId: master.id,
    engine: candidate.engine,
    method: candidate.method,
    artifactSize: candidate.size,
    artifactSha256: candidate.provisionalSha256,
    recoveredPath: candidate.recoveredPath,
    provenance: candidate.provenance ?? {},
  };

  const payloadHash = signingService.computePayloadHash(payload);
  const signature = signingService.signPayload(input.actorId, payload);

  const [row] = await db.insert(recoveryCertificates).values({
    investigationId: input.investigationId,
    recoveredCandidateId: candidate.id,
    recoveryJobId: job.id,
    workingCopyId: wc.id,
    masterEvidenceId: master.id,
    artifactStorageObjectId: artifact.id,
    artifactSize: candidate.size ?? null,
    artifactSha256: candidate.provisionalSha256 ?? null,
    payload,
    payloadHash,
    createdBy: input.actorId,
    recoverySignature: signature.signature,
    recoverySignerId: input.actorId,
    status: "READY_FOR_VALIDATION",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  await db.insert(auditEvents).values({
    investigationId: input.investigationId,
    actorId: input.actorId,
    eventType: "COMPLETED",
    result: "RECOVERY_CERTIFICATE_CREATED",
    details: `candidate=${candidate.id}; certificate=${row.id}`,
  });

  return row;
}

export async function getCertificateById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(recoveryCertificates).where(eq(recoveryCertificates.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Certificate not found");
  return row;
}

export async function validateAndSignCertificate(input: { certificateId: string; actorId: string; investigationId: string; }) {
  const db = getDb();
  const cert = await getCertificateById(input.certificateId);
  if (cert.investigationId !== input.investigationId) throw new HttpError(403, "Certificate does not belong to investigation");

  // Reconstruct authoritative values
  const [candidate] = await db.select().from(recoveredCandidates).where(eq(recoveredCandidates.id, cert.recoveredCandidateId)).limit(1);
  if (!candidate) throw new HttpError(404, "Recovered candidate not found");

  let artifact: any = null;
  if (candidate.storageObjectId) {
    const [a] = await db.select().from(storageObjects).where(eq(storageObjects.id, candidate.storageObjectId)).limit(1);
    artifact = a ?? null;
  }

  const details: Record<string, any> = { checks: [] };
  let passed = true;

  // Verify Investigator 1 signature and payload hash
  try {
    const validSig = signingService.verifyPayload(cert.recoverySignerId ?? cert.createdBy, cert.payload, cert.recoverySignature ?? "");
    if (!validSig) {
      details.checks.push({ field: "recoverySignature", result: "INVALID" });
      passed = false;
    } else {
      details.checks.push({ field: "recoverySignature", result: "OK" });
    }
  } catch (err) {
    details.checks.push({ field: "recoverySignature", result: "ERROR" });
    passed = false;
  }

  // Verify payload hash
  try {
    const computed = signingService.computePayloadHash(cert.payload);
    if (cert.payloadHash && cert.payloadHash !== computed) {
      details.checks.push({ field: "payloadHash", expected: computed, certificate: cert.payloadHash, result: "MISMATCH" });
      passed = false;
    } else {
      details.checks.push({ field: "payloadHash", result: "OK" });
    }
  } catch (err) {
    details.checks.push({ field: "payloadHash", result: "ERROR" });
    passed = false;
  }

  const payload: any = cert.payload ?? {};

  // Check recoveryJobId
  if (payload.recoveryJobId !== candidate.recoveryJobId) {
    details.checks.push({ field: "recoveryJobId", expected: candidate.recoveryJobId, certificate: payload.recoveryJobId, result: "MISMATCH" });
    passed = false;
  } else {
    details.checks.push({ field: "recoveryJobId", result: "OK" });
  }

  // workingCopy
  if (payload.workingCopyId !== candidate.workingCopyId) {
    details.checks.push({ field: "workingCopyId", expected: candidate.workingCopyId, certificate: payload.workingCopyId, result: "MISMATCH" });
    passed = false;
  } else {
    details.checks.push({ field: "workingCopyId", result: "OK" });
  }

  // masterEvidence
  if (payload.masterEvidenceId !== candidate.masterEvidenceId) {
    details.checks.push({ field: "masterEvidenceId", expected: candidate.masterEvidenceId, certificate: payload.masterEvidenceId, result: "MISMATCH" });
    passed = false;
  } else {
    details.checks.push({ field: "masterEvidenceId", result: "OK" });
  }

  // engine/method
  if (payload.engine !== candidate.engine) {
    details.checks.push({ field: "engine", expected: candidate.engine, certificate: payload.engine, result: "MISMATCH" });
    passed = false;
  } else {
    details.checks.push({ field: "engine", result: "OK" });
  }
  if (payload.method !== candidate.method) {
    details.checks.push({ field: "method", expected: candidate.method, certificate: payload.method, result: "MISMATCH" });
    passed = false;
  } else {
    details.checks.push({ field: "method", result: "OK" });
  }

  // size & sha256
  if ((payload.artifactSize ?? null) !== (candidate.size ?? null)) {
    details.checks.push({ field: "artifactSize", expected: candidate.size ?? null, certificate: payload.artifactSize ?? null, result: "MISMATCH" });
    passed = false;
  } else {
    details.checks.push({ field: "artifactSize", result: "OK" });
  }
  if ((payload.artifactSha256 ?? null) !== (candidate.provisionalSha256 ?? null)) {
    details.checks.push({ field: "artifactSha256", expected: candidate.provisionalSha256 ?? null, certificate: payload.artifactSha256 ?? null, result: "MISMATCH" });
    passed = false;
  } else {
    details.checks.push({ field: "artifactSha256", result: "OK" });
  }

  // Optionally check storage object actual size/sha if available
  if (artifact) {
    if (artifact.fileSizeBytes !== null && artifact.fileSizeBytes !== undefined) {
      if (Number(cert.artifactSize) !== Number(artifact.fileSizeBytes)) {
        details.checks.push({ field: "storageFileSize", expected: artifact.fileSizeBytes, certificate: cert.artifactSize, result: "MISMATCH" });
        passed = false;
      } else {
        details.checks.push({ field: "storageFileSize", result: "OK" });
      }
    }
    if (artifact.sha256) {
      if ((cert.artifactSha256 ?? null) !== artifact.sha256) {
        details.checks.push({ field: "storageSha256", expected: artifact.sha256, certificate: cert.artifactSha256, result: "MISMATCH" });
        passed = false;
      } else {
        details.checks.push({ field: "storageSha256", result: "OK" });
      }
    }
  }

  const validationSignature = signingService.signPayload(input.actorId, { certificateId: cert.id, result: passed ? "PASSED" : "FAILED", details });

  const [updated] = await db.update(recoveryCertificates).set({
    status: passed ? "VALIDATED" : "VALIDATION_FAILED",
    validationSignature: validationSignature.signature,
    validationSignerId: input.actorId,
    validationDetails: details,
    updatedAt: new Date(),
  }).where(eq(recoveryCertificates.id, cert.id)).returning();

  await db.insert(auditEvents).values({
    investigationId: input.investigationId,
    actorId: input.actorId,
    eventType: "COMPLETED",
    result: passed ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
    details: `certificate=${cert.id}; result=${passed ? "PASSED" : "FAILED"}`,
  });

  return updated;
}


export async function rejectCertificate(input: { certificateId: string; actorId: string; investigationId: string; reason: string }) {
  const db = getDb();
  const cert = await getCertificateById(input.certificateId);
  if (cert.investigationId !== input.investigationId) throw new HttpError(403, "Certificate does not belong to investigation");
  const reason = input.reason.trim();
  if (!reason) throw new HttpError(400, "Rejection reason is required");
  const validationDetails = {
    decision: "REJECTED",
    reason,
    rejectedAt: new Date().toISOString(),
  };
  const validationSignature = signingService.signPayload(input.actorId, {
    certificateId: cert.id,
    result: "REJECTED",
    details: validationDetails,
  });
  const [updated] = await db.update(recoveryCertificates).set({
    status: "VALIDATION_FAILED",
    validationSignature: validationSignature.signature,
    validationSignerId: input.actorId,
    validationDetails,
    updatedAt: new Date(),
  }).where(eq(recoveryCertificates.id, cert.id)).returning();
  if (!updated) throw new HttpError(500, "Failed to persist certificate rejection");
  await db.insert(auditEvents).values({
    investigationId: input.investigationId,
    actorId: input.actorId,
    eventType: "FAILED",
    result: "VALIDATION_REJECTED",
    details: `certificate=${cert.id}; reason=${reason}`,
  });
  return updated;
}
