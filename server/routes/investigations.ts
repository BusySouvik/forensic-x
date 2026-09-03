import { Router } from "express";
import {
  createInvestigationSchema,
  idParamSchema,
  updateInvestigationSchema,
} from "../../shared/schemas";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { createInvestigation, getInvestigation, listInvestigations, updateInvestigation } from "../services/investigations";

export const investigationsRouter = Router();

investigationsRouter.get(
  "/investigations",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const items = await listInvestigations();
    res.json({ investigations: items });
  }),
);

investigationsRouter.post(
  "/investigations",
  requireAuth,
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
    const investigation = await getInvestigation(req.params.id);
    res.json({ investigation });
  }),
);

investigationsRouter.patch(
  "/investigations/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(updateInvestigationSchema),
  asyncHandler(async (req, res) => {
    const investigation = await updateInvestigation(req.params.id, req.body);
    res.json({ investigation });
  }),
);
