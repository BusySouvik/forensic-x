# Hyperledger Fabric Chaincode Specification — Blockchain Layer #1

This document specifies the minimal chaincode contract and on-chain data model required by FORENSIC‑X's Layer #1 integration. It matches the exact runtime adapter payload and verification semantics implemented in `server/services/ledger.ts` and `server/services/fabricAdapter.ts`.

Do NOT implement chaincode/SDKs blindly — follow this spec exactly so the existing adapter and verification code behave deterministically.

## Canonical on‑chain record

The chaincode MUST persist an immutable acquisition record with the following canonical shape (JSON):

{
  "eventId": "...",
  "eventType": "...",
  "investigationId": "...",
  "evidenceId": "...",
  "acquisitionJobId": "...",
  "masterSha256": "<hex-lowercase-sha256>",
  "eventHash": "<hex-lowercase-sha256>",
  "actorId": "...",
  "authorizationId": null | "...",
  "timestamp": "<ISO-8601 string>",
  "schemaVersion": "forensic-x/ledger-event:1"
}

Clarifications:
- `eventId` is the authoritative idempotency key and MUST equal the PostgreSQL `ledger_events.id` produced by FORENSIC‑X prior to submission.
- `masterSha256` is the SHA‑256 of the verified master image bytes (E01) as stored by FORENSIC‑X in its evidence store; it is an authoritative fingerprint of the binary but is NOT the binary itself.
- `eventHash` is the SHA‑256 of the canonical acquisition event payload (the canonicalized JSON used by FORENSIC‑X via `computeEventHash`). It is a separate digest and must NOT be conflated with `masterSha256`.
- Neither `eventHash` nor `masterSha256` contains the evidence binary. E01 or other raw bytes MUST NEVER be stored on Fabric.
- `schemaVersion` current value: `forensic-x/ledger-event:1`. The trailing `:1` encodes the initial schema version.

## Chaincode functions (exact names)

The Fabric adapter in `fabricAdapter.ts` calls two transaction names. Chaincode MUST implement both functions with the semantics below.

1) `RecordAcquisitionEvent` — accepts a single argument: a JSON‑serialized string containing the canonical acquisition record (see above). The adapter calls `tx.submit(JSON.stringify(payload))` where `payload` is the object shown in the canonical record.

Signature (conceptual):
RecordAcquisitionEvent(payloadJson: string) => bytes

2) `GetAcquisitionEvent` — accepts a single argument: `eventId` (string) and returns the stored record serialized as JSON if present.

Signature (conceptual):
GetAcquisitionEvent(eventId: string) => bytes | null

The adapter expects `GetAcquisitionEvent` to return a JSON object where field names may be either camelCase (`eventHash`, `masterSha256`) or snake_case (`event_hash`, `master_sha256`). Both forms should be supported by the adapter; chaincode should use camelCase by default.

## RecordAcquisitionEvent behavior

- Require a non-empty `eventId`. If `eventId` is missing or empty, reject with an application error (see Error Semantics).
- Require a non-empty `eventHash`. If missing, reject with `INVALID_ARGUMENT`.
- Require a non-empty `masterSha256`. If missing, reject with `INVALID_ARGUMENT`.
- Validate `eventType` is present and equals `ACQUISITION`. Reject otherwise.
- Enforce idempotency: if a record with the same `eventId` already exists, do NOT overwrite it. Instead return `DUPLICATE_EVENT` (see response schema).
- Persist the complete immutable acquisition record atomically and return a deterministic success response payload.
- Do NOT store or return private keys, credentials, TLS roots, or any sensitive material.
- Chaincode MUST NOT generate or rely on external transaction ids for idempotency — `eventId` is the idempotency key supplied by the application (PostgreSQL). Fabric transaction id is provided by the Fabric runtime and, if desired, may be returned as metadata but is not the source of truth for idempotency.

Suggested chaincode returns (JSON) for `RecordAcquisitionEvent`:
- Success (new record created): `{ "status": "SUCCESS" }`
- Duplicate (record exists): `{ "status": "DUPLICATE_EVENT" }`
- Invalid/missing argument: `{ "status": "INVALID_ARGUMENT", "error": "..." }`
- Other application error: `{ "status": "COMMIT_FAILED", "error": "..." }`

Note: the Fabric runtime assigns a transaction id to each invocation; chaincode may return additional metadata if useful, but FORENSIC‑X treats the chaincode return as opaque — the adapter only uses the adapter-level LedgerAdapterResult.status and does not parse chaincode return fields today.

## GetAcquisitionEvent behavior

- Return the stored immutable record keyed by `eventId` as JSON when present.
- If the `eventId` is not present, return a NOT_FOUND semantic (null or empty payload). The adapter treats absence as `NOT_FOUND`.
- Do NOT modify the record on reads.
- Do NOT return private keys, credentials, or other secrets.

Recommended Response:
- Found: HTTP-like 200 payload: JSON record (canonical form above).
- Not found: return empty (no payload) or explicit `{ "status": "NOT_FOUND" }` — the adapter maps a falsy response to `NOT_FOUND`.

## Verification semantics (how FORENSIC‑X verifies on‑chain anchors)

FORENSIC‑X's `verifyAcquisitionAnchor(eventId, expectedEventHash?)` implements the following exact semantics and MUST be supported by the chaincode behavior:

