import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { operationAuthorizations } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { getInvestigation } from "./investigations";
import { assertDeviceInInvestigation } from "./devices";
import type { AuthorizationStatus, OperationType } from "../../shared/types";

export async function listAuthorizations(filters?: { investigationId?: string; status?: AuthorizationStatus }) {
  const db = getDb();
  const rows = await db
    .select()
    .from(operationAuthorizations)
    .orderBy(desc(operationAuthorizations.requestedAt));

  return rows.filter((row) => {
    if (filters?.investigationId && row.investigationId !== filters.investigationId) {
      return false;
    }
    if (filters?.status && row.status !== filters.status) {
      return false;
    }
    return true;
  });
}

export async function listAuthorizationsForInvestigation(investigationId: string) {
  await getInvestigation(investigationId);
  return listAuthorizations({ investigationId });
}

export async function getAuthorizationById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(operationAuthorizations).where(eq(operationAuthorizations.id, id)).limit(1);
  return row ?? null;
}

export async function requestAuthorization(input: {
  investigationId: string;
  deviceId?: string | null;
  requestedBy: string;
  operationType: OperationType;
  reason: string;
  expiresAt?: string | null;
}) {
  await getInvestigation(input.investigationId);
  if (input.deviceId) {
    await assertDeviceInInvestigation(input.deviceId, input.investigationId);
  }

  const db = getDb();
  const [created] = await db
    .insert(operationAuthorizations)
    .values({
      investigationId: input.investigationId,
      deviceId: input.deviceId ?? null,
      requestedBy: input.requestedBy,
      operationType: input.operationType,
      reason: input.reason,
      status: "PENDING",
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();
  if (!created) {
    throw new HttpError(500, "Failed to create authorization");
  }
  return created;
}

export async function decideAuthorization(
  id: string,
  decision: "APPROVED" | "DENIED",
  approvedBy: string,
  expiresAt?: string | null,
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(operationAuthorizations)
    .where(eq(operationAuthorizations.id, id))
    .limit(1);
  if (!existing) {
    throw new HttpError(404, "Authorization not found");
  }
  if (existing.status !== "PENDING") {
    throw new HttpError(409, "Authorization is no longer pending");
  }

  const [updated] = await db
    .update(operationAuthorizations)
    .set({
      status: decision,
      approvedBy,
      approvedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : existing.expiresAt,
    })
    .where(eq(operationAuthorizations.id, id))
    .returning();
  if (!updated) {
    throw new HttpError(500, "Failed to update authorization");
  }
  return updated;
}
