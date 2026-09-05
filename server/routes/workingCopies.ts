import { Router } from "express";
import { idParamSchema, investigationIdParamSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../middleware/httpError";
import { validate } from "../middleware/validate";
import { createWorkingCopyService, DrizzleWorkingCopyRepository, logWorkingCopyAudit } from "../services/workingCopies";
import { getEvidenceStorageService } from "../services/evidenceStorage";
import { getInvestigation } from "../services/investigations";

export const workingCopiesRouter = Router();

const workingCopyService = createWorkingCopyService({
  repository: new DrizzleWorkingCopyRepository(),
  evidenceStorage: getEvidenceStorageService(),
  auditLogger: logWorkingCopyAudit,
  validateInvestigation: async (investigationId) => getInvestigation(investigationId),
});

workingCopiesRouter.post(
  "/evidence/:masterEvidenceId/working-copies",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const investigationId = typeof req.body.investigationId === "string" ? req.body.investigationId : undefined;
    const authorizationId = typeof req.body.authorizationId === "string" ? req.body.authorizationId : undefined;
    if (!investigationId || !authorizationId) {
      throw new HttpError(400, "investigationId and authorizationId are required");
    }

    const investigatorId = req.user!.role === "ADMIN" && typeof req.body.investigatorId === "string"
      ? req.body.investigatorId
      : req.user!.sub;

    const workingCopy = await workingCopyService.createWorkingCopy({
      investigationId,
      masterEvidenceId: req.params.masterEvidenceId,
      investigatorId,
      authorizationId,
    });

    res.status(201).json({ workingCopy });
  }),
);

workingCopiesRouter.get(
  "/working-copies/:id",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const workingCopy = await workingCopyService.getById(req.params.id);
    res.json({ workingCopy });
  }),
);

workingCopiesRouter.get(
  "/investigations/:investigationId/working-copies",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(investigationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const items = await workingCopyService.listForInvestigation(req.params.investigationId);
    res.json({ workingCopies: items });
  }),
);

workingCopiesRouter.delete(
  "/working-copies/:id",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const workingCopy = await workingCopyService.getById(req.params.id);
    if (req.user!.role !== "ADMIN" && workingCopy.investigatorId !== req.user!.sub) {
      throw new HttpError(403, "You do not own this working copy");
    }
    const deleted = await workingCopyService.deleteWorkingCopy(req.params.id, req.user!.sub);
    res.json({ workingCopy: deleted, deleted: true });
  }),
);
