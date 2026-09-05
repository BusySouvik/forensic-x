**Blockchain Layer #1 — Acquisition Verification / Anchor**

Summary
- Purpose: Anchor an immutable acquisition verification event into Hyperledger Fabric while keeping binary evidence and certificates off-chain.
- PostgreSQL: operational/index layer (existing `ledger_events` table remains authoritative for the application). Fabric: immutable anchor layer.

Design & scope
- The code provides a clear adapter boundary at `server/services/fabricAdapter.ts` and uses a lazily-initialized adapter from `server/services/ledger.ts`.
- Fabric integration is environment-dependent: when required env vars or client packages are missing, the adapter reports `UNAVAILABLE` and no fake transaction IDs are produced.

What changed (local workspace)
- New files:
  - server/services/fabricAdapter.ts — dynamic Fabric adapter factory (production-grade skeleton using official client when available).
  - server/services/ledger_fabric.test.ts — unit tests exercising adapter behaviors via a test double.
  - types/fabric-shims.d.ts — ambient module shims for optional Fabric packages (prevents TS errors when packages are absent).
  - docs/blockchain-layer1.md — this document.
- Updated:
  - server/services/ledger.ts — uses lazy Fabric adapter and exposes `verifyAcquisitionAnchor()`; test injection helper `setAdapterForTests()`.

Dependencies
- The production adapter uses the official Fabric Gateway and gRPC packages at runtime when available:
  - `@hyperledger/fabric-gateway` (required for real Fabric integration)
  - `@grpc/grpc-js` (gRPC transport)

These packages are NOT added to the repository automatically. Install them when you want to enable a real Fabric connection:

```bash
pnpm add @hyperledger/fabric-gateway @grpc/grpc-js
```

Configuration (environment variables)
- `FABRIC_GATEWAY_URL` — host:port of the Fabric peer/gateway (e.g. `peer0.org1.example.com:7051`).
- `FABRIC_MSP_ID` — MSP ID for the submitting identity (e.g. `Org1MSP`).
- `FABRIC_IDENTITY_CERT_PATH` — filesystem path to the identity certificate PEM.
- `FABRIC_IDENTITY_PRIVATE_KEY_PATH` — filesystem path to the identity private key PEM.
- `FABRIC_TLS_ROOT_CERT_PATH` — TLS root CA PEM to validate the peer TLS certificate. NOTE: this is REQUIRED in production; for local development you may set `FABRIC_ALLOW_INSECURE_TLS=true` to allow insecure connections (not recommended for production).
- `FABRIC_CHANNEL` — channel name (e.g. `mychannel`).
- `FABRIC_CHAINCODE` — chaincode name that implements `RecordAcquisitionEvent` and `GetAcquisitionEvent` functions.

Security notes
- Do NOT commit private keys, certificates, or other secrets to source control.
- The adapter validates presence of required env vars; when missing, it returns `UNAVAILABLE`.
- The production adapter reads identity material from the filesystem and uses the Fabric Gateway signer API — private keys never get sent in API responses or logs.

Chaincode expectations
- Chaincode should provide at least two functions:
  - `RecordAcquisitionEvent(payload)` — idempotent creation; must reject duplicate event IDs.
  - `GetAcquisitionEvent(eventId)` — returns canonical record JSON with `masterSha256` (or `eventHash`).

Testing
- Unit tests mock the adapter boundary; no real Fabric network is required for the Vitest suite.
- Files changed include `server/services/ledger_fabric.test.ts` which uses `setAdapterForTests()` to exercise behaviors: CONFIRMED, UNAVAILABLE, and verification MATCH/MISMATCH.

Developer integration steps (with a real Fabric network)
1. Install Fabric packages:
   ```bash
   pnpm add @hyperledger/fabric-gateway @grpc/grpc-js
   ```
2. Set environment variables documented above pointing to a valid gateway endpoint and identity files.
  - Ensure `FABRIC_TLS_ROOT_CERT_PATH` is set for production; do NOT set `FABRIC_ALLOW_INSECURE_TLS` in production environments.
3. Start the app or run a focused test that uses real Fabric (integration tests should be gated and not part of normal unit test runs).

Notes
- The adapter factory is deliberately fault-tolerant: when packages or env vars are missing, it returns an `UNAVAILABLE` adapter rather than crashing the service.
- This implementation keeps the interface clear so a real production adapter can be swapped in without changing the rest of the application.
