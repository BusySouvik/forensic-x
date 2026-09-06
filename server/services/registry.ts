import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { analysisJobs, auditEvents, devices, evidenceRecords, ledger_events, recoveredCandidates, recoveryJobs, storageObjects, users, workingCopies } from "../db/schema";
import { HttpError } from "../middleware/httpError";

export async function listEvidence(investigationId: string) {
  return getDb().select({
    evidence: evidenceRecords,
    storageObject: storageObjects,
    device: devices,
  }).from(evidenceRecords)
    .innerJoin(storageObjects, eq(storageObjects.id, evidenceRecords.masterStorageObjectId))
    .leftJoin(devices, eq(devices.id, evidenceRecords.deviceId))
    .where(eq(evidenceRecords.investigationId, investigationId))
    .orderBy(desc(evidenceRecords.createdAt));
}

export async function getEvidence(investigationId: string, evidenceId: string) {
  const [row] = await getDb().select({
    evidence: evidenceRecords,
    storageObject: storageObjects,
    device: devices,
  }).from(evidenceRecords)
    .innerJoin(storageObjects, eq(storageObjects.id, evidenceRecords.masterStorageObjectId))
    .leftJoin(devices, eq(devices.id, evidenceRecords.deviceId))
    .where(and(eq(evidenceRecords.id, evidenceId), eq(evidenceRecords.investigationId, investigationId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Evidence record not found");
  return row;
}

export async function listRecoveredArtifacts(investigationId: string) {
  return getDb().select({
    artifact: recoveredCandidates,
    recoveryJob: recoveryJobs,
    workingCopy: workingCopies,
    storageObject: storageObjects,
  }).from(recoveredCandidates)
    .innerJoin(recoveryJobs, eq(recoveryJobs.id, recoveredCandidates.recoveryJobId))
    .innerJoin(workingCopies, eq(workingCopies.id, recoveredCandidates.workingCopyId))
    .leftJoin(storageObjects, eq(storageObjects.id, recoveredCandidates.storageObjectId))
    .where(eq(recoveredCandidates.investigationId, investigationId))
    .orderBy(desc(recoveredCandidates.createdAt));
}

export async function getRecoveredArtifact(investigationId: string, artifactId: string) {
  const [row] = await getDb().select({
    artifact: recoveredCandidates,
    recoveryJob: recoveryJobs,
    workingCopy: workingCopies,
    storageObject: storageObjects,
  }).from(recoveredCandidates)
    .innerJoin(recoveryJobs, eq(recoveryJobs.id, recoveredCandidates.recoveryJobId))
    .innerJoin(workingCopies, eq(workingCopies.id, recoveredCandidates.workingCopyId))
    .leftJoin(storageObjects, eq(storageObjects.id, recoveredCandidates.storageObjectId))
    .where(and(eq(recoveredCandidates.id, artifactId), eq(recoveredCandidates.investigationId, investigationId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Recovered artifact not found");
  return row;
}

export async function listAuditEvents(investigationId: string) {
  return getDb().select({
    auditEvent: auditEvents,
    actor: { id: users.id, name: users.name, role: users.role },
  }).from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(eq(auditEvents.investigationId, investigationId))
    .orderBy(desc(auditEvents.createdAt));
}

export async function listCustodyEvents(investigationId: string) {
  const [audit, ledger, analysis] = await Promise.all([
    listAuditEvents(investigationId),
    getDb().select().from(ledger_events).where(eq(ledger_events.investigationId, investigationId)).orderBy(desc(ledger_events.createdAt)),
    getDb().select().from(analysisJobs).where(eq(analysisJobs.investigationId, investigationId)).orderBy(desc(analysisJobs.createdAt)),
  ]);
  return { audit, ledger, analysis };
}
