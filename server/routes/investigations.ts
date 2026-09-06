import { Router } from "express";
import {
  createInvestigationSchema,
  idParamSchema,
  updateInvestigationSchema,
  configureInvestigationWorkflowSchema,
  investigationIdParamSchema,
} from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { createInvestigation, getInvestigation, listInvestigations, updateInvestigation } from "../services/investigations";
import { configureWorkflow, getWorkflow } from "../services/investigationWorkflow";

export const investigationsRouter = Router();

investigationsRouter.get(
  "/investigations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await listInvestigations(req.user ? { id: req.user.sub, role: req.user.role } : undefined);
    res.json({ investigations: items });
  }),
);

investigationsRouter.post(
  "/investigations",
  requireAuth,
  requireRole("ADMIN"),
  validate(createInvestigationSchema),
  asyncHandler(async (req, res) => {
    const created = await createInvestigation({
      ...req.body,
      createdBy: req.user!.sub,
    });
    res.status(201).json({ investigation: created });
  }),
);

investigationsRouter.get(
  "/investigations/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const investigation = await getInvestigation(req.params.id, req.user ? { id: req.user.sub, role: req.user.role } : undefined);
    res.json({ investigation });
  }),
);

investigationsRouter.patch(
  "/investigations/:id",
  requireAuth,
  requireRole("ADMIN"),
  validate(idParamSchema, "params"),
  validate(updateInvestigationSchema),
  asyncHandler(async (req, res) => {
    const investigation = await updateInvestigation(req.params.id, req.body);
    res.json({ investigation });
  }),
);

investigationsRouter.get("/investigations/:investigationId/workflow", requireAuth, validate(investigationIdParamSchema, "params"), asyncHandler(async (req, res) => {
  res.json({ workflow: await getWorkflow(req.params.investigationId) });
}));

investigationsRouter.put("/investigations/:investigationId/workflow", requireAuth, requireRole("ADMIN"), validate(investigationIdParamSchema, "params"), validate(configureInvestigationWorkflowSchema), asyncHandler(async (req, res) => {
  const workflow = await configureWorkflow({ investigationId: req.params.investigationId, actorId: req.user!.sub, ...req.body });
  res.json({ workflow });
}));