- MATCH: both of these conditions are true:
  - on‑chain `eventHash` == local `ledger_events.event_hash` (or the optional `expectedEventHash` when provided to the verifier)
  - on‑chain `masterSha256` == authoritative local master image SHA‑256 (`evidence_records.sha256`)

- MISMATCH: either the `eventHash` or the `masterSha256` differs between on‑chain and local authoritative values.

- NOT_FOUND: the `eventId` does not exist on Fabric (get returns null / no record).

- UNAVAILABLE: the Fabric adapter cannot be contacted or throws an error during query.

Important: Do NOT compare `eventHash` to `masterSha256`. They are different digests with different meanings and must be compared separately.

## Data model and state key

- State key: `eventId` (string). Store the canonical JSON record under the ledger key equal to `eventId`.
- Why `eventId` as idempotency key: the PostgreSQL `ledger_events.id` is assigned deterministically by the application prior to chain submission and guarantees a stable, unique identifier that the chaincode can use to detect and reject duplicates.

Stored fields (types):
- `eventId`: string (primary state key)
- `eventType`: string (e.g., `ACQUISITION`)
- `investigationId`: string
- `evidenceId`: string
- `acquisitionJobId`: string
- `masterSha256`: string (hex lowercase SHA‑256)
- `eventHash`: string (hex lowercase SHA‑256 computed over the canonicalized payload)
- `actorId`: string
- `authorizationId`: string | null
- `timestamp`: string (ISO‑8601)
- `schemaVersion`: string (current: `forensic-x/ledger-event:1`)

All fields should be stored as plain strings (no binary blobs) to keep the ledger readable and portable.

## Security considerations

- NEVER store evidence binaries (E01 or raw bytes) on the ledger.
- NEVER store private keys, credentials, or any secret material in chaincode state or logs.
- Limit on‑chain data to non-sensitive metadata and cryptographic fingerprints only.
- Use Fabric MSP identities and signatures for transaction provenance; chaincode can rely on the submitting identity for audit but MUST NOT store credentials on-chain.
- TLS is required for production Fabric gateway connectivity. The Fabric adapter enforces TLS when a TLS root certificate is supplied; production deployments MUST use TLS and validated CAs.

## Versioning

- `schemaVersion` is included in each record. Current value used by FORENSIC‑X: `forensic-x/ledger-event:1`.
- Future schema changes MUST increment the version (for example `forensic-x/ledger-event:2`) rather than silently changing field meanings.

## Endorsement / transaction semantics

- Submission (successfully sending a transaction to endorse/order) is NOT equivalent to commit confirmation. FORENSIC‑X treats a `SUBMITTED` adapter result as pending; only `CONFIRMED` should be treated as committed.
- Chaincode must not attempt to assert commit status back to the application; commit confirmation is provided by the Fabric ordering/endorsement/commit pipeline and should be observed by the client SDK where possible.
- FORENSIC‑X stores Fabric transaction id (`blockchain_tx_id`) only when the adapter returns it. The chaincode may choose to include transaction metadata in logs or return bytes, but the authoritative tx id is the Fabric runtime's tx id.

## Error semantics (application-level)

Chaincode should return clear application-level errors which the adapter maps to these categories:

- `SUCCESS` — record persisted (new record created).
- `DUPLICATE_EVENT` — a record with `eventId` already exists. Do not overwrite.
- `INVALID_ARGUMENT` — missing/invalid required fields (e.g., `eventId`, `eventHash`, `masterSha256`, wrong `eventType`).
- `NOT_FOUND` — requested `eventId` not present (for `GetAcquisitionEvent`).
- `FABRIC_UNAVAILABLE` — network/gateway not reachable (this is a runtime adapter/network error rather than a chaincode logic error).
- `COMMIT_FAILED` — transaction was submitted but failed to commit.

Distinguish network/SDK errors (adapter-level `UNAVAILABLE`/`FAILED`) from application validation errors (`INVALID_ARGUMENT`, `DUPLICATE_EVENT`).

## Developer notes for chaincode implementers

- Implement `RecordAcquisitionEvent` to accept a single JSON string argument and parse the fields listed in this document.
- Validate required fields and return deterministic JSON status codes as described above.
- Store records keyed by `eventId` and ensure `eventId` uniqueness (reject duplicates with `DUPLICATE_EVENT`).
- Implement `GetAcquisitionEvent` to return the stored JSON record.
- Keep chaincode free of any binary evidence and secrets. Use MSP identity for provenance only.

## Appendix — Example payload submitted by FORENSIC‑X adapter

The adapter submits the following object (JSON‑serialized) to `RecordAcquisitionEvent`:

```json
{
  "eventId": "<ledger_events.id>",
  "eventType": "ACQUISITION",
  "investigationId": "...",
  "evidenceId": "...",
  "acquisitionJobId": "...",
  "masterSha256": "...",
  "eventHash": "...",
  "actorId": "...",
  "authorizationId": null,
  "timestamp": "2026-09-04T12:34:56.000Z",
  "schemaVersion": "forensic-x/ledger-event:1"
}
```

The adapter expects `GetAcquisitionEvent(eventId)` to return the same fields when present. The verifier in `ledger.ts` will compare `eventHash` and `masterSha256` separately against local authoritative values.

---

Document prepared to match existing FORENSIC‑X adapter and verification code (see `server/services/ledger.ts` and `server/services/fabricAdapter.ts`).
