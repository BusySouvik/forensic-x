import { Router } from "express";
import { eq } from "drizzle-orm";
import { createAcquisitionSchema, idParamSchema } from "../../shared/schemas";
import { TestFileAcquisitionAdapter } from "../agent/adapters/testFileAcquisition";
import { EwfAcquisitionAdapter } from "../agent/worker/ewfAcquisitionAdapter";
import { env } from "../config/env";
import { getDb } from "../db";
import { operationAuthorizations } from "../db/schema";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../middleware/httpError";
import { validate } from "../middleware/validate";
import { getDefaultAcquisitionRepository, logAcquisitionAudit, createAcquisitionService } from "../services/acquisitions";
import { getEvidenceStorageService } from "../services/evidenceStorage";
import { getDevice } from "../services/devices";
import { assertInvestigationAccess, getInvestigation } from "../services/investigations";
import { assertStageAccess } from "../services/investigationWorkflow";

export const acquisitionsRouter = Router();

const controlRoot = process.env.FORENSIC_X_TEST_ROOT ?? "./.forensic-x-test-area";
const acquisitionAdapter = env.FORENSIC_ACQUISITION_ENGINE === "ewfacquire"
  ? new EwfAcquisitionAdapter({
      executable: env.FORENSIC_ACQUISITION_EXECUTABLE,
      stagingRoot: env.FORENSIC_ACQUISITION_STAGING_ROOT,
    })
  : new TestFileAcquisitionAdapter({ allowedRoot: controlRoot });

const acquisitionService = createAcquisitionService({
  repository: getDefaultAcquisitionRepository(),
  evidenceStorage: getEvidenceStorageService(),
  acquisitionAdapter,
  auditLogger: logAcquisitionAudit,
  validateInvestigation: async (investigationId) => getInvestigation(investigationId),
  validateDevice: async (deviceId, investigationId) => {
    const device = await getDevice(deviceId);
    if (device.investigationId !== investigationId) {
      throw new HttpError(403, "Device does not belong to the investigation");
    }
    return device;
  },
});

acquisitionsRouter.get(
  "/acquisitions",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  asyncHandler(async (req, res) => {
    const investigationId = typeof req.query.investigationId === "string" ? req.query.investigationId : undefined;
    if (!investigationId) {
      throw new HttpError(400, "investigationId query is required");
    }
    await assertInvestigationAccess(investigationId, { id: req.user!.sub, role: req.user!.role });
    const items = await acquisitionService.listForInvestigation(investigationId);
    res.json({ acquisitions: items });
  }),
);

acquisitionsRouter.post(
  "/acquisitions",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(createAcquisitionSchema),
  asyncHandler(async (req, res) => {
    const { investigationId, deviceId, authorizationId, sourceType, sourceIdentifier } = req.body;
    await assertInvestigationAccess(investigationId, { id: req.user!.sub, role: req.user!.role });
    await assertStageAccess(investigationId, req.user!.sub, "ACQUISITION");
    if (deviceId) {
      const device = await getDevice(deviceId);
      if (device.investigationId !== investigationId) {
        throw new HttpError(403, "Device does not belong to the investigation");
      }
    }

    const db = getDb();
    const [authorization] = await db
      .select()
      .from(operationAuthorizations)
      .where(eq(operationAuthorizations.id, authorizationId))
      .limit(1);
    if (!authorization) {
      throw new HttpError(404, "Authorization not found");
    }
    if (authorization.investigationId !== investigationId) {
      throw new HttpError(403, "Authorization does not belong to the investigation");
    }
    if (deviceId && authorization.deviceId && authorization.deviceId !== deviceId) {
      throw new HttpError(403, "Authorization does not match the selected device");
    }
    if (authorization.operationType !== "ACQUISITION") {
      throw new HttpError(403, "Authorization is not for acquisition");
    }
    if (authorization.status !== "APPROVED") {
      throw new HttpError(403, "Acquisition authorization is not approved");
    }

    const job = await acquisitionService.createJob({
      investigationId,
      deviceId: deviceId ?? null,
      requestedBy: req.user!.sub,
      authorizationId,
      sourceType,
      sourceIdentifier,
    });

    res.status(201).json({ acquisition: job });
  }),
);

acquisitionsRouter.get(
  "/acquisitions/:id",
  requireAuth,
  requireRole("ADMIN", "INVESTIGATOR"),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const job = await acquisitionService.getById(req.params.id);
    await assertInvestigationAccess(job.investigationId, { id: req.user!.sub, role: req.user!.role });
    if (req.user!.role !== "ADMIN" && job.requestedBy !== req.user!.sub) {
      throw new HttpError(403, "Acquisition job is not accessible to this investigator");
    }
    res.json({ acquisition: job });
  }),
);
