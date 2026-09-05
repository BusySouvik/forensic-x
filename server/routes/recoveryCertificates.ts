import { Router } from "express";
import { investigationIdParamSchema, idParamSchema, createRecoveryCertificateSchema, validateCertificateSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { createRecoveryCertificate, validateAndSignCertificate, getCertificateById } from "../services/recoveryCertificates";
import { getDb } from "../db";
import { recoveryCertificates } from "../db/schema";
import { eq } from "drizzle-orm";
import { assertStageAccess } from "../services/investigationWorkflow";

export const recoveryCertificatesRouter = Router();

recoveryCertificatesRouter.post(
  "/investigations/:investigationId/recovered-candidates/:candidateId/certificate",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  validate(createRecoveryCertificateSchema),
  asyncHandler(async (req, res) => {
    await assertStageAccess(req.params.investigationId, req.user!.sub, "RECOVERY");
    const certificate = await createRecoveryCertificate({ investigationId: req.params.investigationId, recoveredCandidateId: (req.params as any).candidateId, actorId: req.user!.sub });
    res.status(201).json({ certificate });
  }),
);

recoveryCertificatesRouter.post(
  "/investigations/:investigationId/certificates/:id/validate",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  validate(validateCertificateSchema),
  asyncHandler(async (req, res) => {
    await assertStageAccess(req.params.investigationId, req.user!.sub, "VALIDATION");
    const updated = await validateAndSignCertificate({ certificateId: req.params.id, actorId: req.user!.sub, investigationId: req.params.investigationId });
    res.json({ certificate: updated });
  }),
);

recoveryCertificatesRouter.get(
  "/investigations/:investigationId/certificates/:id",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const cert = await getCertificateById(req.params.id);
    res.json({ certificate: cert });
  }),
);

recoveryCertificatesRouter.get(
  "/investigations/:investigationId/certificates",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = await db.select().from(recoveryCertificates).where(eq(recoveryCertificates.investigationId, req.params.investigationId));
    res.json({ certificates: rows });
  }),
);
