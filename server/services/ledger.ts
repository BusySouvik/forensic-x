import { createHash } from "node:crypto";
import { getDb } from "../db";
import { ledger_events, evidenceRecords } from "../db/schema";
import { eq } from "drizzle-orm";
import createFabricAdapter from "./fabricAdapter";

// Create a promise for a lazily initialized Fabric adapter. The factory inspects
// environment variables and dynamically imports the official Fabric packages
// if available. This keeps tests and development working when Fabric packages
// are not installed.
const adapterPromise = createFabricAdapter();

export type LedgerStatus = "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED" | "UNAVAILABLE";

export type LedgerEvent = {
  id: string;
  investigationId: string;
  evidenceId: string;
  acquisitionJobId: string;
  eventType: string;
  eventHash: string;
  payload: any;
  network?: string | null;
  channel?: string | null;
  chaincode?: string | null;
  blockchainTxId?: string | null;
  status: LedgerStatus;
  anchoredAt?: Date | null;
  createdAt: Date;
};

export interface LedgerAdapterResult {
  status: LedgerStatus;
  txId?: string;
  error?: string;
}

export interface LedgerAdapter {
  recordEvent(payload: any): Promise<LedgerAdapterResult>;
  getEvent?(id: string): Promise<any>;
}

// Simple canonicalization: sort object keys recursively and produce stable JSON
function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map((v) => canonicalize(v)).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",")}}`;
}

export function computeEventHash(payload: any) {
  const canon = canonicalize(payload);
  return createHash("sha256").update(canon).digest("hex");
}

// Fabric adapter placeholder: reports UNAVAILABLE in this environment
// Delegating adapter that forwards calls to the lazily-initialized adapter.
class DelegatingAdapter implements LedgerAdapter {
  async recordEvent(payload: any): Promise<LedgerAdapterResult> {
    const a = await adapterPromise;
    return a.recordEvent(payload);
  }
  async getEvent(id: string): Promise<any> {
    const a = await adapterPromise;
    if (!a.getEvent) throw new Error("getEvent not implemented by adapter");
    return a.getEvent(id);
  }
}

let adapter: LedgerAdapter = new DelegatingAdapter();

// Test helper to replace the adapter at runtime (only used in tests).
export function setAdapterForTests(a: LedgerAdapter) {
  adapter = a;
}

export async function recordAcquisitionEvent(input: {
  investigationId: string;
  evidenceId: string;
  acquisitionJobId: string;
  deviceId?: string | null;
  masterSha256: string;
  masterSize: number;
  actorId: string;
  authorizationId?: string | null;
  timestamp?: Date;
}) {
  const db = getDb();

  const payload = {
    schema: "forensic-x/ledger-event:1",
    eventType: "ACQUISITION",
    investigationId: input.investigationId,
    evidenceId: input.evidenceId,
    acquisitionJobId: input.acquisitionJobId,
    deviceId: input.deviceId ?? null,
    masterSha256: input.masterSha256,
    masterSize: input.masterSize,
    actorId: input.actorId,
    authorizationId: input.authorizationId ?? null,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
  };

  const eventHash = computeEventHash(payload);

  // Attempt an atomic insert; if a concurrent process already inserted a row for
  // this acquisitionJobId, ON CONFLICT DO NOTHING ensures only one row is created.
  const inserted = await db
    .insert(ledger_events)
    .values({
      investigationId: input.investigationId,
      evidenceId: input.evidenceId,
      acquisitionJobId: input.acquisitionJobId,
      event_type: "ACQUISITION",
      event_hash: eventHash,
      payload: payload,
      status: "PENDING",
    })
    .onConflictDoNothing()
    .returning();

  let row = inserted[0];
  if (!row) {
    // Another process inserted the event concurrently — return that existing row.
    const rows = await db.select().from(ledger_events).where(eq(ledger_events.acquisitionJobId, input.acquisitionJobId)).limit(1);
    return rows[0] ?? null;
  }
  // Build the immutable adapter payload including the deterministic eventId (DB id)
  const adapterPayload = {
    eventId: row.id,
    eventType: "ACQUISITION",
    investigationId: input.investigationId,
    evidenceId: input.evidenceId,
    acquisitionJobId: input.acquisitionJobId,
    masterSha256: input.masterSha256,
    eventHash: eventHash,
    actorId: input.actorId,
    authorizationId: input.authorizationId ?? null,
    timestamp: payload.timestamp,
    schemaVersion: "forensic-x/ledger-event:1",
  };

  // attempt to submit to Fabric (adapter may report UNAVAILABLE).
  // The adapter contract distinguishes SUBMITTED vs CONFIRMED. If the
  // underlying SDK cannot confirm commit, the adapter should return SUBMITTED.
  const result = await adapter
    .recordEvent(adapterPayload)
    .catch((err): LedgerAdapterResult => ({ status: "FAILED", error: typeof err === "string" ? err : err?.message ?? String(err) }));

  // Update DB according to explicit adapter result semantics.
  if (result.status === "CONFIRMED") {
    // commit confirmed -> set anchored_at
    await db.update(ledger_events).set({ status: "CONFIRMED", blockchain_tx_id: result.txId ?? null, anchored_at: new Date() }).where(eq(ledger_events.id, row.id)).returning();
  } else if (result.status === "SUBMITTED") {
    // submitted but not yet confirmed
    await db.update(ledger_events).set({ status: "SUBMITTED", blockchain_tx_id: result.txId ?? null }).where(eq(ledger_events.id, row.id)).returning();
  } else if (result.status === "UNAVAILABLE") {
    await db.update(ledger_events).set({ status: "UNAVAILABLE" }).where(eq(ledger_events.id, row.id)).returning();
  } else {
    await db.update(ledger_events).set({ status: "FAILED", blockchain_tx_id: result.txId ?? null }).where(eq(ledger_events.id, row.id)).returning();
  }

  const [saved] = await db.select().from(ledger_events).where(eq(ledger_events.id, row.id)).limit(1);
  return saved;
}

export async function getLedgerEventByAcquisition(acquisitionJobId: string) {
  const db = getDb();
  const rows = await db.select().from(ledger_events).where(eq(ledger_events.acquisitionJobId, acquisitionJobId)).limit(1);
  return rows[0] ?? null;
}

export async function verifyLedgerEvent(eventId: string) {
  const db = getDb();
  const [row] = await db.select().from(ledger_events).where(eq(ledger_events.id, eventId)).limit(1);
  if (!row) throw new Error("Event not found");
  const recomputed = computeEventHash(row.payload);
  return { match: recomputed === row.event_hash, recomputed };
}

export type AnchorVerification = "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE";

export async function verifyAcquisitionAnchor(eventId: string, expectedEventHash?: string): Promise<{ status: AnchorVerification; details?: { eventHashMatch?: boolean; masterShaMatch?: boolean }; onChain?: any }> {
  const db = getDb();
  const [row] = await db.select().from(ledger_events).where(eq(ledger_events.id, eventId)).limit(1);
  if (!row) return { status: "NOT_FOUND" };

  // authoritative master SHA is in evidence_records.sha256
  const [evidence] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, row.evidenceId)).limit(1);
  if (!evidence) {
    // authoritative master hash missing in DB schema for this event
    return { status: "MISMATCH", details: { eventHashMatch: false, masterShaMatch: false } };
  }

  try {
    if (!adapter || !adapter.getEvent) return { status: "UNAVAILABLE" };
    const onChain = await adapter.getEvent(eventId);
    if (!onChain) return { status: "NOT_FOUND" };

    const chainEventHash = onChain.eventHash ?? onChain.event_hash ?? null;
    const chainMasterSha = onChain.masterSha256 ?? onChain.master_sha256 ?? null;

    const localEventHash = expectedEventHash ?? row.event_hash;
    const localMasterSha = evidence.sha256;

    const eventHashMatch = Boolean(chainEventHash && localEventHash && chainEventHash === localEventHash);
    const masterShaMatch = Boolean(chainMasterSha && localMasterSha && chainMasterSha === localMasterSha);

    if (eventHashMatch && masterShaMatch) return { status: "MATCH", details: { eventHashMatch, masterShaMatch }, onChain };
    return { status: "MISMATCH", details: { eventHashMatch, masterShaMatch }, onChain };
  } catch (err) {
    return { status: "UNAVAILABLE" };
  }
}

export const _internal = { canonicalize, computeEventHash, adapter, setAdapterForTests };
