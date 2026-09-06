import { eq } from "drizzle-orm";
import type { WorkflowStage } from "../../shared/types";
import { getDb } from "../db";
import { auditEvents, investigationWorkflows, investigations, users } from "../db/schema";
import { HttpError } from "../middleware/httpError";

const columnForStage = {
  ACQUISITION: "acquisitionInvestigatorId",
  RECOVERY: "recoveryInvestigatorId",
  VALIDATION: "validationInvestigatorId",
  ANALYSIS: "analysisInvestigatorId",
} as const;

export async function getWorkflow(investigationId: string) {
  const db = getDb();
  const [workflow] = await db.select().from(investigationWorkflows).where(eq(investigationWorkflows.investigationId, investigationId)).limit(1);
  if (!workflow) throw new HttpError(409, "Investigation workflow has not been configured");
  return workflow;
}

export async function assertStageAccess(investigationId: string, userId: string, stage: WorkflowStage) {
  const workflow = await getWorkflow(investigationId);
  if (workflow[columnForStage[stage]] !== userId) throw new HttpError(403, "User is not assigned to the " + stage.toLowerCase() + " stage");
  return workflow;
}

export async function configureWorkflow(input: {
  investigationId: string; actorId: string; acquisitionInvestigatorId: string; recoveryInvestigatorId: string;
  validationInvestigatorId: string; analysisInvestigatorId: string;
}) {
  const db = getDb();
  const [investigation] = await db.select({ id: investigations.id }).from(investigations).where(eq(investigations.id, input.investigationId)).limit(1);
  if (!investigation) throw new HttpError(404, "Investigation not found");
  const ids = [input.acquisitionInvestigatorId, input.recoveryInvestigatorId, input.validationInvestigatorId, input.analysisInvestigatorId];
  if (input.validationInvestigatorId === input.recoveryInvestigatorId) {
    throw new HttpError(400, "Validation must be assigned to an investigator independent from recovery");
  }
  const selected = await db.select({ id: users.id, role: users.role }).from(users);
  for (const id of ids) {
    const user = selected.find((item) => item.id === id);
    if (!user) throw new HttpError(404, "Assigned investigator not found");
    if (user.role !== "INVESTIGATOR") throw new HttpError(400, "Workflow assignments require INVESTIGATOR users");
  }
  const values = {
    acquisitionInvestigatorId: input.acquisitionInvestigatorId, recoveryInvestigatorId: input.recoveryInvestigatorId,
    validationInvestigatorId: input.validationInvestigatorId, analysisInvestigatorId: input.analysisInvestigatorId, updatedAt: new Date(),
  };
  const [existing] = await db.select().from(investigationWorkflows).where(eq(investigationWorkflows.investigationId, input.investigationId)).limit(1);
  const [workflow] = existing
    ? await db.update(investigationWorkflows).set({ ...values, version: existing.version + 1 }).where(eq(investigationWorkflows.investigationId, input.investigationId)).returning()
    : await db.insert(investigationWorkflows).values({ investigationId: input.investigationId, ...values }).returning();
  await db.insert(auditEvents).values({
    investigationId: input.investigationId, actorId: input.actorId, eventType: "AUTHORIZED", result: "WORKFLOW_CONFIGURED",
    details: "acquisition=" + input.acquisitionInvestigatorId + "; recovery=" + input.recoveryInvestigatorId + "; validation=" + input.validationInvestigatorId + "; analysis=" + input.analysisInvestigatorId,
  });
  return workflow;
}
