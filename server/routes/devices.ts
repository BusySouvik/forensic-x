import { Router } from "express";
import { createDeviceSchema, idParamSchema, investigationIdParamSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { createDevice, getDevice, listDevicesForInvestigation } from "../services/devices";
import { assertInvestigationAccess } from "../services/investigations";

export const devicesRouter = Router();

devicesRouter.get(
  "/investigations/:investigationId/devices",
  requireAuth,
  validate(investigationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await assertInvestigationAccess(req.params.investigationId, { id: req.user!.sub, role: req.user!.role });
    const items = await listDevicesForInvestigation(req.params.investigationId);
    res.json({ devices: items });
  }),
);

devicesRouter.post(
  "/investigations/:investigationId/devices",
  requireAuth,
  requireRole("ADMIN"),
  validate(investigationIdParamSchema, "params"),
  validate(createDeviceSchema),
  asyncHandler(async (req, res) => {
    await assertInvestigationAccess(req.params.investigationId, { id: req.user!.sub, role: req.user!.role });
    const device = await createDevice(req.params.investigationId, req.body);
    res.status(201).json({ device });
  }),
);

devicesRouter.get(
  "/devices/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const device = await getDevice(req.params.id);
    await assertInvestigationAccess(device.investigationId, { id: req.user!.sub, role: req.user!.role });
    res.json({ device });
  }),
);
