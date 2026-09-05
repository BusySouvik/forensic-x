import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { auditEvents, recoveryCertificates } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { signingService } from "./signing";

export async function startAnalysis(investigationId: string, actorId: string) {
  const db = getDb();
  const rows = await db.select().from(recoveryCertificates).where(eq(recoveryCertificates.investigationId, investigationId)).orderBy();
  // Find validated certificates
  const validated = rows.filter((r: any) => r.status === "VALIDATED" && r.validationSignature);
  if (validated.length === 0) {
    throw new HttpError(409, "No validated recovery certificates available for analysis");
  }

  // Verify validation signatures
  for (const cert of validated) {
    const payload = { certificateId: cert.id, result: cert.status === "VALIDATED" ? "PASSED" : "FAILED", details: cert.validationDetails };
    const signerId = cert.validationSignerId;
    const sig = cert.validationSignature;
    if (!signerId || !sig || !signingService.verifyPayload(signerId, payload, sig)) {
      throw new HttpError(403, `Invalid validation signature for certificate ${cert.id}`);
    }
  }

  // Record acceptance audit
  await db.insert(auditEvents).values({
    investigationId,
    actorId,
    eventType: "COMPLETED",
    result: "ACCEPTED_FOR_ANALYSIS",
    details: `certificates=${validated.map((c: any) => c.id).join(",")}`,
  });

  return { accepted: true, certificates: validated.map((c: any) => c.id) };
}
