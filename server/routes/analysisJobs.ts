import { Router } from "express";
import { analysisJobParamsSchema, createAnalysisJobSchema, investigationIdParamSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { assertInvestigationAccess } from "../services/investigations";
import { createAnalysisJob, getAnalysisJob, listAnalysisJobs, listAnalysisResults } from "../services/analysisJobs";

export const analysisJobsRouter = Router();

analysisJobsRouter.get(
  "/investigations/:investigationId/analysis/jobs",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await assertInvestigationAccess(req.params.investigationId, { id: req.user!.sub, role: req.user!.role });
    res.json({ analysisJobs: await listAnalysisJobs(req.params.investigationId) });
  }),
);

analysisJobsRouter.post(
  "/investigations/:investigationId/analysis/jobs",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  validate(createAnalysisJobSchema),
  asyncHandler(async (req, res) => {
    const job = await createAnalysisJob({
      investigationId: req.params.investigationId,
      actorId: req.user!.sub,
      validationCertificateId: req.body.validationCertificateId,
    });
    res.status(201).json({ analysisJob: job });
  }),
);

analysisJobsRouter.get(
  "/investigations/:investigationId/analysis/jobs/:id",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(analysisJobParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await assertInvestigationAccess(req.params.investigationId, { id: req.user!.sub, role: req.user!.role });
    res.json({ analysisJob: await getAnalysisJob(req.params.id, req.params.investigationId) });
  }),
);

analysisJobsRouter.get(
  "/investigations/:investigationId/analysis/jobs/:id/results",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(analysisJobParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await assertInvestigationAccess(req.params.investigationId, { id: req.user!.sub, role: req.user!.role });
    res.json({ results: await listAnalysisResults(req.params.id, req.params.investigationId) });
  }),
);
