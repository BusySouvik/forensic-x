import { Router } from "express";
import { investigationIdParamSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { startAnalysis } from "../services/analysis";
import { assertStageAccess } from "../services/investigationWorkflow";

export const analysisRouter = Router();

analysisRouter.post(
  "/investigations/:investigationId/analysis/start",
  requireAuth,
  requireRole("INVESTIGATOR", "ADMIN"),
  validate(investigationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await assertStageAccess(req.params.investigationId, req.user!.sub, "ANALYSIS");
    const result = await startAnalysis(req.params.investigationId, req.user!.sub);
    res.json(result);
  }),
);
