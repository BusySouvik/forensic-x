import { Router } from "express";
import { idParamSchema, investigationIdParamSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { assertInvestigationAccess } from "../services/investigations";
import { getEvidenceStorageService } from "../services/evidenceStorage";
import { getEvidence, getRecoveredArtifact, listAuditEvents, listCustodyEvents, listEvidence, listRecoveredArtifacts } from "../services/registry";
import { getDb } from "../db";
import { auditEvents } from "../db/schema";

export const registryRouter = Router();

async function assertAccess(investigationId: string, userId: string, role: "ADMIN" | "INVESTIGATOR") {
  await assertInvestigationAccess(investigationId, { id: userId, role });
}

registryRouter.get("/investigations/:investigationId/evidence", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(investigationIdParamSchema, "params"), asyncHandler(async (req, res) => {
  await assertAccess(req.params.investigationId, req.user!.sub, req.user!.role);
  res.json({ evidence: await listEvidence(req.params.investigationId) });
}));

registryRouter.get("/investigations/:investigationId/evidence/:id", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(investigationIdParamSchema.merge(idParamSchema), "params"), asyncHandler(async (req, res) => {
  await assertAccess(req.params.investigationId, req.user!.sub, req.user!.role);
  res.json({ evidence: await getEvidence(req.params.investigationId, req.params.id) });
}));

registryRouter.get("/investigations/:investigationId/recovered-artifacts", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(investigationIdParamSchema, "params"), asyncHandler(async (req, res) => {
  await assertAccess(req.params.investigationId, req.user!.sub, req.user!.role);
  res.json({ artifacts: await listRecoveredArtifacts(req.params.investigationId) });
}));

registryRouter.get("/investigations/:investigationId/recovered-artifacts/:id", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(investigationIdParamSchema.merge(idParamSchema), "params"), asyncHandler(async (req, res) => {
  await assertAccess(req.params.investigationId, req.user!.sub, req.user!.role);
  res.json({ artifact: await getRecoveredArtifact(req.params.investigationId, req.params.id) });
}));

registryRouter.get("/investigations/:investigationId/recovered-artifacts/:artifactId/download", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(investigationIdParamSchema.extend({ artifactId: idParamSchema.shape.id }), "params"), asyncHandler(async (req, res) => {
  await assertAccess(req.params.investigationId, req.user!.sub, req.user!.role);
  const row = await getRecoveredArtifact(req.params.investigationId, req.params.artifactId);
  if (!row.storageObject || row.storageObject.status !== "AVAILABLE") {
    res.status(409).json({ error: "Artifact is metadata-only and has no available storage object" });
    return;
  }
  await getDb().insert(auditEvents).values({
    investigationId: req.params.investigationId,
    actorId: req.user!.sub,
    eventType: "COMPLETED",
    result: "ARTIFACT_DOWNLOADED",
    details: `artifact=${row.artifact.id}; storageObject=${row.storageObject.id}`,
  });
  const { record, stream } = await getEvidenceStorageService().download(row.storageObject.id);
  res.setHeader("Content-Type", record.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${record.originalFilename.replace(/[\\\"\r\n]/g, "_")}"`);
  res.setHeader("X-Content-SHA256", record.sha256);
  stream.pipe(res);
}));

registryRouter.get("/investigations/:investigationId/audit-events", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(investigationIdParamSchema, "params"), asyncHandler(async (req, res) => {
  await assertAccess(req.params.investigationId, req.user!.sub, req.user!.role);
  res.json({ auditEvents: await listAuditEvents(req.params.investigationId) });
}));

registryRouter.get("/investigations/:investigationId/custody", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(investigationIdParamSchema, "params"), asyncHandler(async (req, res) => {
  await assertAccess(req.params.investigationId, req.user!.sub, req.user!.role);
  res.json(await listCustodyEvents(req.params.investigationId));
}));
