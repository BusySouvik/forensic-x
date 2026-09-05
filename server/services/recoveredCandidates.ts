import { getDb } from "../db";
import { recoveredCandidates } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import type { RecoveryMethod, RecoveryEngine } from "../../shared/types";

export type RecoveredCandidateInput = {
  investigationId: string;
  recoveryJobId: string;
  workingCopyId: string;
  masterEvidenceId: string;
  method: RecoveryMethod;
  engine: RecoveryEngine;
  sourcePath?: string | null;
  sourceOffset?: number | null;
  sourceMetadata?: string | null;
  recoveredPath?: string | null;
  size?: number | null;
  storageObjectId?: string | null;
  provisionalSha256?: string | null;
  status?: "PENDING" | "COLLECTED" | "FAILED";
  provenance?: Record<string, unknown>;
};

export async function insertRecoveredCandidates(items: RecoveredCandidateInput[]) {
  const db = getDb();
  try {
    const rows = items.map((it) => ({
      investigationId: it.investigationId,
      recoveryJobId: it.recoveryJobId,
      workingCopyId: it.workingCopyId,
      masterEvidenceId: it.masterEvidenceId,
      method: it.method,
      engine: it.engine,
      sourcePath: it.sourcePath ?? null,
      sourceOffset: it.sourceOffset ?? null,
      sourceMetadata: it.sourceMetadata ?? null,
      recoveredPath: it.recoveredPath ?? null,
      size: it.size ?? null,
      storageObjectId: it.storageObjectId ?? null,
      provisionalSha256: it.provisionalSha256 ?? null,
      status: it.status ?? "PENDING",
      provenance: it.provenance ?? {},
    }));

    await db.insert(recoveredCandidates).values(rows).returning();
  } catch (error) {
    throw new HttpError(500, `Failed to persist recovered candidates: ${error instanceof Error ? error.message : String(error)}`);
  }
}
