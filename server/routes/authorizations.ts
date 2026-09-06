import { Router } from "express";
import {
  createAuthorizationSchema,
  decideAuthorizationSchema,
  idParamSchema,
  investigationIdParamSchema,
} from "../../shared/schemas";
import { AUTHORIZATION_STATUSES } from "../../shared/types";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../middleware/httpError";
import { validate } from "../middleware/validate";
import {
  decideAuthorization,
  listAuthorizations,
  listAuthorizationsForInvestigation,
  requestAuthorization,
} from "../services/authorizations";
import { assertInvestigationAccess } from "../services/investigations";

export const authorizationsRouter = Router();

authorizationsRouter.get(
  "/investigations/:investigationId/authorizations",
  requireAuth,
  validate(investigationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await assertInvestigationAccess(req.params.investigationId, { id: req.user!.sub, role: req.user!.role });
    const items = await listAuthorizationsForInvestigation(req.params.investigationId);
    res.json({ authorizations: items });
  }),
);

authorizationsRouter.post(
  "/investigations/:investigationId/authorizations",
  requireAuth,
  validate(investigationIdParamSchema, "params"),
  validate(createAuthorizationSchema),
  asyncHandler(async (req, res) => {
    await assertInvestigationAccess(req.params.investigationId, { id: req.user!.sub, role: req.user!.role });
    const authorization = await requestAuthorization({
      investigationId: req.params.investigationId,
      deviceId: req.body.deviceId,
      requestedBy: req.user!.sub,
      operationType: req.body.operationType,
      reason: req.body.reason,
      expiresAt: req.body.expiresAt,
    });
    res.status(201).json({ authorization });
  }),
);

authorizationsRouter.get(
  "/admin/authorizations",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !AUTHORIZATION_STATUSES.includes(status as (typeof AUTHORIZATION_STATUSES)[number])) {
      throw new HttpError(400, "Invalid authorization status");
    }
    const items = await listAuthorizations({
      status: status as (typeof AUTHORIZATION_STATUSES)[number] | undefined,
    });
    res.json({ authorizations: items });
  }),
);

authorizationsRouter.post(
  "/admin/authorizations/:id/approve",
  requireAuth,
  requireRole("ADMIN"),
  validate(idParamSchema, "params"),
  validate(decideAuthorizationSchema),
  asyncHandler(async (req, res) => {
    const authorization = await decideAuthorization(
      req.params.id,
      "APPROVED",
      req.user!.sub,
      req.body.expiresAt,
    );
    res.json({ authorization });
  }),
);

authorizationsRouter.post(
  "/admin/authorizations/:id/deny",
  requireAuth,
  requireRole("ADMIN"),
  validate(idParamSchema, "params"),
  validate(decideAuthorizationSchema),
  asyncHandler(async (req, res) => {
    const authorization = await decideAuthorization(req.params.id, "DENIED", req.user!.sub, req.body.expiresAt);
    res.json({ authorization });
  }),
);
