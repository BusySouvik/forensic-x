import { Router } from "express";
import { idParamSchema, storageSampleSchema } from "../../shared/schemas";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../middleware/httpError";
import { validate } from "../middleware/validate";
import {
  getEvidenceStorageService,
  toPublicStorageObject,
} from "../services/evidenceStorage";
import { assertInvestigationAccess } from "../services/investigations";

export const SAMPLE_STORAGE_FILENAME = "storage-probe.txt";
export const SAMPLE_STORAGE_BODY = Buffer.from(
  "FORENSIC-X MinIO storage probe.\nHarmless test object. Not a forensic image.\n",
  "utf8",
);

export const storageRouter = Router();

async function assertStorageAccess(record: { investigationId: string | null }, user: { id: string; role: "ADMIN" | "INVESTIGATOR" }) {
  if (user.role === "ADMIN") return;
  if (!record.investigationId) throw new HttpError(403, "Investigation-scoped storage access required");
  await assertInvestigationAccess(record.investigationId, user);
}

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
    await assertStorageAccess(record, { id: req.user!.sub, role: req.user!.role });
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
    await assertStorageAccess(record, { id: req.user!.sub, role: req.user!.role });
    res.setHeader("Content-Type", record.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${record.originalFilename.replace(/[\\\"\r\n]/g, "_")}"`);
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
    const record = await getEvidenceStorageService().getById(req.params.id);
    if (!record) throw new HttpError(404, "Storage reference not found");
    await assertStorageAccess(record, { id: req.user!.sub, role: req.user!.role });
    await getEvidenceStorageService().delete(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  }),
);
