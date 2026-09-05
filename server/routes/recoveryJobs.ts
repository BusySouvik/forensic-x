import { Router } from "express";
import { z } from "zod";
import { createRecoveryJobSchema, idParamSchema, investigationIdParamSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { createRecoveryJobService, DrizzleRecoveryJobRepository, logRecoveryJobAudit } from "../services/recoveryJobs";
import { getInvestigation } from "../services/investigations";
import { getAuthorizationById } from "../services/authorizations";
import { getMasterEvidenceById } from "../services/evidenceStorage";
import { getWorkingCopyById } from "../services/workingCopies";
import { assertStageAccess } from "../services/investigationWorkflow";

export const recoveryJobsRouter = Router();

const recoveryResultsParamsSchema = z.object({
  investigationId: z.uuid(),
  id: z.uuid(),
});

const recoveryJobService = createRecoveryJobService({
  repository: new DrizzleRecoveryJobRepository(),
  auditLogger: logRecoveryJobAudit,
  getInvestigation: async (investigationId) => getInvestigation(investigationId),
  getWorkingCopyById: async (id) => {
    const record = await getWorkingCopyById(id);
    return record
      ? {
          id: record.id,
          investigationId: record.investigationId,
          masterEvidenceId: record.masterEvidenceId,
          storageObjectId: record.storageObjectId,
          status: record.status,
          investigatorId: record.investigatorId,
          authorizationId: record.authorizationId,
        }
      : null;
  },
  getAuthorizationById: async (id) => {
    const record = await getAuthorizationById(id);
    return record
      ? {
          id: record.id,
          investigationId: record.investigationId,
          requestedBy: record.requestedBy,
          status: record.status,
          operationType: record.operationType,
        }
      : null;
  },
  getMasterEvidenceById: async (id) => {
    const record = await getMasterEvidenceById(id);
    return record
      ? {
          id: record.id,
          investigationId: record.investigationId,
          masterStorageObjectId: record.masterStorageObjectId,
          sha256: record.sha256,
          status: record.status,
        }
      : null;
  },
});

recoveryJobsRouter.get(
  "/investigations/:investigationId/recovery-jobs",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const items = await recoveryJobService.listForInvestigation(req.params.investigationId);
    res.json({ recoveryJobs: items });
  }),
);

recoveryJobsRouter.post(
  "/investigations/:investigationId/recovery-jobs",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  validate(createRecoveryJobSchema),
  asyncHandler(async (req, res) => {
    await assertStageAccess(req.params.investigationId, req.user!.sub, "RECOVERY");
    const job = await recoveryJobService.createRecoveryJob({
      investigationId: req.params.investigationId,
      workingCopyId: req.body.workingCopyId,
      requestedBy: req.user!.sub,
      authorizationId: req.body.authorizationId,
      method: req.body.method,
      engine: req.body.engine,
      config: req.body.config,
    });
    res.status(201).json({ recoveryJob: job });
  }),
);

recoveryJobsRouter.get(
  "/recovery-jobs/:id",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const job = await recoveryJobService.getById(req.params.id);
    res.json({ recoveryJob: job });
  }),
);

recoveryJobsRouter.get(
  "/investigations/:investigationId/recovery-jobs/:id/results",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(recoveryResultsParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json({
      investigationId: req.params.investigationId,
      recoveryJobId: req.params.id,
      status: "PENDING_VALIDATION",
      artifacts: [],
      message: "Recovery results are pending validation and are not authoritative evidence.",
      generatedAt: new Date().toISOString(),
    });
  }),
);

recoveryJobsRouter.get(
  "/investigations/:investigationId/recoveries/:id/results",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(recoveryResultsParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json({
      investigationId: req.params.investigationId,
      recoveryJobId: req.params.id,
      status: "PENDING_VALIDATION",
      artifacts: [],
      message: "Recovery results are pending validation and are not authoritative evidence.",
      generatedAt: new Date().toISOString(),
    });
  }),
);
