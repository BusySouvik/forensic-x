import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { createSanitizationJobSchema, idParamSchema, investigationIdParamSchema } from "../../shared/schemas";
import { getDb } from "../db";
import { devices, evidenceRecords, operationAuthorizations, storageObjects } from "../db/schema";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../middleware/httpError";
import { validate } from "../middleware/validate";
import { createSanitizationJobService, DrizzleSanitizationJobRepository, logSanitizationJobAudit } from "../services/sanitizationJobs";

export const sanitizationRouter = Router();
const service = createSanitizationJobService({ repository: new DrizzleSanitizationJobRepository(), auditLogger: logSanitizationJobAudit });
const safeRoot = path.resolve(process.cwd(), ".forensic-x", "test-sanitization");

async function assertJobAccess(id: string, userId: string, role: string) {
  const job = await service.getById(id);
  if (role !== "ADMIN" && job.requestedBy !== userId) throw new HttpError(403, "Sanitization job is not accessible to this investigator");
  return job;
}

async function resolveTarget(input: { investigationId: string; targetType: string; targetReference: string; sanitizationMethod: string }) {
  const db = getDb();
  if (input.targetType === "FOLDER") {
    if (input.sanitizationMethod !== "TEST_TRUNCATE" || process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION !== "1") throw new HttpError(409, "Only the opt-in test sanitization method is available for folders");
    if (!/^[A-Za-z0-9_-]+$/.test(input.targetReference)) throw new HttpError(400, "Folder target must be a configured test fixture name");
    const target = path.resolve(safeRoot, input.targetReference, "target.bin");
    if (path.relative(safeRoot, target).startsWith("..") || !(await fs.stat(target).then(() => true).catch(() => false))) throw new HttpError(404, "Configured test sanitization target not found");
    return { targetReference: target, targetStableIdentifier: input.targetReference, storageType: "TEST_SAFE_FOLDER" };
  }
  if (input.targetType === "DEVICE") {
    const [device] = await db.select().from(devices).where(eq(devices.id, input.targetReference)).limit(1);
    if (!device) throw new HttpError(404, "Device target not found");
    if (device.investigationId !== input.investigationId) throw new HttpError(403, "Device does not belong to the investigation");
    throw new HttpError(409, "Real physical-device sanitization is not enabled");
  }
  if (input.targetType === "EVIDENCE") {
    const [evidence] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, input.targetReference)).limit(1);
    if (!evidence) throw new HttpError(404, "Evidence target not found");
    if (evidence.investigationId !== input.investigationId) throw new HttpError(403, "Evidence does not belong to the investigation");
    throw new HttpError(403, "Master forensic evidence is protected from sanitization");
  }
  const [record] = await db.select().from(storageObjects).where(eq(storageObjects.id, input.targetReference)).limit(1);
  if (!record) throw new HttpError(404, "Application record target not found");
  if (record.investigationId !== input.investigationId) throw new HttpError(403, "Record does not belong to the investigation");
  throw new HttpError(409, "Database-record sanitization is not enabled");
}

sanitizationRouter.post("/sanitization/jobs", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(createSanitizationJobSchema), asyncHandler(async (req, res) => {
  const authorization = await getDb().select().from(operationAuthorizations).where(eq(operationAuthorizations.id, req.body.authorizationId)).limit(1).then(([row]) => row);
  if (!authorization) throw new HttpError(404, "Authorization not found");
  if (authorization.investigationId !== req.body.investigationId || authorization.operationType !== "SANITIZATION" || authorization.status !== "APPROVED") throw new HttpError(403, "Approved sanitization authorization is required");
  if (req.user!.role !== "ADMIN" && authorization.requestedBy !== req.user!.sub) throw new HttpError(403, "Authorization was not requested by this investigator");
  const target = await resolveTarget(req.body);
  const job = await service.createSanitizationJob({ ...req.body, requestedBy: req.user!.sub, ...target });
  res.status(201).json({ sanitizationJob: job });
}));

sanitizationRouter.get("/sanitization/jobs/:id", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(idParamSchema, "params"), asyncHandler(async (req, res) => res.json({ sanitizationJob: await assertJobAccess(req.params.id, req.user!.sub, req.user!.role) })));
sanitizationRouter.get("/investigations/:investigationId/sanitization/jobs", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(investigationIdParamSchema, "params"), asyncHandler(async (req, res) => {
  const jobs = await service.listForInvestigation(req.params.investigationId);
  res.json({ sanitizationJobs: req.user!.role === "ADMIN" ? jobs : jobs.filter((job) => job.requestedBy === req.user!.sub) });
}));
sanitizationRouter.post("/sanitization/jobs/:id/execute", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(idParamSchema, "params"), asyncHandler(async (req, res) => {
  await assertJobAccess(req.params.id, req.user!.sub, req.user!.role);
  res.json({ sanitizationJob: await service.enqueueAuthorizedJob(req.params.id, req.user!.sub) });
}));
sanitizationRouter.post("/sanitization/jobs/:id/cancel", requireAuth, requireRole("ADMIN", "INVESTIGATOR"), validate(idParamSchema, "params"), asyncHandler(async (req, res) => {
  await assertJobAccess(req.params.id, req.user!.sub, req.user!.role);
  res.json({ sanitizationJob: await service.cancelJob(req.params.id, req.user!.sub) });
}));
