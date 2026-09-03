import { Router } from "express";
import { idParamSchema, storageSampleSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import {
  getEvidenceStorageService,
  toPublicStorageObject,
} from "../services/evidenceStorage";

export const SAMPLE_STORAGE_FILENAME = "storage-probe.txt";
export const SAMPLE_STORAGE_BODY = Buffer.from(
  "FORENSIC-X MinIO storage probe.\nHarmless test object. Not a forensic image.\n",
  "utf8",
);

export const storageRouter = Router();

storageRouter.post(
  "/internal/storage/sample",
  requireAuth,
  requireRole("ADMIN"),
  validate(storageSampleSchema),
  asyncHandler(async (req, res) => {
    const service = getEvidenceStorageService();
    const record = await service.upload({
      storageClass: "WORKING_COPY",
      filename: SAMPLE_STORAGE_FILENAME,
      body: SAMPLE_STORAGE_BODY,
      contentType: "text/plain",
      investigationId: req.body.investigationId,
      evidenceId: req.body.evidenceId ?? "STORAGE-PROBE",
    });
    const { object } = await service.getMetadata(record.id);
    res.status(201).json({
      storageObject: toPublicStorageObject(record),
      object,
    });
  }),
);

storageRouter.get(
  "/storage/objects/:id/metadata",
  requireAuth,
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const { record, object } = await getEvidenceStorageService().getMetadata(req.params.id);
    res.json({
      storageObject: toPublicStorageObject(record),
      object,
      exists: true,
    });
  }),
);

storageRouter.get(
  "/storage/objects/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const { record, stream } = await getEvidenceStorageService().download(req.params.id);
    res.setHeader("Content-Type", record.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${record.originalFilename}"`);
    res.setHeader("X-Content-SHA256", record.sha256);
    stream.pipe(res);
  }),
);

storageRouter.delete(
  "/storage/objects/:id",
  requireAuth,
  requireRole("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await getEvidenceStorageService().delete(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  }),
);
