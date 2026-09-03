import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { investigations } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import type { InvestigationStatus } from "../../shared/types";

export async function listInvestigations() {
  const db = getDb();
  return db.select().from(investigations).orderBy(desc(investigations.createdAt));
}

export async function getInvestigation(id: string) {
  const db = getDb();
  const [row] = await db.select().from(investigations).where(eq(investigations.id, id)).limit(1);
  if (!row) {
    throw new HttpError(404, "Investigation not found");
  }
  return row;
}

export async function createInvestigation(input: {
  investigationNumber: string;
  title: string;
  description: string;
  status: InvestigationStatus;
  createdBy: string;
}) {
  const db = getDb();
  try {
    const [created] = await db
      .insert(investigations)
      .values({
        investigationNumber: input.investigationNumber,
        title: input.title,
        description: input.description,
        status: input.status,
        createdBy: input.createdBy,
      })
      .returning();
    if (!created) {
      throw new HttpError(500, "Failed to create investigation");
    }
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "Investigation number already exists");
    }
    throw error;
  }
}

export async function updateInvestigation(
  id: string,
  input: { title?: string; description?: string; status?: InvestigationStatus },
) {
  await getInvestigation(id);
  const db = getDb();
  const [updated] = await db
    .update(investigations)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(investigations.id, id))
    .returning();
  if (!updated) {
    throw new HttpError(500, "Failed to update investigation");
  }
  return updated;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
